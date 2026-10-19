import { undoRevision } from '@refloor/scene';
import type { Building } from '@refloor/scene';
import { createEditMemory, editMemorySchema } from '@refloor/scene/edit-memory';
import type { EditMemory } from '@refloor/scene/edit-memory';
import type { HistoryRecord } from '@/shared/editor/history';

export function recoverEditMemory(building: Building, past: HistoryRecord[]): EditMemory {
  let baseline = building;
  for (const record of past.toReversed()) {
    try {
      baseline = undoRevision(baseline, record.revision, {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
      }).building;
    } catch {
      break;
    }
  }
  const memory = createEditMemory(baseline),
    known = new Set(memory.originals.map((item) => `${item.kind}:${item.id}`));
  for (const record of past)
    for (const command of record.revision.commands) {
      if (command.type !== 'add-object' || known.has(`object:${command.object.id}`)) continue;
      known.add(`object:${command.object.id}`);
      memory.originals.push({
        kind: 'object',
        id: command.object.id,
        value: structuredClone(command.object),
      });
    }
  return {
    ...memory,
    baselineRevision: past[0]?.revision.parentRevision ?? building.revision,
    transitions: past.map((record) => ({
      revision: record.revision,
      label: record.label,
      source: record.source,
      kind: 'edit' as const,
    })),
    turns: past
      .filter((record) => record.source === 'chat')
      .map((record) => ({
        id: record.revision.id,
        at: record.revision.at,
        target: { kind: 'house' as const, id: building.id },
        message: record.label,
        reply: 'Applied change recorded in history.',
        status: 'applied' as const,
        baseRevision: record.revision.parentRevision,
        revisionId: record.revision.id,
      })),
  };
}

export function restoreEditMemory(building: Building, input?: unknown, past: HistoryRecord[] = []) {
  if (input === undefined) return recoverEditMemory(building, past);
  const memory = editMemorySchema.parse(input);
  if (memory.sceneId !== building.id) throw new Error('Edit context belongs to another house.');
  if (!memory.originals.some((item) => item.kind === 'roof' && item.id === building.roof.id))
    memory.originals.push({
      kind: 'roof',
      id: building.roof.id,
      value: structuredClone(building.roof),
    });
  return memory;
}
