import { workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import OpenAI from 'openai';
import { HouseAI, HouseGenerationError } from '@refloor/server/shared/ai/house-ai';
import type { GenerationUsage } from '@refloor/server/shared/ai/house-ai';
import { generateLayout } from '@refloor/server/shared/planning/layout';
import { generationFailureMessage } from '@refloor/server/features/generation/generation.error';

const input = workerData as {
  id: string;
  prompt: string;
  provider: 'openai' | 'boundless';
  apiKey: string;
  model: string;
  resultPort: MessagePort;
};
let usage: GenerationUsage | null = null;
try {
  const result = await new HouseAI(input.apiKey, input.model, input.provider).requirements(
    input.prompt,
  );
  usage = result.usage;
  input.resultPort.postMessage({ type: 'progress', status: 'layout', usage: result.usage });
  const building = await generateLayout(input.id, result.requirements, (status) =>
    input.resultPort.postMessage({ type: 'progress', status, usage: result.usage }),
  );
  input.resultPort.postMessage({ type: 'complete', building, usage: result.usage });
} catch (error) {
  console.error('House generation failed', error);
  const message =
    error instanceof OpenAI.APIConnectionError
      ? 'The model could not be reached. Check the API connection and try again.'
      : error instanceof OpenAI.APIError
        ? error.status === 429
          ? 'Generation is rate limited or the API account has insufficient quota. Check the API account and try again.'
          : `The model could not complete this request (HTTP ${error.status ?? 'unavailable'}).`
        : generationFailureMessage(error);
  input.resultPort.postMessage({
    type: 'failed',
    error: message,
    usage: error instanceof HouseGenerationError ? error.usage : usage,
  });
} finally {
  input.resultPort.close();
}
