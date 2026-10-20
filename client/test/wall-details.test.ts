import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { createHouse } from '@refloor/catalogue/houses';
import { wallDetailGeometry } from '@/shared/scene/wall-details';

describe('batched architectural details', () => {
  it('reduces detail draw calls while retaining every storey and material category', () => {
    const house = createHouse({ id: 'batched-details', name: 'Batched details', storeys: 2 });
    let previous = 0,
      batched = 0;
    for (const floor of house.floors)
      for (const wall of floor.walls) {
        const doors = wall.openings.filter((opening) => opening.kind === 'door'),
          geometry = wallDetailGeometry(wall);
        previous += doors.length + 1;
        previous += wall.openings.reduce(
          (sum, opening) => sum + (opening.kind === 'door' ? 3 : 5),
          0,
        );
        for (const value of [geometry.paint, geometry.wood]) {
          if (!value) continue;
          batched++;
          expect(value.groups).toHaveLength(0);
          expect(value.attributes.position!.count).toBeGreaterThan(0);
          expect([...value.attributes.position!.array].every(Number.isFinite)).toBe(true);
          expect(value.attributes.normal!.count).toBe(value.attributes.position!.count);
          expect(value.attributes.uv!.count).toBe(value.attributes.position!.count);
          value.dispose();
        }
      }
    expect(batched).toBeLessThan(previous * 0.5);
  });

  it('keeps door openings clear at the threshold and through the full opening height', () => {
    const house = createHouse({ id: 'clear-threshold', name: 'Clear threshold', storeys: 1 }),
      material = new MeshBasicMaterial({ side: DoubleSide });
    let tested = 0;
    for (const floor of house.floors)
      for (const wall of floor.walls) {
        const geometry = wallDetailGeometry(wall),
          meshes = [geometry.paint, geometry.wood].flatMap((value) =>
            value ? [new Mesh(value, material)] : [],
          );
        for (const door of wall.openings.filter((opening) => opening.kind === 'door')) {
          tested++;
          for (const height of [0.055, 1, door.height - 0.05]) {
            const ray = new Raycaster(
              new Vector3(door.offset + door.width / 2, height, -1),
              new Vector3(0, 0, 1),
              0,
              2,
            );
            expect(ray.intersectObjects(meshes)).toHaveLength(0);
          }
        }
        geometry.paint?.dispose();
        geometry.wood?.dispose();
      }
    expect(tested).toBeGreaterThan(0);
    material.dispose();
  });
});
