import { describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { assetFromCatalogue } from '@refloor/catalogue';
import { createHouse } from '@refloor/catalogue/houses';
import { applyCommands, fingerprintBuilding, undoRevision } from '@refloor/scene';
import { compileBuilding } from '@refloor/engine';
import {
  fixtureOccludes,
  fixtureProgress,
  fixtureToggle,
  FixtureRaycastBudget,
} from '@/shared/behaviours/fixture';
import { FixtureReservations, fixtureReservations } from '@/shared/behaviours/fixture-motion';
import { CharacterWorld } from '@/shared/navigation/physics-world';

describe('household handle interactions', () => {
  it('operates kitchen burners and water independently and restores the exact document', () => {
    const building = createHouse({ id: 'fixture-handles', name: 'Handles', storeys: 1 }),
      kitchen = building.objects.find((value) => value.assetId === 'catalogue/kitchen-counter')!;
    const edit = {
        id: 'operate',
        at: new Date().toISOString(),
        expectedRevision: building.revision,
        commands: [fixtureToggle(kitchen, 'cooker', 3), fixtureToggle(kitchen, 'water')],
      },
      result = applyCommands(building, edit),
      changed = result.building.objects.find((value) => value.id === kitchen.id)!;
    expect(changed.behaviours.find((value) => value.kind === 'cooker')?.state).toMatchObject({
      powered: true,
      burners: [false, false, false, true],
    });
    expect(changed.behaviours.find((value) => value.kind === 'water')?.state.powered).toBe(true);
    expect(changed.behaviours.find((value) => value.kind === 'openable')?.state.open).toBe(false);
    const restored = undoRevision(result.building, result.revision, { id: 'undo', at: edit.at });
    expect(fingerprintBuilding(restored.building)).toBe(fingerprintBuilding(building));
  });

  it('keeps opaque fixture bodies as occluders while accepting visible handles and thin shower glazing', () => {
    const geometry = new BoxGeometry(1, 1, 0.1),
      material = new MeshBasicMaterial(),
      panel = new Mesh(geometry, material),
      ray = new Raycaster(new Vector3(0, 0, 2), new Vector3(0, 0, -1));
    panel.updateMatrixWorld();
    try {
      const hit = ray.intersectObject(panel)[0]!;
      expect(fixtureOccludes(hit, 2.5)).toBe(true);
      expect(fixtureOccludes(hit, 2)).toBe(false);
      material.transparent = true;
      material.opacity = 0.13;
      expect(fixtureOccludes(hit, 2.5)).toBe(false);
      material.opacity = 1;
      panel.visible = false;
      expect(fixtureOccludes(hit, 2.5)).toBe(false);
    } finally {
      geometry.dispose();
      material.dispose();
    }
    const budget = new FixtureRaycastBudget();
    expect([budget.acquire(1), budget.acquire(1), budget.acquire(1)]).toEqual([true, true, false]);
    expect(budget.acquire(2)).toBe(true);
  });

  it('converges the motion and reserves shared fronts until every panel has closed', () => {
    let fraction = 1;
    for (let frame = 0; frame < 90; frame++) fraction = fixtureProgress(fraction, 0, 1 / 60);
    expect(fraction).toBe(0);
    const reservations = new FixtureReservations(),
      a = Symbol(),
      b = Symbol();
    reservations.reserve(a, 'house', 'fridge');
    reservations.reserve(b, 'house', 'fridge');
    reservations.release(a);
    expect([...reservations.forBuilding('house')]).toEqual(['fridge']);
    expect([...reservations.forBuilding('other')]).toEqual([]);
    reservations.release(b);
    expect([...reservations.forBuilding('house')]).toEqual([]);
  });

  it('keeps a real collision reservation while closed-state refrigerator panels finish moving', () => {
    const building = createHouse({ id: 'closing-fridge', name: 'Closing', storeys: 1 }),
      floor = building.floors[0]!,
      room = floor.rooms.find((value) => value.kind === 'kitchen')!,
      object = {
        ...assetFromCatalogue('catalogue/fridge'),
        id: 'fridge',
        floorId: floor.id,
        roomId: room.id,
        position: {
          x: room.footprint.x + room.footprint.width / 2,
          y: 0,
          z: room.footprint.z + room.footprint.depth / 2,
        },
        rotation: 0,
      };
    building.objects = [object];
    const compiled = compileBuilding(building),
      world = new CharacterWorld(compiled, {
        x: object.position.x,
        y: floor.elevation,
        z: object.position.z + 1.5,
      }),
      owner = Symbol(),
      before = world.world.colliders.len();
    try {
      fixtureReservations.reserve(owner, building.id, object.id);
      world.syncFixtureMotions();
      expect(world.world.colliders.len()).toBe(before + 1);
      for (let frame = 0; frame < 45; frame++) world.step({ x: 0, z: -1 }, 1 / 60);
      const reserved = world.feet.z;
      fixtureReservations.release(owner);
      world.syncFixtureMotions();
      expect(world.world.colliders.len()).toBe(before);
      for (let frame = 0; frame < 45; frame++) world.step({ x: 0, z: -1 }, 1 / 60);
      expect(world.feet.z).toBeLessThan(reserved - 0.2);
      expect(
        compiled.building.objects[0]!.behaviours.find((value) => value.kind === 'openable')?.state
          .open,
      ).toBe(false);
    } finally {
      fixtureReservations.release(owner);
      world.dispose();
    }
  });
});
