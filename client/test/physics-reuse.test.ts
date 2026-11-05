import { expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import type { Building } from '@refloor/scene';
import { CharacterWorld } from '@/shared/navigation/physics-world';
import { entryPose } from '@/shared/navigation/entry';

it('keeps the live character and door animation through finish and device edits', () => {
  const building = createHouse({ id: 'reuse', name: 'Reuse', storeys: 1 }),
    initial = compileBuilding(building),
    world = new CharacterWorld(initial),
    entry = entryPose(initial),
    body = world.body,
    physics = world.world;
  try {
    world.setDoorFraction(entry.doorId, 0.35);
    for (let frame = 0; frame < 30; frame++) world.step({ x: 0, z: 0 }, 1 / 60);
    const position = world.feet,
      changed = structuredClone(building);
    changed.floors[0]!.walls[0]!.material.color = '#cccccc';
    changed.objects[0]!.materials.body!.color = '#88aa88';
    for (const object of changed.objects)
      for (const behaviour of object.behaviours)
        if (behaviour.kind === 'light' || behaviour.kind === 'television')
          behaviour.state.powered = !behaviour.state.powered;
    const compiled = compileBuilding(changed);
    expect(world.update(compiled)).toBe(true);
    expect(world.compiled).toBe(compiled);
    expect(world.body).toBe(body);
    expect(world.world).toBe(physics);
    expect(world.feet).toEqual(position);
    expect(world.doorFraction(entry.doorId)).toBe(0.35);
    world.teleport({ x: 2, y: 0, z: 1.5 });
    for (let frame = 0; frame < 30; frame++) world.step({ x: 1, z: 0 }, 1 / 60);
    expect(world.feet.x).toBeGreaterThan(2.2);
  } finally {
    world.dispose();
  }
});

it.each<[string, (building: Building) => void]>([
  [
    'furniture position',
    (house) => {
      house.objects[0]!.position.x += 0.2;
    },
  ],
  [
    'furniture size',
    (house) => {
      house.objects[0]!.dimensions.width += 0.2;
    },
  ],
  [
    'furniture rotation',
    (house) => {
      house.objects[0]!.rotation += 0.2;
    },
  ],
  [
    'door opening',
    (house) => {
      const door = house.floors[0]!.walls.flatMap((wall) => wall.openings).find(
        (value) => value.kind === 'door',
      )!;
      door.state.open = !door.state.open;
    },
  ],
  [
    'open cabinet clearance',
    (house) => {
      const mechanism = house.objects
        .flatMap((object) => object.behaviours)
        .find((value) => value.kind === 'openable')!;
      if (mechanism.kind === 'openable') mechanism.state.open = !mechanism.state.open;
    },
  ],
  [
    'project identity',
    (house) => {
      house.id = 'another-house';
    },
  ],
])('requires a rebuild when %s changes', (_name, change) => {
  const building = createHouse({ id: 'rebuild', name: 'Rebuild', storeys: 1 }),
    compiled = compileBuilding(building),
    world = new CharacterWorld(compiled);
  try {
    change(building);
    expect(world.update(compileBuilding(building))).toBe(false);
    expect(world.compiled).toBe(compiled);
  } finally {
    world.dispose();
  }
});

it('rebuilds when the character dimensions or stair mesh changes', () => {
  const building = createHouse({ id: 'stairs', name: 'Stairs', storeys: 2 }),
    initial = compileBuilding(building),
    world = new CharacterWorld(initial);
  try {
    expect(world.update(compileBuilding(building, { radius: initial.options.radius + 0.02 }))).toBe(
      false,
    );
    const site = structuredClone(initial);
    site.building.floors[0]!.footprint.width += 0.5;
    expect(world.update(site)).toBe(false);
    const changed = structuredClone(initial),
      stair = changed.colliders.find((collider) => collider.shape === 'mesh')!;
    if (stair.shape === 'mesh') stair.mesh.positions[0]! += 0.1;
    expect(world.update(changed)).toBe(false);
  } finally {
    world.dispose();
  }
});
