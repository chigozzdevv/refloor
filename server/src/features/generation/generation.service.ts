import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { MessageChannel, Worker } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import type { GenerationRequest } from '@refloor/scene/contracts';
import type { ServerConfig } from '@refloor/server/shared/config/env';
import type { HouseService } from '@refloor/server/features/houses/house.service';
import type { GenerationRepository } from '@refloor/server/features/generation/generation.repo';
import { generationDocument } from '@refloor/server/features/generation/generation.model';
import { ApiError } from '@refloor/server/shared/http/errors';
import { fingerprint } from '@refloor/server/shared/database/fingerprint';
import {
  GenerationWorkerFailure,
  receiveGeneration,
} from '@refloor/server/features/generation/generation.channel';
import { generationFailureMessage } from '@refloor/server/features/generation/generation.error';

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
        'Add OPENAI_API_KEY on the server to enable house generation.',
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
    const update = (change: Parameters<GenerationRepository['update']>[1]) =>
      this.jobs.update(job._id, change, job.deadline!);
    let results: MessagePort | undefined;
    let output: MessagePort | undefined;
    try {
      if (job.recoveries) {
        const savedId = await this.houses.createdProjectId(job.ownerId, job._id);
        if (savedId) {
          await update({ status: 'complete', active: false, projectId: savedId });
          return;
        }
      }
      const source = new URL('./generation.worker.ts', import.meta.url);
      const { port1, port2 } = new MessageChannel();
      results = port1;
      output = port2;
      const worker = new Worker(
        existsSync(source) ? source : new URL('./generation.worker.js', import.meta.url),
        {
          workerData: { id: job._id, prompt: job.prompt, ...this.ai, resultPort: port2 },
          transferList: [port2],
          ...(existsSync(source) ? { execArgv: ['--import', 'tsx'] } : {}),
          resourceLimits: { maxOldGenerationSizeMb: 512 },
        },
      );
      this.worker = worker;
      worker.on('error', this.report);
      const result = await receiveGeneration(worker, port1, async (message) => {
        const changed = await update({ status: message.status, usage: message.usage });
        if (!changed.matchedCount) throw new Error('The generation lease has expired.');
      });
      const changed = await update({ status: 'saving', usage: result.usage });
      if (!changed.matchedCount) throw new Error('The generation lease has expired.');
      const saved = await this.houses.create(job.ownerId, {
        requestId: job._id,
        building: result.building,
      });
      await update({
        status: 'complete',
        active: false,
        projectId: saved.project.id,
      });
    } catch (error) {
      this.report(error);
      await update({
        status: 'failed',
        active: false,
        error: generationFailureMessage(error),
        ...(error instanceof GenerationWorkerFailure ? { usage: error.usage } : {}),
      });
    } finally {
      results?.close();
      output?.close();
      await this.worker?.terminate();
      this.worker?.off('error', this.report);
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
