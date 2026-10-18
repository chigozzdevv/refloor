import OpenAI from 'openai';
import { validatePlacement } from '@refloor/engine';
import type { LanguageEditRequest } from '@refloor/scene/chat';
import type { ServerConfig } from '@refloor/server/shared/config/env';
import { HouseAI } from '@refloor/server/shared/ai/house-ai';
import { chatTargetExists, languageCommands } from '@refloor/server/shared/planning/language-edit';
import { validateAssets, validateTuning } from '@refloor/server/features/houses/house.validation';
import { ApiError } from '@refloor/server/shared/http/errors';

export class LanguageEditService {
  private readonly ai: HouseAI | null;
  constructor(ai: ServerConfig['ai']) {
    this.ai = ai ? new HouseAI(ai.apiKey, ai.model) : null;
  }
  async interpret(input: LanguageEditRequest) {
    if (!this.ai)
      throw new ApiError(
        503,
        'CHAT_UNAVAILABLE',
        'House chat is unavailable right now. Please try again later.',
      );
    if (!chatTargetExists(input.building, input.target))
      throw new ApiError(422, 'TARGET_MISSING', 'Select an item in this house first.');
    if (
      input.building.objects.length > 200 ||
      input.building.floors.flatMap((floor) => floor.walls).length > 200
    )
      throw new ApiError(422, 'CHAT_LIMIT', 'This house is too large for one chat request.');
    validateAssets(input.building);
    if (input.context && input.context.sceneId !== input.building.id)
      throw new ApiError(422, 'CONTEXT_MISMATCH', 'Edit context belongs to another house.');
    let result: Awaited<ReturnType<HouseAI['edit']>>;
    try {
      result = await this.ai.edit(input);
    } catch (error) {
      throw new ApiError(
        502,
        'CHAT_UNAVAILABLE',
        error instanceof OpenAI.APIError
          ? 'House chat could not connect. Please try again.'
          : error instanceof Error
            ? error.message
            : 'This request could not be understood.',
      );
    }
    let commands;
    try {
      commands = languageCommands(input, result.plan);
    } catch (error) {
      throw new ApiError(
        422,
        'ACTION_UNSUPPORTED',
        error instanceof Error ? error.message : 'This action is unavailable.',
      );
    }
    if (commands.length) {
      const edited = validatePlacement(
        input.building,
        {
          id: input.requestId,
          at: new Date().toISOString(),
          expectedRevision: input.building.revision,
          commands,
        },
        {},
        input.player ?? undefined,
      );
      validateAssets(edited.building);
      validateTuning(input.building, edited.revision.commands);
    }
    return {
      requestId: input.requestId,
      baseRevision: input.building.revision,
      message: result.plan.message,
      commands,
      usage: result.usage,
    };
  }
}
