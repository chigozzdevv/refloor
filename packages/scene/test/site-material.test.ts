import { describe, expect, it } from 'vitest';
import { applyCommands, fingerprintBuilding, parseBuilding, undoRevision } from '@refloor/scene';
import { captureElements, createEditMemory, snapshotFor } from '@refloor/scene/edit-memory';
import {
  siteSurfaceId,
  siteSurfaceMaterial,
  siteSurfaceSlotSchema,
} from '@refloor/scene/site-material';
import { idSchema } from '@refloor/scene/primitives';
import { createBuilding, edit, finish } from '@scene-test/fixtures';

describe('independent exterior surface materials', () => {
  it.each(siteSurfaceSlotSchema.options)(
    'edits %s and undoes exactly without adding fake objects',
    (slot) => {
      const original = createBuilding(),
        surfaceId = siteSurfaceId(original, slot),
        result = applyCommands(
          original,
          edit([
            {
              type: 'set-site-material',
              surfaceId,
              material: { ...finish, color: '#354456', textureId: 'marble' },
            },
          ]),
        );
      expect(result.building.siteMaterials?.[slot]).toMatchObject({
        color: '#354456',
        textureId: 'marble',
      });
      expect(result.building.objects).toEqual(original.objects);
      expect(result.building.floors).toEqual(original.floors);
      const restored = undoRevision(result.building, result.revision, {
        id: 'undo-surface',
        at: '2026-10-20T15:01:00Z',
      });
      expect(restored.building.siteMaterials).toBeUndefined();
      expect(fingerprintBuilding(restored.building)).toBe(fingerprintBuilding(original));
    },
  );

  it('records default surfaces as stable originals and preserves other overrides on removal', () => {
    const original = createBuilding(),
      paving = siteSurfaceId(original, 'paving'),
      canopy = siteSurfaceId(original, 'canopy');
    expect(
      createEditMemory(original).originals.filter((snapshot) => snapshot.kind === 'surface'),
    ).toHaveLength(8);
    expect(snapshotFor(original, { kind: 'surface', id: paving })).toEqual({
      kind: 'surface',
      id: paving,
      value: { id: paving, slot: 'paving', material: null },
    });
    const first = applyCommands(
      original,
      edit([
        { type: 'set-site-material', surfaceId: paving, material: finish },
        { type: 'set-site-material', surfaceId: canopy, material: { ...finish, color: '#ffffff' } },
      ]),
    );
    const removed = applyCommands(first.building, {
      ...edit([{ type: 'set-site-material', surfaceId: paving, material: null }]),
      expectedRevision: first.building.revision,
    });
    expect(removed.building.siteMaterials).toEqual({ canopy: { ...finish, color: '#ffffff' } });
    expect(siteSurfaceMaterial(removed.building, 'paving')).toEqual(
      siteSurfaceMaterial(original, 'paving'),
    );
    expect(
      captureElements(removed.building).find((snapshot) => snapshot.id === canopy)?.value,
    ).toMatchObject({ material: { color: '#ffffff' } });
  });

  it('keeps legacy scenes untouched and rejects unknown slots or foreign target identities', () => {
    const original = createBuilding();
    expect(parseBuilding(original)).toEqual(original);
    expect(() => parseBuilding({ ...original, siteMaterials: { invented: finish } })).toThrow();
    expect(() =>
      applyCommands(
        original,
        edit([
          { type: 'set-site-material', surfaceId: 'foreign/surface/paving', material: finish },
        ]),
      ),
    ).toThrow('does not exist');
    original.id = 'h'.repeat(128);
    expect(idSchema.parse(siteSurfaceId(original, 'window-trim')).length).toBeLessThanOrEqual(128);
  });
});
