import { describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Raycaster,
  Vector3,
} from 'three';
import { visibleInstancedMeshRaycast, visibleMeshRaycast } from '@/shared/editor/picking';

describe('paving representation picking', () => {
  it('skips hidden instances and picks the actual transformed tile when visible', () => {
    const geometry = new BoxGeometry(1, 1, 1),
      material = new MeshBasicMaterial(),
      tiles = new InstancedMesh(geometry, material, 2),
      group = new Group(),
      ray = new Raycaster(new Vector3(2, 0, 5), new Vector3(0, 0, -1));
    tiles.setMatrixAt(0, new Matrix4().makeTranslation(-2, 0, 0));
    tiles.setMatrixAt(1, new Matrix4().makeTranslation(2, 0, 0));
    tiles.instanceMatrix.needsUpdate = true;
    tiles.raycast = visibleInstancedMeshRaycast;
    group.add(tiles);
    group.updateMatrixWorld(true);
    try {
      tiles.visible = false;
      expect(ray.intersectObject(group, true)).toEqual([]);
      tiles.visible = true;
      const hit = ray.intersectObject(group, true)[0];
      expect(hit?.object).toBe(tiles);
      expect(hit?.instanceId).toBe(1);
      expect(hit?.distance).toBeCloseTo(4.5);
      group.visible = false;
      expect(ray.intersectObject(group, true)).toEqual([]);
    } finally {
      geometry.dispose();
      material.dispose();
      tiles.dispose();
    }
  });

  it('uses only the visible flat representation for surface selection', () => {
    const geometry = new PlaneGeometry(4, 4),
      material = new MeshBasicMaterial(),
      surface = new Mesh(geometry, material),
      ray = new Raycaster(new Vector3(0.2, 0.1, 5), new Vector3(0, 0, -1));
    surface.raycast = visibleMeshRaycast;
    surface.updateMatrixWorld(true);
    try {
      expect(ray.intersectObject(surface)).toHaveLength(1);
      surface.visible = false;
      expect(ray.intersectObject(surface)).toEqual([]);
    } finally {
      geometry.dispose();
      material.dispose();
    }
  });
});
