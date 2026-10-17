import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { Building } from '@refloor/scene/building';
import { commandSchema, editMetadataSchema } from '@refloor/scene/command';
import { idSchema } from '@refloor/scene/primitives';

export const revisionSchema = editMetadataSchema
  .extend({
    sceneId: idSchema,
    parentRevision: z.number().int().nonnegative(),
    revision: z.number().int().positive(),
    beforeFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    afterFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    commands: z.array(commandSchema).min(1).max(100),
    inverseCommands: z.array(commandSchema).min(1).max(100),
  })
  .refine(
    (value) => value.revision === value.parentRevision + 1,
    'Revision must follow its parent',
  );

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function fingerprintBuilding(building: Building): string {
  // Exclude the counter so sequential undo can restore content while revisions increase.
  const content = Object.fromEntries(
    Object.entries(building).filter(([key]) => key !== 'revision'),
  );
  return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(canonicalize(content)))));
}

export type SceneRevision = z.infer<typeof revisionSchema>;
export type EditResult = { building: Building; revision: SceneRevision };
