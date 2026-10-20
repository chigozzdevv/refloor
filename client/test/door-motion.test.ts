import { beforeAll, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { applyCommands } from '@refloor/scene';
import { compileBuilding } from '@refloor/engine';
import { DoorMotion } from '@/shared/behaviours/door-motion';
import { destinations } from '@/shared/navigation/destinations';
import { CharacterWorld, initializePhysics } from '@/shared/navigation/physics-world';
import { Walkthrough } from '@/shared/navigation/walkthrough';

beforeAll(initializePhysics);

it('presses the handle before swinging and opens completely within 0.34 seconds', () => {
  const motion = new DoorMotion(false);
  for (let frame = 0; frame < 3; frame++) motion.step(true, 1 / 60, () => false);
  expect(motion.handle).toBeGreaterThan(0.6);
  expect(motion.fraction).toBe(0);
  for (let frame = 0; frame < 17; frame++) motion.step(true, 1 / 60, () => false);
  expect(motion.fraction).toBe(1);
  expect(motion.handle).toBe(0);
  for (let frame = 0; frame < 18; frame++) motion.step(false, 1 / 60, () => false);
  expect(motion.fraction).toBe(0);
});

it('keeps the door responsive at ten frames per second while checking its swept path', () => {
  const motion = new DoorMotion(false);
  let checks = 0;
  for (let frame = 0; frame < 4; frame++)
    motion.step(true, 0.1, () => {
      checks++;
      return false;
    });
  expect(motion.fraction).toBe(1);
  expect(checks).toBeGreaterThan(20);
});

it('releases a held handle smoothly after a drag', () => {
  const motion = new DoorMotion(false);
  motion.press();
  for (let frame = 0; frame < 60; frame++) motion.step(false, 1 / 60, () => false, 0.5, true);
  expect(motion.handle).toBe(1);
  motion.step(false, 1 / 60, () => false);
  expect(motion.handle).toBeGreaterThan(0.9);
  for (let frame = 0; frame < 15; frame++) motion.step(false, 1 / 60, () => false);
  expect(motion.handle).toBe(0);
});

it('starts opening a nearby selected door immediately and crosses without a staging detour', () => {
  let compiled = compileBuilding(createHouse({ id: 'quick-door', name: 'Quick door', storeys: 2 }));
  const stop = destinations(compiled).find((value) => value.kind === 'door')!;
  const door = compiled.doors.find((value) => value.id === stop.doorId)!;
  let world = new CharacterWorld(compiled, stop.approach!.position);
  const motion = new DoorMotion(false),
    tour = new Walkthrough();
  const request = { id: 'enter', label: stop.label, target: stop.target, doorId: door.id };
  let view = {
    yaw: Math.atan2(world.feet.x - door.centre.x, world.feet.z - door.centre.z),
    pitch: 0,
  };
  let arrived = false;
  try {
    expect(world.canSwingDoor(door.id, true)).toBe(true);
    const first = tour.step(world, request, view, 1 / 60);
    expect(first.commands).toEqual([{ type: 'set-door', doorId: door.id, open: true }]);
    const changed = applyCommands(compiled.building, {
      id: 'open',
      at: new Date().toISOString(),
      expectedRevision: compiled.building.revision,
      commands: first.commands,
    });
    const from = world.feet;
    world.dispose();
    compiled = compileBuilding(changed.building);
    world = new CharacterWorld(compiled, from);
    for (let frame = 0; frame < 360; frame++) {
      motion.step(true, 1 / 60, (fraction) => world.doorBlocked(door.id, fraction));
      world.setDoorFraction(door.id, motion.fraction);
      const result = tour.step(world, request, view, 1 / 60);
      view = result;
      expect(result.status).not.toBe('blocked');
      if (result.status === 'arrived') {
        arrived = true;
        break;
      }
    }
    expect(arrived).toBe(true);
    expect(
      Math.hypot(world.feet.x - stop.target.position.x, world.feet.z - stop.target.position.z),
    ).toBeLessThan(0.05);
    expect(Math.hypot(world.feet.x - door.centre.x, world.feet.z - door.centre.z)).toBeLessThan(
      2.2,
    );
  } finally {
    world.dispose();
  }
});

it('keeps the animated leaf outside the actual player capsule', () => {
  const compiled = compileBuilding(
    createHouse({ id: 'blocked-door', name: 'Blocked', storeys: 1 }),
  );
  const stop = destinations(compiled).find((value) => value.kind === 'door')!;
  const door = compiled.doors.find((value) => value.id === stop.doorId)!;
  const world = new CharacterWorld(compiled, { ...door.hinge, y: door.centre.y });
  const motion = new DoorMotion(false);
  try {
    for (let frame = 0; frame < 60; frame++)
      motion.step(true, 1 / 60, (fraction) => world.doorBlocked(door.id, fraction));
    expect(motion.fraction).toBe(0);
  } finally {
    world.dispose();
  }
});
