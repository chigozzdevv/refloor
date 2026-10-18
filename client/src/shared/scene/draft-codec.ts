import { z } from 'zod';
import { fingerprintBuilding, revisionSchema } from '@refloor/scene';
import type { Building } from '@refloor/scene';
import type { DocumentState } from '@/shared/editor/document';
import type { HistoryRecord } from '@/shared/editor/history';
import { parseProjectFile } from '@/shared/scene/files';
import { restoreEditMemory } from '@/shared/editor/memory';

const maxDraftBytes = 4 * 1024 * 1024;
const historyRecordSchema = z.strictObject({
  revision: revisionSchema,
  label: z.string().max(500),
  source: z.enum(['chat', 'manual', 'navigation']),
  target: z.string().max(500).optional(),
});
const historySchema = z.strictObject({
  past: z.array(historyRecordSchema).max(50),
  future: z.array(historyRecordSchema).max(50),
});

function matchesBuilding(building: Building, records: HistoryRecord[]) {
  let expected = fingerprintBuilding(building);
  for (const { revision } of records.toReversed()) {
    if (
      revision.sceneId !== building.id ||
      revision.revision > building.revision ||
      revision.afterFingerprint !== expected
    )
      return false;
    expected = revision.beforeFingerprint;
  }
  return true;
}

export function decodeDraft(text: string) {
  if (new TextEncoder().encode(text).length > maxDraftBytes)
    throw new Error('This browser draft is too large.');
  const input: unknown = JSON.parse(text);
  if (
    !input ||
    typeof input !== 'object' ||
    !('format' in input) ||
    input.format !== 'refloor-browser-draft'
  ) {
    const compiled = parseProjectFile(text);
    return {
      compiled,
      past: [],
      future: [],
      memory: restoreEditMemory(compiled.building),
      historyWarning: null,
    };
  }
  if (!('version' in input) || input.version !== 1 || !('building' in input))
    throw new Error('This browser draft version is not supported.');
  const compiled = parseProjectFile(JSON.stringify(input.building)),
    history = historySchema.safeParse({
      past: 'past' in input ? input.past : undefined,
      future: 'future' in input ? input.future : undefined,
    });
  const validHistory =
    history.success &&
    matchesBuilding(compiled.building, history.data.past) &&
    matchesBuilding(compiled.building, history.data.future)
      ? history.data
      : null;
  const records = validHistory ?? { past: [], future: [] },
    historyWarning = validHistory
      ? null
      : 'This house opened, but its saved undo history could not be restored.';
  try {
    return {
      compiled,
      ...records,
      memory: restoreEditMemory(
        compiled.building,
        'memory' in input ? input.memory : undefined,
        records.past,
      ),
      historyWarning,
    };
  } catch {
    return {
      compiled,
      ...records,
      memory: restoreEditMemory(compiled.building, undefined, records.past),
      historyWarning:
        historyWarning ?? 'The house opened with context recovered from its recorded changes.',
    };
  }
}

export function encodeDraft(state: DocumentState) {
  const past = state.past.slice(-50),
    future = state.future.slice(-50);
  const memory = {
    ...state.memory,
    transitions: [...state.memory.transitions],
    turns: [...state.memory.turns],
  };
  const encode = () =>
    JSON.stringify({
      format: 'refloor-browser-draft',
      version: 1,
      building: state.compiled.building,
      past,
      future,
      memory,
    });
  let encoded = encode();
  while (new TextEncoder().encode(encoded).length > maxDraftBytes) {
    if (past.length) past.shift();
    else if (future.length) future.shift();
    else if (memory.turns.length) memory.turns.shift();
    else if (memory.transitions.length) memory.transitions.shift();
    else throw new Error('This browser draft is too large. Export your space to keep it.');
    encoded = encode();
  }
  return encoded;
}
