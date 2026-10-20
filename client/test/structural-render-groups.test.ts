import { describe, expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import type { MeshPart } from '@refloor/engine';
import { compileBuilding } from '@refloor/engine';
import { createHouse } from '@refloor/catalogue/houses';
import { partGeometry } from '@/shared/scene/geometry';

function renderMesh(part: MeshPart, materials: MeshBasicMaterial[]) {
  const mesh = new Mesh(partGeometry(part), materials);
  mesh.position.set(part.collider.position.x, part.collider.position.y, part.collider.position.z);
  mesh.rotation.y = part.collider.rotation;
  mesh.updateMatrixWorld(true);
  return mesh;
}

function triangles(indices: ArrayLike<number>) {
  const result: string[] = [];
  for (let i = 0; i < indices.length; i += 3)
    result.push(`${indices[i]},${indices[i + 1]},${indices[i + 2]}`);
  return result.sort();
}

describe('structural material batching', () => {
  it('retains every original triangle, winding and vertex attribute without mutating compilation', () => {
    const compiled = compileBuilding(createHouse({ id: 'batched', name: 'Batched', storeys: 2 }));
    for (const part of compiled.parts) {
      const original = structuredClone(part),
        geometry = partGeometry(part);
      expect(triangles(geometry.index!.array)).toEqual(triangles(part.mesh.indices));
      expect([...geometry.getAttribute('position').array]).toEqual([
        ...new Float32Array(part.mesh.positions),
      ]);
      expect([...geometry.getAttribute('normal').array]).toEqual([
        ...new Float32Array(part.mesh.normals),
      ]);
      expect(part).toEqual(original);
      expect(geometry.groups.length).toBeLessThanOrEqual(2);
      expect(new Set(geometry.groups.map((group) => group.materialIndex)).size).toBe(
        geometry.groups.length,
      );
      geometry.dispose();
    }
  });

  it('raycasts opposite sides of rotated exterior walls to their correct selectable finish', () => {
    const compiled = compileBuilding(
        createHouse({ id: 'wall-picking', name: 'Walls', storeys: 1 }),
      ),
      materials = [new MeshBasicMaterial(), new MeshBasicMaterial()],
      walls = compiled.parts.filter((part) => part.role === 'wall' && part.exterior),
      sides = new Set<number>(),
      rotations = new Set<number>();
    for (const part of walls) {
      const mesh = renderMesh(part, materials),
        outward = new Vector3(0, 0, part.exterior!.side).transformDirection(mesh.matrixWorld),
        centre = mesh.position.clone();
      sides.add(part.exterior!.side);
      rotations.add(part.collider.rotation);
      for (const side of [-1, 1]) {
        const direction = outward.clone().multiplyScalar(-side),
          ray = new Raycaster(centre.clone().addScaledVector(outward, side * 2), direction),
          hit = ray.intersectObject(mesh)[0];
        expect(hit?.object).toBe(mesh);
        expect(hit?.face?.materialIndex).toBe(side === 1 ? 1 : 0);
        expect(hit?.point.distanceTo(centre)).toBeCloseTo(
          part.collider.shape === 'box' ? part.collider.size.z / 2 : 0,
        );
      }
      mesh.geometry.dispose();
    }
    expect(sides.size).toBe(2);
    expect(rotations.size).toBeGreaterThan(1);
    materials.forEach((material) => material.dispose());
  });

  it.each(['flat', 'gable'] as const)(
    'keeps %s roofing and ceilings correct under real raycasts',
    (kind) => {
      const building = createHouse({ id: `roof-${kind}`, name: 'Roof', storeys: 2 });
      building.roof = { ...building.roof, kind, pitch: kind === 'gable' ? 0.3 : 0 };
      const part = compileBuilding(building).parts.find((value) => value.role === 'roof')!,
        materials = [new MeshBasicMaterial(), new MeshBasicMaterial()],
        mesh = renderMesh(part, materials),
        position = mesh.geometry.getAttribute('position'),
        normal = mesh.geometry.getAttribute('normal'),
        indices = mesh.geometry.index!,
        selected = new Set<number>();
      for (let i = 0; i < indices.count; i += 3) {
        const a = indices.getX(i),
          b = indices.getX(i + 1),
          c = indices.getX(i + 2),
          centre = new Vector3()
            .fromBufferAttribute(position, a)
            .add(new Vector3().fromBufferAttribute(position, b))
            .add(new Vector3().fromBufferAttribute(position, c))
            .multiplyScalar(1 / 3)
            .applyMatrix4(mesh.matrixWorld),
          outward = new Vector3()
            .fromBufferAttribute(normal, a)
            .transformDirection(mesh.matrixWorld),
          hit = new Raycaster(
            centre.clone().addScaledVector(outward, 2),
            outward.clone().negate(),
          ).intersectObject(mesh)[0],
          expected = normal.getY(a) < -0.5 ? 1 : 0;
        expect(hit?.face?.materialIndex).toBe(expected);
        expect(hit?.point.distanceTo(centre)).toBeLessThan(0.00001);
        selected.add(expected);
      }
      expect(selected).toEqual(new Set([0, 1]));
      mesh.geometry.dispose();
      materials.forEach((material) => material.dispose());
    },
  );

  it('bounds a furnished two-storey starter to at most 355 structural submissions', () => {
    const compiled = compileBuilding(
      createHouse({ id: 'call-budget', name: 'Budget', storeys: 2 }),
    );
    let calls = 0;
    for (const part of compiled.parts) {
      const geometry = partGeometry(part);
      calls += geometry.groups.length || 1;
      geometry.dispose();
    }
    expect(compiled.parts.length).toBeGreaterThan(200);
    expect(calls).toBeLessThanOrEqual(355);
  });
});
