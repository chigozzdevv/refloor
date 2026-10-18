import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { z } from 'zod';
import { buildingSchema } from '@refloor/scene/schema';
import { generationUsageSchema } from '@refloor/scene/contracts';
import type { GenerationRequest } from '@refloor/scene/contracts';
import type { ServerConfig } from '@refloor/server/shared/config/env';
import type { HouseService } from '@refloor/server/features/houses/house.service';
import type { GenerationRepository } from '@refloor/server/features/generation/generation.repo';
import { generationDocument } from '@refloor/server/features/generation/generation.model';
import { ApiError } from '@refloor/server/shared/http/errors';
import { fingerprint } from '@refloor/server/shared/database/fingerprint';

const workerMessage = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('progress'),
    status: z.enum(['layout', 'validating']),
    usage: generationUsageSchema,
  }),
  z.strictObject({
    type: z.literal('complete'),
    building: buildingSchema,
    usage: generationUsageSchema,
  }),
  z.strictObject({
    type: z.literal('failed'),
    error: z.string(),
    usage: generationUsageSchema.nullable(),
  }),
]);

export class GenerationService {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<void> | undefined;
  private worker: Worker | undefined;
  private closed = false;
  constructor(
    private readonly jobs: GenerationRepository,
    private readonly houses: HouseService,
    private readonly ai: ServerConfig['ai'],
    private readonly report: (error: unknown) => void,
  ) {}

  async create(ownerId: string, input: GenerationRequest) {
    const digest = fingerprint({ prompt: input.prompt });
    const previous = await this.jobs.findRequest(ownerId, input.requestId);
    if (previous) {
      if (previous.fingerprint !== digest)
        throw new ApiError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'This request ID belongs to a different description.',
        );
      return generationDocument(previous);
    }
    if (!this.ai)
      throw new ApiError(
        503,
        'GENERATION_UNAVAILABLE',
        'Add OPENAI_API_KEY on the server to enable Luna generation.',
      );
    const now = new Date();
    const record = {
      _id: randomUUID(),
      ownerId,
      requestId: input.requestId,
      fingerprint: digest,
      prompt: input.prompt,
      status: 'queued' as const,
      projectId: null,
      error: null,
      usage: null,
      active: true,
      createdAt: now,
      deadline: null,
      expiresAt: new Date(now.getTime() + 86400000),
    };
    if (!(await this.jobs.insert(record))) {
      const repeated = await this.jobs.findRequest(ownerId, input.requestId);
      if (repeated) {
        if (repeated.fingerprint !== digest)
          throw new ApiError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'This request ID belongs to a different description.',
          );
        return generationDocument(repeated);
      }
      throw new ApiError(
        409,
        'GENERATION_ACTIVE',
        'A house is already being generated in this session. Wait for it to finish.',
      );
    }
    this.tick();
    return generationDocument(record);
  }

  async get(ownerId: string, id: string) {
    const record = await this.jobs.find(ownerId, id);
    if (!record)
      throw new ApiError(
        404,
        'GENERATION_NOT_FOUND',
        'This generation is not available in this session.',
      );
    return generationDocument(record);
  }

  start() {
    if (this.ai) {
      this.timer = setInterval(() => this.tick(), 1000).unref();
      this.tick();
    }
  }
  private tick() {
    if (this.closed || this.running || !this.ai) return;
    this.running = this.run()
      .catch(this.report)
      .finally(() => {
        this.running = undefined;
      });
  }
  private async run() {
    const job = await this.jobs.claim();
    if (!job || !this.ai || this.closed) return;
    try {
      const source = new URL('./generation.worker.ts', import.meta.url);
      const worker = new Worker(
        existsSync(source) ? source : new URL('./generation.worker.js', import.meta.url),
        {
          workerData: { id: job._id, prompt: job.prompt, ...this.ai },
          ...(existsSync(source) ? { execArgv: ['--import', 'tsx'] } : {}),
          resourceLimits: { maxOldGenerationSizeMb: 512 },
        },
      );
      this.worker = worker;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Generation exceeded its two-minute time limit.')),
          120000,
        );
        let received = false;
        let updates = Promise.resolve();
        worker.on('message', (data: unknown) => {
          updates = updates
            .then(async () => {
              const message = workerMessage.parse(data);
              if (received) return;
              if (message.type === 'progress')
                await this.jobs.update(job._id, { status: message.status, usage: message.usage });
              else {
                received = true;
                if (message.type === 'failed') {
                  await this.jobs.update(job._id, { usage: message.usage });
                  throw new Error(message.error);
                }
                await this.jobs.update(job._id, { status: 'saving', usage: message.usage });
                const saved = await this.houses.create(job.ownerId, {
                  requestId: job._id,
                  building: message.building,
                });
                await this.jobs.update(job._id, {
                  status: 'complete',
                  active: false,
                  projectId: saved.project.id,
                });
                resolve();
              }
            })
            .catch(reject);
        });
        worker.once('error', reject);
        worker.once('exit', () => {
          void updates.then(() => {
            if (!received) reject(new Error('The generation worker stopped before completing.'));
          });
        });
        void new Promise<void>((done) => worker.once('exit', () => done())).finally(() =>
          clearTimeout(timeout),
        );
      });
    } catch (error) {
      await this.jobs.update(job._id, {
        status: 'failed',
        active: false,
        error:
          error instanceof Error ? error.message.slice(0, 500) : 'Generation could not complete.',
      });
    } finally {
      await this.worker?.terminate();
      this.worker = undefined;
    }
  }
  async close() {
    this.closed = true;
    clearInterval(this.timer);
    await this.worker?.terminate();
    await this.running;
  }
}
