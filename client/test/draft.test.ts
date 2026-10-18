import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import { fingerprintBuilding } from '@refloor/scene';
import { encodeDraft, decodeDraft } from '@/shared/scene/draft-codec';
import { encodeProject } from '@/shared/scene/files';
import { editDocument, reverseDocument } from '@/shared/editor/document';

const initial = () => ({
  compiled: compileBuilding(
    createHouse({ id: 'saved-history', name: 'Saved history', storeys: 1 }),
  ),
  past: [],
  future: [],
});

describe('browser draft history', () => {
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
      expect(loaded.historyWarning).toContain('undo history');
    }
  });
});
