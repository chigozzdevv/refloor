import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { houseResponseSchema } from '@refloor/server/shared/planning/requirements';
import { housePrompt } from '@refloor/server/shared/ai/house-prompt';
import { editPrompt } from '@refloor/server/shared/ai/edit-prompt';
import { languageContext, languagePlanSchema } from '@refloor/server/shared/planning/language-edit';
import type { LanguageEditRequest } from '@refloor/scene/chat';
import { GenerationFailure } from '@refloor/server/features/generation/generation.error';

export type GenerationUsage = {
  model: string;
  responseId: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  durationMs: number;
};

export class HouseGenerationError extends GenerationFailure {
  constructor(
    message: string,
    public readonly usage: GenerationUsage,
  ) {
    super(message);
  }
}

function jsonSchemaPrompt<T extends z.ZodType>(prompt: string, schema: T) {
  return `${prompt}\n\nReturn exactly one JSON object with no surrounding text. It must conform to this JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}`;
}

function parseJsonResponse<T extends z.ZodType>(schema: T, content: string | null | undefined) {
  if (!content) return null;
  try {
    const result = schema.safeParse(JSON.parse(content));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function requirementsResult(
  result: z.infer<typeof houseResponseSchema> | null,
  usage: GenerationUsage,
) {
  if (!result)
    throw new HouseGenerationError(
      'The model did not return a complete house programme. Try a simpler description.',
      usage,
    );
  if (result.unsupported.length)
    throw new HouseGenerationError(
      `This request needs unsupported features: ${result.unsupported.join('; ')}`,
      usage,
    );
  if (!result.requirements)
    throw new HouseGenerationError(
      'The model did not provide a house programme. Please describe the rooms you want.',
      usage,
    );
  return { requirements: { ...result.requirements, unsupported: [] }, usage };
}

export class HouseAI {
  private readonly client: OpenAI;
  constructor(
    apiKey: string,
    private readonly model = 'gpt-6-luna',
    private readonly provider: 'openai' | 'boundless' = 'openai',
  ) {
    this.client = new OpenAI({
      apiKey,
      ...(provider === 'boundless'
        ? { baseURL: 'https://api.inference.boundless.network/v1' }
        : {}),
      maxRetries: 0,
      timeout: 90000,
    });
  }

  async requirements(prompt: string, signal?: AbortSignal) {
    const started = performance.now();
    if (this.provider === 'boundless') {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          reasoning_effort: 'medium',
          max_tokens: 6000,
          messages: [
            { role: 'system', content: jsonSchemaPrompt(housePrompt, houseResponseSchema) },
            { role: 'user', content: prompt },
          ],
        },
        signal ? { signal } : undefined,
      );
      const usage: GenerationUsage = {
        model: response.model,
        responseId: response.id,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        reasoningTokens: response.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
        durationMs: Math.round(performance.now() - started),
      };
      return requirementsResult(
        parseJsonResponse(houseResponseSchema, response.choices[0]?.message.content),
        usage,
      );
    }
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
    return requirementsResult(
      response.status === 'completed' ? response.output_parsed : null,
      usage,
    );
  }

  async edit(input: LanguageEditRequest) {
    const started = performance.now();
    if (this.provider === 'boundless') {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          reasoning_effort: 'low',
          max_tokens: 4800,
          messages: [
            { role: 'system', content: jsonSchemaPrompt(editPrompt, languagePlanSchema) },
            { role: 'user', content: JSON.stringify(languageContext(input)) },
          ],
        },
        { timeout: 25000 },
      );
      const plan = parseJsonResponse(languagePlanSchema, response.choices[0]?.message.content);
      if (response.choices[0]?.finish_reason !== 'stop' || !plan)
        throw new Error('I could not finish that request. Try a shorter description.');
      return {
        plan,
        usage: {
          model: response.model,
          responseId: response.id,
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
          reasoningTokens: response.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
          durationMs: Math.round(performance.now() - started),
        },
      };
    }
    const response = await this.client.responses.parse(
      {
        model: this.model,
        store: false,
        max_output_tokens: 4800,
        reasoning: { effort: 'low' },
        input: [
          { role: 'system', content: editPrompt },
          { role: 'user', content: JSON.stringify(languageContext(input)) },
        ],
        text: { format: zodTextFormat(languagePlanSchema, 'house_edit') },
      },
      { timeout: 25000 },
    );
    if (response.status !== 'completed' || !response.output_parsed)
      throw new Error('I could not finish that request. Try a shorter description.');
    return {
      plan: response.output_parsed,
      usage: {
        model: response.model,
        responseId: response.id,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        reasoningTokens: response.usage?.output_tokens_details.reasoning_tokens ?? 0,
        durationMs: Math.round(performance.now() - started),
      },
    };
  }
}
