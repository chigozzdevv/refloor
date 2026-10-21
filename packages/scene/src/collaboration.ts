import { z } from 'zod';
import { commandSchema, editMetadataSchema } from '@refloor/scene/command';
import { editTargetSchema } from '@refloor/scene/edit-memory';
import { playerSchema, projectSchema } from '@refloor/scene/contracts';
import { coordinateSchema } from '@refloor/scene/primitives';
import { propertyGuardSchema, propertyPatchSchema } from '@refloor/scene/properties';
import type { SceneCommand } from '@refloor/scene/command';

export function isNavigationEdit(commands: SceneCommand[], source?: string) {
  return (
    source === 'navigation' &&
    commands.length > 0 &&
    commands.every(
      (command) =>
        command.type === 'set-door' ||
        (command.type === 'emit-event' && command.event.kind === 'room-enter'),
    )
  );
}

export const memberNameSchema = z.string().trim().min(1).max(40);
export const memberRoleSchema = z.enum(['owner', 'editor', 'viewer']);
export const sharedMemberSchema = z.strictObject({
  id: z.string(),
  name: memberNameSchema,
  color: z.string().regex(/^#[0-9a-f]{6}$/),
  role: memberRoleSchema,
  active: z.boolean().optional(),
});
export const presenceInputSchema = z.strictObject({
  selection: editTargetSchema
    .extend({
      point: z
        .strictObject({ x: coordinateSchema, y: coordinateSchema, z: coordinateSchema })
        .optional(),
    })
    .nullable(),
  draft: z.string().max(500),
  phase: z.enum(['idle', 'typing', 'applying']).default('idle'),
  player: playerSchema.nullable(),
  floorId: z.string().max(160),
});
export const sharedPresenceSchema = presenceInputSchema.extend({
  clientId: z.string(),
  member: sharedMemberSchema,
});
export const sharedEditSchema = editMetadataSchema.extend({
  id: z.uuid(),
  commands: z
    .array(commandSchema)
    .min(1)
    .max(100)
    .refine(
      (commands) => commands.every((command) => command.type !== 'restore-properties'),
      'Restore history through the rollback endpoint',
    ),
  guards: z.array(propertyGuardSchema).min(1).max(2000),
  label: z.string().min(1).max(500),
  source: z.enum(['chat', 'manual', 'navigation']),
  target: editTargetSchema.optional(),
  message: z.string().max(500).optional(),
  reply: z.string().max(1000).optional(),
  player: playerSchema.nullable(),
});
export const sharedHistorySchema = editMetadataSchema.extend({
  id: z.uuid(),
  restore: z.boolean(),
});
export const historyActionSchema = z.strictObject({
  id: z.string(),
  version: z.number().int().nonnegative(),
  kind: z.enum(['rollback', 'restore']),
  author: sharedMemberSchema,
  at: z.iso.datetime(),
});
export const sharedActivitySchema = z.strictObject({
  id: z.string(),
  version: z.number().int().nonnegative(),
  at: z.iso.datetime(),
  author: sharedMemberSchema,
  kind: z.enum(['edit', 'rollback', 'restore']),
  source: z.enum(['chat', 'manual', 'navigation']),
  label: z.string(),
  target: editTargetSchema.optional(),
  message: z.string().optional(),
  reply: z.string().optional(),
  originalId: z.string().optional(),
  revertedBy: z.string().nullable(),
  lastHistoryAction: historyActionSchema.nullable().optional(),
  undoable: z.boolean(),
});
export const sharedStateSchema = z.strictObject({
  project: projectSchema,
  self: sharedMemberSchema,
  members: z.array(sharedMemberSchema),
  activity: z.array(sharedActivitySchema),
  hasEarlier: z.boolean(),
});
export const sharedReceiptSchema = z.strictObject({
  state: sharedStateSchema,
  eventId: z.string(),
  acceptedVersion: z.number(),
  replayed: z.boolean(),
});
export const invitationSchema = z.strictObject({
  id: z.uuid(),
  token: z.string(),
  role: z.enum(['editor', 'viewer']),
  expiresAt: z.iso.datetime(),
});
export const sharedActivityPageSchema = z.strictObject({
  items: z.array(sharedActivitySchema),
  hasEarlier: z.boolean(),
});
export const storedPatchesSchema = z.array(propertyPatchSchema).max(2000);
export type SharedEdit = z.infer<typeof sharedEditSchema>;
export type SharedHistory = z.infer<typeof sharedHistorySchema>;
export type SharedMember = z.infer<typeof sharedMemberSchema>;
export type SharedPresence = z.infer<typeof sharedPresenceSchema>;
export type PresenceInput = z.infer<typeof presenceInputSchema>;
export type SharedState = z.infer<typeof sharedStateSchema>;
export type SharedActivity = z.infer<typeof sharedActivitySchema>;
export type SharedReceipt = z.infer<typeof sharedReceiptSchema>;
