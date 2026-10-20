import type { MessagePort, Worker } from 'node:worker_threads';
import { GenerationFailure } from '@refloor/server/features/generation/generation.error';
import { generationWorkerMessageSchema } from '@refloor/server/features/generation/generation.protocol';
import type {
  GenerationWorkerProgress,
  GenerationWorkerResult,
} from '@refloor/server/features/generation/generation.protocol';
import type { GenerationUsage } from '@refloor/server/shared/ai/house-ai';

export class GenerationWorkerFailure extends GenerationFailure {
  constructor(
    message: string,
    public readonly usage: GenerationUsage | null,
  ) {
    super(message);
    this.name = 'GenerationWorkerFailure';
  }
}

export function receiveGeneration(
  worker: Worker,
  port: MessagePort,
  onProgress: (message: GenerationWorkerProgress) => Promise<void>,
  timeoutMs = 120000,
): Promise<GenerationWorkerResult> {
  return new Promise((resolve, reject) => {
    let settled = false,
      updates = Promise.resolve();
    const timeout = setTimeout(
      () => fail(new GenerationFailure('House generation took too long. Please try again.')),
      timeoutMs,
    );
    function cleanup() {
      clearTimeout(timeout);
      port.off('message', onMessage);
      port.off('messageerror', onMessageError);
      port.off('close', onClose);
      worker.off('error', onWorkerError);
      worker.off('exit', onExit);
      port.close();
    }
    function fail(error: unknown) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }
    function enqueue(operation: () => Promise<void> | void) {
      updates = updates
        .then(async () => {
          if (!settled) await operation();
        })
        .catch(fail);
    }
    function onMessage(data: unknown) {
      enqueue(async () => {
        const result = generationWorkerMessageSchema.safeParse(data);
        if (!result.success)
          throw new Error('The generation worker sent an invalid result.', { cause: result.error });
        const message = result.data;
        if (message.type === 'progress') await onProgress(message);
        else if (message.type === 'failed')
          throw new GenerationWorkerFailure(message.error, message.usage);
        else {
          settled = true;
          cleanup();
          resolve({ building: message.building, usage: message.usage });
        }
      });
    }
    function onMessageError(error: Error) {
      fail(new Error('The generation worker result could not be read.', { cause: error }));
    }
    function onClose() {
      enqueue(() => {
        throw new Error('The generation worker stopped before completing.');
      });
    }
    function onWorkerError(error: Error) {
      fail(error);
    }
    function onExit(code: number) {
      if (code !== 0) fail(new Error(`The generation worker exited with code ${code}.`));
    }
    port.on('message', onMessage);
    port.once('messageerror', onMessageError);
    port.once('close', onClose);
    worker.once('error', onWorkerError);
    worker.once('exit', onExit);
    port.start();
  });
}
