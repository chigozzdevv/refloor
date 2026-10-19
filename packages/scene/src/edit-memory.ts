import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { idSchema } from '@refloor/scene/primitives';
import { sceneObjectSchema } from '@refloor/scene/object';
import { roofSchema } from '@refloor/scene/building';
import { doorSchema, wallSchema } from '@refloor/scene/floor';
import { roomSchema } from '@refloor/scene/room';
import { revisionSchema } from '@refloor/scene/revision';
import type { Building } from '@refloor/scene/building';
import type { SceneCommand } from '@refloor/scene/command';

export const editTargetSchema = z.strictObject({
  kind: z.enum(['house', 'object', 'wall', 'floor', 'door', 'roof']),
  side: z.literal('exterior').optional(),
  id: idSchema,
});
export const elementSnapshotSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('object'), id: idSchema, value: sceneObjectSchema }),
    z.strictObject({ kind: z.literal('wall'), id: idSchema, value: wallSchema }),
    z.strictObject({ kind: z.literal('floor'), id: idSchema, value: roomSchema }),
    z.strictObject({ kind: z.literal('roof'), id: idSchema, value: roofSchema }),
    z.strictObject({ kind: z.literal('door'), id: idSchema, value: doorSchema }),
  ])
  .refine((snapshot) => snapshot.id === snapshot.value.id, 'Snapshot identity does not match');
export const chatTurnSchema = z.strictObject({
  id: idSchema,
  at: z.iso.datetime({ offset: true }),
  target: editTargetSchema,
  message: z.string().min(1).max(500),
  reply: z.string().max(1000),
  status: z.enum(['applied', 'clarification', 'rejected']),
  baseRevision: z.number().int().nonnegative(),
  revisionId: idSchema.nullable(),
});
export const editMemorySchema = z
  .strictObject({
    sceneId: idSchema,
    baselineRevision: z.number().int().nonnegative(),
    originals: z
      .array(elementSnapshotSchema)
      .max(2000)
      .refine(
        (items) => new Set(items.map((item) => `${item.kind}:${item.id}`)).size === items.length,
        'Original identities must be unique',
      ),
    transitions: z
      .array(
        z.strictObject({
          revision: revisionSchema,
          kind: z.enum(['edit', 'undo', 'redo']),
          label: z.string().max(500),
          source: z.enum(['chat', 'manual', 'navigation']),
        }),
      )
      .max(50),
    turns: z.array(chatTurnSchema).max(80),
  })
  .refine(
    (memory) => memory.transitions.every((item) => item.revision.sceneId === memory.sceneId),
    'Transition belongs to another house',
  );

export type EditTarget = z.infer<typeof editTargetSchema>;
export type ElementSnapshot = z.infer<typeof elementSnapshotSchema>;
export type ChatTurn = z.infer<typeof chatTurnSchema>;
export type EditMemory = z.infer<typeof editMemorySchema>;
export type EditTransition = EditMemory['transitions'][number];

export function captureElements(building: Building): ElementSnapshot[] {
  return structuredClone([
    { kind: 'roof', id: building.roof.id, value: building.roof },
    ...building.objects.map((value): ElementSnapshot => ({ kind: 'object', id: value.id, value })),
    ...building.floors.flatMap((floor) => [
      ...floor.rooms.map((value): ElementSnapshot => ({ kind: 'floor', id: value.id, value })),
      ...floor.walls.map((value): ElementSnapshot => ({ kind: 'wall', id: value.id, value })),
      ...floor.walls.flatMap((wall) =>
        wall.openings
          .filter((value) => value.kind === 'door')
          .map((value): ElementSnapshot => ({ kind: 'door', id: value.id, value })),
      ),
    ]),
  ]);
}

export function createEditMemory(building: Building): EditMemory {
  return {
    sceneId: building.id,
    baselineRevision: building.revision,
    originals: captureElements(building),
    transitions: [],
    turns: [],
  };
}

export function fingerprintEditMemory(memory: EditMemory) {
  return bytesToHex(
    sha256(new TextEncoder().encode(JSON.stringify(editMemorySchema.parse(memory)))),
  );
}

