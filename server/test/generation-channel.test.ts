import { once } from 'node:events';
import { createRequire } from 'node:module';
import { MessageChannel, Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { createHouse } from '@refloor/catalogue/houses';
import {
  GenerationWorkerFailure,
  receiveGeneration,
} from '@refloor/server/features/generation/generation.channel';
import {
  generationFailureFallback,
  generationFailureMessage,
} from '@refloor/server/features/generation/generation.error';

const usage = {
  model: 'generation-channel-test',
  responseId: 'response-channel-test',
  inputTokens: 20,
  outputTokens: 10,
  reasoningTokens: 3,
  durationMs: 50,
};
const building = createHouse({ id: 'generation-channel-house', name: 'Channel house', storeys: 1 });
const modulePath = createRequire(new URL('../package.json', import.meta.url)).resolve('z3-solver');
const active = new Set<Worker>();

function start(source: string) {
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(
    `const { workerData } = require('node:worker_threads');
     const { resultPort: port, usage, building, modulePath } = workerData;
     ${source}`,
    {
      eval: true,
      execArgv: [],
      env: { ...process.env, WATCH_REPORT_DEPENDENCIES: '1' },
      workerData: { resultPort: port2, usage, building, modulePath },
      transferList: [port2],
    },
  );
  active.add(worker);
  return { worker, port: port1 };
}

afterEach(async () => {
  await Promise.all([...active].map((worker) => worker.terminate()));
  active.clear();
});

describe('isolated generation worker results', () => {
  it('accepts application results while Node sends real dependency-watch messages on the native channel', async () => {
    const { worker, port } = start(`
      require(modulePath);
      port.postMessage({ type: 'progress', status: 'layout', usage });
      port.postMessage({ type: 'progress', status: 'validating', usage });
      port.postMessage({ type: 'complete', building, usage });
      port.close();
    `);
    const completed: string[] = [],
      native: unknown[] = [];
    const stopped = once(worker, 'exit');
    const result = receiveGeneration(worker, port, async (message) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      completed.push(message.status);
    });
    expect(worker.listenerCount('message')).toBe(0);
    const observe = (message: unknown) => native.push(message);
    worker.on('message', observe);
    await expect(result).resolves.toEqual({ building, usage });
    await stopped;
    worker.off('message', observe);
    expect(
      native.some(
        (message) => message !== null && typeof message === 'object' && 'watch:require' in message,
      ),
    ).toBe(true);
    expect(completed).toEqual(['layout', 'validating']);
    expect(port.listenerCount('message')).toBe(0);
    expect(port.listenerCount('close')).toBe(0);
    expect(worker.listenerCount('error')).toBe(0);
  });

  it('keeps the full schema error as an internal cause when the dedicated protocol is malformed', async () => {
    const { worker, port } = start(`
      port.postMessage({ 'watch:require': ['/private/internal/dependency.js'] });
      port.close();
    `);
    let failure: unknown;
    try {
      await receiveGeneration(worker, port, async () => undefined);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('The generation worker sent an invalid result.');
    expect((failure as Error).cause).toBeInstanceOf(ZodError);
    expect(generationFailureMessage(failure)).toBe(generationFailureFallback);
    expect(port.listenerCount('message')).toBe(0);
  });

  it('waits for queued progress before rejecting a normal exit without a complete result', async () => {
    const { worker, port } = start(`
      port.postMessage({ type: 'progress', status: 'layout', usage });
      port.close();
    `);
    const progress: string[] = [];
    await expect(
      receiveGeneration(worker, port, async (message) => {
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
        progress.push(message.status);
      }),
    ).rejects.toThrow('stopped before completing');
    expect(progress).toEqual(['layout']);
  });

  it('rejects an abnormal worker exit', async () => {
    const { worker, port } = start('process.exit(7);');
    await expect(receiveGeneration(worker, port, async () => undefined)).rejects.toThrow();
    expect(worker.listenerCount('exit')).toBe(0);
    expect(port.listenerCount('close')).toBe(0);
  });

  it('rejects a worker exception and removes its error listener', async () => {
    const { worker, port } = start("throw new Error('worker internal failure');");
    await expect(receiveGeneration(worker, port, async () => undefined)).rejects.toThrow();
    expect(worker.listenerCount('error')).toBe(0);
  });

  it('bounds a stalled worker and cleans up the result port', async () => {
    const { worker, port } = start('setInterval(() => undefined, 1000);');
    await expect(receiveGeneration(worker, port, async () => undefined, 100)).rejects.toThrow(
      'House generation took too long. Please try again.',
    );
    expect(port.listenerCount('message')).toBe(0);
    expect(worker.listenerCount('error')).toBe(0);
  });

  it('retains completed model usage when the worker reports an actionable failure', async () => {
    const { worker, port } = start(`
      port.postMessage({ type: 'failed', error: 'These rooms do not fit the requested footprint.', usage });
      port.close();
    `);
    let failure: unknown;
    try {
      await receiveGeneration(worker, port, async () => undefined);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(GenerationWorkerFailure);
    expect((failure as GenerationWorkerFailure).usage).toEqual(usage);
    expect(generationFailureMessage(failure)).toBe(
      'These rooms do not fit the requested footprint.',
    );
  });

  it('does not complete after a progress persistence failure', async () => {
    const { worker, port } = start(`
      port.postMessage({ type: 'progress', status: 'layout', usage });
      port.postMessage({ type: 'complete', building, usage });
      port.close();
    `);
    await expect(
      receiveGeneration(worker, port, async () => {
        throw new Error('Progress could not be saved.');
      }),
    ).rejects.toThrow('Progress could not be saved.');
  });

  it('leaves the worker owner able to log a late exception after the result channel completes', async () => {
    const { worker, port } = start(`
      port.postMessage({ type: 'complete', building, usage });
      port.close();
      setTimeout(() => { throw new Error('Late worker exception'); }, 25);
    `);
    const reported: Error[] = [];
    const report = (error: Error) => reported.push(error);
    worker.on('error', report);
    const stopped = new Promise<void>((resolve) => worker.once('exit', () => resolve()));
    await expect(receiveGeneration(worker, port, async () => undefined)).resolves.toEqual({
      building,
      usage,
    });
    expect(worker.listenerCount('error')).toBe(1);
    await stopped;
    worker.off('error', report);
    expect(reported.map((error) => error.message)).toEqual(['Late worker exception']);
    expect(worker.listenerCount('error')).toBe(0);
  });
});
