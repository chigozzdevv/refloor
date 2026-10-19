import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { visibleMeshBounds } from '@/shared/scene/model-bounds';

describe('visible scanned model bounds', () => {
  it('excludes a hidden source pot while preserving transformed foliage bounds', () => {
    const model = new Group(),
      material = new MeshBasicMaterial();
    const pot = new Mesh(new BoxGeometry(2, 4, 2), material);
    pot.visible = false;
    model.add(pot);
    const foliage = new Group();
    foliage.position.y = 3;
    foliage.scale.setScalar(2);
    foliage.add(new Mesh(new BoxGeometry(1, 1, 1), material));
    model.add(foliage);
    const bounds = visibleMeshBounds(model);
    expect(bounds.min.y).toBe(2);
    expect(bounds.max.y).toBe(4);
    expect(bounds.getSize(new Vector3()).toArray()).toEqual([2, 2, 2]);
    const scale = 0.8 / bounds.getSize(new Vector3()).y,
      soil = 0.42;
    model.scale.setScalar(scale);
    model.position.y = soil - bounds.min.y * scale;
    expect(visibleMeshBounds(model).min.y).toBeCloseTo(soil);
  });
});