export function recordTransition(
  memory: EditMemory,
  building: Building,
  transition: EditTransition,
): EditMemory {
  if (memory.sceneId !== building.id || transition.revision.sceneId !== building.id)
    throw new Error('Edit context belongs to another house.');
  const known = new Set(memory.originals.map((item) => `${item.kind}:${item.id}`));
  return {
    ...memory,
    originals: [
      ...memory.originals,
      ...captureElements(building).filter((item) => !known.has(`${item.kind}:${item.id}`)),
    ],
    transitions: [...memory.transitions, transition].slice(-50),
  };
}

export function recordChatTurn(memory: EditMemory, turn: ChatTurn): EditMemory {
  return {
    ...memory,
    turns: [...memory.turns.filter((item) => item.id !== turn.id), turn].slice(-80),
  };
}

export function commandTouches(command: SceneCommand, target: EditTarget): boolean {
  if (target.kind === 'house') return true;
  if (command.type === 'set-rules')
    return (
      command.rules?.some((rule) => {
        const trigger = rule.trigger;
        return (
          (target.kind === 'door' && trigger.kind === 'door' && trigger.doorId === target.id) ||
          (target.kind === 'object' && 'objectId' in trigger && trigger.objectId === target.id) ||
          (target.kind === 'floor' &&
            trigger.kind === 'room-enter' &&
            trigger.roomId === target.id) ||
          rule.actions.some((action) => commandTouches(action, target))
        );
      }) ?? false
    );
  if (command.type === 'emit-event') {
    const event = command.event;
    return (
      (target.kind === 'door' && event.kind === 'door' && event.doorId === target.id) ||
      (target.kind === 'object' && 'objectId' in event && event.objectId === target.id) ||
      (target.kind === 'floor' && event.kind === 'room-enter' && event.roomId === target.id)
    );
  }
  if (target.kind === 'object')
    return 'objectId' in command
      ? command.objectId === target.id
      : command.type === 'add-object' && command.object.id === target.id;
  if (target.kind === 'roof')
    return command.type === 'set-roof-material' && command.roofId === target.id;
  if (target.kind === 'wall')
    return (
      'wallId' in command &&
      command.wallId === target.id &&
      (target.side === 'exterior'
        ? command.type === 'set-wall-exterior-material' || command.type === 'set-wall-material'
        : command.type === 'set-wall-material')
    );
  if (target.kind === 'floor')
    return (
      'roomId' in command &&
      command.type === 'set-room-floor-material' &&
      command.roomId === target.id
    );
  return 'doorId' in command && command.doorId === target.id;
}

export function scopedEditMemory(memory: EditMemory, target: EditTarget): EditMemory {
  const transitions = memory.transitions.filter((item) =>
    item.revision.commands.some((command) => commandTouches(command, target)),
  );
  const related = new Set(transitions.map((item) => item.revision.id));
  return {
    sceneId: memory.sceneId,
    baselineRevision: memory.baselineRevision,
    originals: memory.originals.filter(
      (item) => target.kind === 'house' || (item.kind === target.kind && item.id === target.id),
    ),
    transitions: transitions.slice(-12),
    turns: memory.turns
      .filter(
        (turn) =>
          target.kind === 'house' ||
          (turn.target.kind === target.kind &&
            turn.target.id === target.id &&
            turn.target.side === target.side) ||
          (turn.revisionId !== null && related.has(turn.revisionId)),
      )
      .slice(-8),
  };
}

export function snapshotFor(building: Building, target: EditTarget): ElementSnapshot | null {
  if (target.kind === 'roof' && building.roof.id === target.id)
    return structuredClone({ kind: 'roof', id: target.id, value: building.roof });
  if (target.kind === 'object') {
    const value = building.objects.find((item) => item.id === target.id);
    return value ? structuredClone({ kind: 'object', id: value.id, value }) : null;
  }
  for (const floor of building.floors) {
    if (target.kind === 'floor') {
      const value = floor.rooms.find((item) => item.id === target.id);
      if (value) return structuredClone({ kind: 'floor', id: value.id, value });
    }
    for (const wall of floor.walls) {
      if (target.kind === 'wall' && wall.id === target.id)
        return structuredClone({ kind: 'wall', id: wall.id, value: wall });
      const value = wall.openings.find((item) => item.id === target.id && item.kind === 'door');
      if (target.kind === 'door' && value?.kind === 'door')
        return structuredClone({ kind: 'door', id: value.id, value });
    }
  }
  return null;
}
