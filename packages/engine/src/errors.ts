import type { EngineIssue } from '@refloor/engine/types';

export class EngineError extends Error {
  constructor(public readonly issues: EngineIssue[]) {
    super(issues.map((issue) => `${issue.entityId}: ${issue.message}`).join('; '));
    this.name = 'EngineError';
  }
}

export function fail(code: string, entityId: string, message: string): never {
  throw new EngineError([{ code, entityId, message }]);
}
