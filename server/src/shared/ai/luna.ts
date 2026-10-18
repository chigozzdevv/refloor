import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { requirementsSchema } from '@refloor/server/shared/planning/requirements';
import { housePrompt } from '@refloor/server/shared/ai/house-prompt';

export type GenerationUsage = {
  model: string;
  responseId: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  durationMs: number;
};

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
        text: { format: zodTextFormat(requirementsSchema, 'house_requirements') },
      },
      signal ? { signal } : undefined,
    );
    if (response.status !== 'completed' || !response.output_parsed)
      throw new Error('Luna did not return a complete house programme. Try a simpler description.');
    const usage: GenerationUsage = {
      model: response.model,
      responseId: response.id,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      reasoningTokens: response.usage?.output_tokens_details.reasoning_tokens ?? 0,
      durationMs: Math.round(performance.now() - started),
    };
    return { requirements: response.output_parsed, usage };
  }
}
