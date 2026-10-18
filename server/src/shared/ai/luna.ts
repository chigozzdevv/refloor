import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { houseResponseSchema } from '@refloor/server/shared/planning/requirements';
import { housePrompt } from '@refloor/server/shared/ai/house-prompt';

export type GenerationUsage = {
  model: string;
  responseId: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  durationMs: number;
};

export class LunaGenerationError extends Error {
  constructor(
    message: string,
    public readonly usage: GenerationUsage,
  ) {
    super(message);
  }
}

export class Luna {
  private readonly client: OpenAI;
  constructor(
    apiKey: string,
    private readonly model = 'gpt-6-luna',
  ) {
    this.client = new OpenAI({ apiKey, maxRetries: 0, timeout: 90000 });
  }

  async requirements(prompt: string, signal?: AbortSignal) {
    const started = performance.now();
    const response = await this.client.responses.parse(
      {
        model: this.model,
        store: false,
        reasoning: { effort: 'medium' },
        max_output_tokens: 6000,
        input: [
          { role: 'system', content: housePrompt },
          { role: 'user', content: prompt },
        ],
        text: { format: zodTextFormat(houseResponseSchema, 'house_brief') },
      },
      signal ? { signal } : undefined,
    );
    const usage: GenerationUsage = {
      model: response.model,
      responseId: response.id,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      reasoningTokens: response.usage?.output_tokens_details.reasoning_tokens ?? 0,
      durationMs: Math.round(performance.now() - started),
    };
    if (response.status !== 'completed' || !response.output_parsed)
      throw new LunaGenerationError(
        'Luna did not return a complete house programme. Try a simpler description.',
        usage,
      );
    const result = response.output_parsed;
    if (result.unsupported.length)
      throw new LunaGenerationError(
        `This request needs unsupported features: ${result.unsupported.join('; ')}`,
        usage,
      );
    if (!result.requirements)
      throw new LunaGenerationError(
        'Luna did not provide a house programme. Please describe the rooms you want.',
        usage,
      );
    return { requirements: { ...result.requirements, unsupported: [] }, usage };
  }
}
