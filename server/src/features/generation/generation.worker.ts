import { parentPort, workerData } from 'node:worker_threads';
import OpenAI from 'openai';
import { Luna, LunaGenerationError } from '@refloor/server/shared/ai/luna';
import type { GenerationUsage } from '@refloor/server/shared/ai/luna';
import { generateLayout } from '@refloor/server/shared/planning/layout';

const input = workerData as { id: string; prompt: string; apiKey: string; model: string };
let usage: GenerationUsage | null = null;
try {
  const result = await new Luna(input.apiKey, input.model).requirements(input.prompt);
  usage = result.usage;
  parentPort!.postMessage({ type: 'progress', status: 'layout', usage: result.usage });
  const building = await generateLayout(input.id, result.requirements, (status) =>
    parentPort!.postMessage({ type: 'progress', status, usage: result.usage }),
  );
  parentPort!.postMessage({ type: 'complete', building, usage: result.usage });
} catch (error) {
  const message =
    error instanceof OpenAI.APIConnectionError
      ? 'Luna could not be reached. Check the API connection and try again.'
      : error instanceof OpenAI.APIError
        ? error.status === 429
          ? 'Luna is rate limited or the API account has insufficient quota. Check the API account and try again.'
          : `Luna could not complete this request (HTTP ${error.status ?? 'unavailable'}).`
        : error instanceof Error
          ? error.message.slice(0, 500)
          : 'House generation could not complete.';
  parentPort!.postMessage({
    type: 'failed',
    error: message,
    usage: error instanceof LunaGenerationError ? error.usage : usage,
  });
}
