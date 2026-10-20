import type { Generation } from '@refloor/scene/contracts';
import { storedGenerationFailureMessage } from '@refloor/server/features/generation/generation.error';

export type GenerationRecord = Omit<Generation, 'id'> & {
  _id: string;
  ownerId: string;
  requestId: string;
  fingerprint: string;
  prompt: string;
  active: boolean;
  createdAt: Date;
  deadline: Date | null;
  expiresAt: Date;
};

export function generationDocument(record: GenerationRecord): Generation {
  return {
    id: record._id,
    status: record.status,
    projectId: record.projectId,
    error: storedGenerationFailureMessage(record.error),
    usage: record.usage,
  };
}
