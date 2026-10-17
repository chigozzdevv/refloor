export type SceneErrorCode =
  'REVISION_CONFLICT' | 'NOT_FOUND' | 'INVALID_TARGET' | 'UNSUPPORTED_ACTION' | 'REVISION_MISMATCH';

export class SceneError extends Error {
  constructor(
    public readonly code: SceneErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SceneError';
  }
}
