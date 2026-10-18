import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import { fingerprintBuilding } from '@refloor/scene';
import { createEditMemory } from '@refloor/scene/edit-memory';
import { recordChatTurn } from '@refloor/scene/edit-memory';
import { readProjectFile } from '@/shared/scene/files';
import { encodeDraft, decodeDraft } from '@/shared/scene/draft-codec';
import { encodeProject } from '@/shared/scene/files';
import { editDocument, reverseDocument } from '@/shared/editor/document';

const initial = () => {
  const compiled = compileBuilding(
    createHouse({ id: 'saved-history', name: 'Saved history', storeys: 1 }),
  );
  return { compiled, past: [], future: [], memory: createEditMemory(compiled.building) };
};

describe('browser draft history', () => {
  it('retains original item properties and clarification context through draft and project round-trips', () => {
    const original = initial(),
      light = original.compiled.building.objects.find((item) => item.kind === 'light')!,
      changed = editDocument(original, [
        { type: 'set-light', objectId: light.id, state: { intensity: 4 } },
      ]);
    changed.memory = recordChatTurn(changed.memory, {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      target: { kind: 'object', id: light.id },
      message: 'Make it warmer',
      reply: 'Change the light colour or the shade?',
      status: 'clarification',
      baseRevision: changed.compiled.building.revision,
      revisionId: null,
    });
    expect(decodeDraft(encodeDraft(changed)).memory).toEqual(changed.memory);
    expect(
      readProjectFile(encodeProject(changed.compiled.building, changed.memory)).memory,
    ).toEqual(changed.memory);
    expect(
      changed.memory.originals.find((item) => item.kind === 'object' && item.id === light.id),
    ).toMatchObject({ value: light });
  });

  it('recovers original properties from existing undo records when upgrading an older draft', () => {
    const original = initial(),
      light = original.compiled.building.objects.find((item) => item.kind === 'light')!,
      changed = editDocument(
        original,
        [{ type: 'set-light', objectId: light.id, state: { intensity: 4 } }],
        undefined,
        { source: 'chat', label: 'Increase the brightness' },
      );
    const input = JSON.parse(encodeDraft(changed));
    delete input.memory;
    const recovered = decodeDraft(JSON.stringify(input));
    expect(recovered.memory.originals.find((item) => item.id === light.id)).toMatchObject({
      value: light,
    });
    expect(recovered.memory.transitions[0]?.revision.inverseCommands).toEqual(
      changed.past[0]!.revision.inverseCommands,
    );
    expect(recovered.memory.turns[0]?.message).toBe('Increase the brightness');
  });
  it('restores undo and redo with the house, including edits on both sides of the cursor', () => {
    const original = initial(),
      light = original.compiled.building.objects.find((object) => object.kind === 'light')!,
      changed = editDocument(
        original,
        [{ type: 'set-light', objectId: light.id, state: { intensity: 4.5 } }],
        undefined,
        { source: 'chat', label: 'Make it brighter' },
      ),
      recoloured = editDocument(changed, [
        { type: 'set-light', objectId: light.id, state: { color: '#ffccaa' } },
      ]),
      cursor = reverseDocument(recoloured, 'undo'),
      loaded = decodeDraft(encodeDraft(cursor));
    expect(loaded.historyWarning).toBeNull();
    expect(loaded.past).toEqual(cursor.past);
    expect(loaded.future).toEqual(cursor.future);
    expect(loaded.past[0]?.target).toContain(light.label);
    expect(fingerprintBuilding(reverseDocument(loaded, 'redo').compiled.building)).toBe(
      fingerprintBuilding(recoloured.compiled.building),
    );
    const undone = decodeDraft(encodeDraft(reverseDocument(loaded, 'undo')));
    expect(fingerprintBuilding(undone.compiled.building)).toBe(
      fingerprintBuilding(original.compiled.building),
    );
    expect(fingerprintBuilding(reverseDocument(undone, 'redo').compiled.building)).toBe(
      fingerprintBuilding(changed.compiled.building),
    );
  });

  it('opens older project-only drafts without losing their contents', () => {
    const original = initial(),
      loaded = decodeDraft(encodeProject(original.compiled.building));
    expect(loaded.compiled.building).toEqual(original.compiled.building);
    expect(loaded.past).toEqual([]);
    expect(loaded.historyWarning).toBeNull();
  });

  it('discards stale or malformed history while retaining the valid house', () => {
    const original = initial(),
      light = original.compiled.building.objects.find((object) => object.kind === 'light')!,
      changed = editDocument(original, [
        { type: 'set-light', objectId: light.id, state: { intensity: 4 } },
      ]);
    for (const corruption of ['scene', 'fingerprint', 'metadata']) {
      const input = JSON.parse(encodeDraft(changed));
      if (corruption === 'scene') input.past[0].revision.sceneId = 'another-house';
      if (corruption === 'fingerprint') input.past[0].revision.afterFingerprint = '0'.repeat(64);
      if (corruption === 'metadata') input.past[0].source = 'unknown';
      const loaded = decodeDraft(JSON.stringify(input));
      expect(loaded.compiled.building).toEqual(changed.compiled.building);
      expect(loaded.past).toEqual([]);
      expect(loaded.memory).toEqual(changed.memory);
      expect(loaded.historyWarning).toContain('undo history');
    }
  });
});
