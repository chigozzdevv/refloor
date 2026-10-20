import { EngineError } from '@refloor/engine';

export const generationFailureFallback = 'House generation stopped unexpectedly. Please try again.';

export class GenerationFailure extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GenerationFailure';
  }
}

export function generationFailureMessage(error: unknown): string {
  if (error instanceof GenerationFailure)
    return error.message.trim().slice(0, 500) || generationFailureFallback;
  if (error instanceof EngineError) {
    const reasons = [...new Set(error.issues.map((issue) => issue.message.trim()).filter(Boolean))];
    if (reasons.length)
      return `The generated layout could not be validated. ${reasons.slice(0, 3).join(' ')}`.slice(
        0,
        500,
      );
  }
  return generationFailureFallback;
}

export function storedGenerationFailureMessage(message: string | null): string | null {
  if (message === null) return null;
  const text = message.trim();
  if (
    /^\[\s*\{\s*"code"\s*:\s*"(?:invalid_type|invalid_union|invalid_value|too_small|too_big|unrecognized_keys|invalid_format|custom|not_multiple_of)"/.test(
      text,
    ) &&
    /"(?:path|errors|expected|origin)"\s*:/.test(text)
  )
    return generationFailureFallback;
  return message;
}
