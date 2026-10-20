import { describe, expect, it } from 'vitest';
import { BoxGeometry } from 'three';
import { createHouse } from '@refloor/catalogue/houses';
import { siteSurfaceId } from '@refloor/scene/site-material';
import { applyMetricUVs } from '@/shared/scene/metric-uv';
import { selectedContext } from '@/shared/editor/chat-context';
import { createEditMemory } from '@refloor/scene/edit-memory';
import { restoreEditMemory } from '@/shared/editor/memory';

describe('editable exterior surface presentation', () => {
  it('uses physical box dimensions for every face texture instead of stretching one map across each face', () => {
    const geometry = applyMetricUVs(new BoxGeometry(8, 0.2, 4)),
      position = geometry.getAttribute('position'),
      normal = geometry.getAttribute('normal'),
      uv = geometry.getAttribute('uv');
    const top = Array.from({ length: normal.count }, (_, index) => index).filter(
      (index) => normal.getY(index) > 0.9,
    );
    expect(
      Math.max(...top.map((index) => uv.getX(index))) -
        Math.min(...top.map((index) => uv.getX(index))),
    ).toBe(8);
    expect(
      Math.max(...top.map((index) => uv.getY(index))) -
        Math.min(...top.map((index) => uv.getY(index))),
    ).toBe(4);
    expect(position.count).toBe(24);
    geometry.dispose();
  });

  it('labels a paving instance selection and anchors its bubble to the actual clicked point', () => {
    const building = createHouse({ id: 'surface-ui', name: 'Surface UI', storeys: 1 }),
      point = { x: 3, y: -0.1, z: -2 },
      context = selectedContext(building, {
        kind: 'surface',
        id: siteSurfaceId(building, 'paving'),
        point,
      });
    expect(context).toMatchObject({
      label: 'Compound paving',
      location: 'Exterior',
      position: point,
      object: null,
    });
    expect(context?.suggestions).toContain('Marble finish');
  });
  it('migrates a browser draft recorded before exterior surfaces were independently editable', () => {
    const building = createHouse({ id: 'surface-migration', name: 'Migration', storeys: 1 }),
      memory = createEditMemory(building),
      legacy = {
        ...memory,
        originals: memory.originals.filter((snapshot) => snapshot.kind !== 'surface'),
      };
    expect(
      restoreEditMemory(building, legacy).originals.filter(
        (snapshot) => snapshot.kind === 'surface',
      ),
    ).toHaveLength(12);
  });
});
