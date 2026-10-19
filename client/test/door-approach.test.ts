import { beforeAll, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding, isPlayerPositionValid } from '@refloor/engine';
import { createEditMemory } from '@refloor/scene/edit-memory';
import type { DocumentState } from '@/shared/editor/document';
import { editDocument } from '@/shared/editor/document';
import { DoorMotion } from '@/shared/behaviours/door-motion';
import { destinations, navigationFor } from '@/shared/navigation/destinations';
import { doorRoute } from '@/shared/navigation/door-route';
import { CharacterWorld, initializePhysics } from '@/shared/navigation/physics-world';
import { Walkthrough } from '@/shared/navigation/walkthrough';

beforeAll(initializePhysics);
it('steps out of tight wall clearance before opening through the real edit validator', () => {
  const initial = compileBuilding(
    createHouse({ id: 'tight-approach', name: 'Tight approach', storeys: 2 }),
  );
  const stop = destinations(initial).find((value) => value.kind === 'door')!;
  const door = initial.doors.find((value) => value.id === stop.doorId)!;
  const physical = { ...initial, options: { ...initial.options, clearance: 0.005 } };
  const from = navigationFor(initial, 'current')
    .nodes.filter(
      (node) =>
        node.floorId === door.floorId &&
        Math.hypot(node.position.x - door.centre.x, node.position.z - door.centre.z) < 2.4,
    )
    .flatMap((node) =>
      [
        [-0.012, 0],
        [0.012, 0],
        [0, -0.012],
        [0, 0.012],
      ].map(([x, z]) => ({
        floorId: node.floorId,
        position: { x: node.position.x + x!, y: node.position.y + 0.01, z: node.position.z + z! },
      })),
    )
    .find(
      (point) =>
        !isPlayerPositionValid(initial, point) &&
        isPlayerPositionValid(physical, point) &&
        Math.hypot(point.position.x - door.hinge.x, point.position.z - door.hinge.z) >
          door.width + initial.options.radius + 0.12,
    );
  expect(from).toBeDefined();
  let state: DocumentState = {
    compiled: initial,
    memory: createEditMemory(initial.building),
    past: [],
    future: [],
  };
  let world = new CharacterWorld(initial, from!.position);
  const motions = new Map(initial.doors.map((portal) => [portal.id, new DoorMotion(portal.open)]));
  const tour = new Walkthrough();
  const request = { id: 'tight-door', label: stop.label, target: stop.target, doorId: door.id };
  let view = { yaw: 0, pitch: 0 },
    arrived = false;
  try {
    expect(isPlayerPositionValid(initial, world.player)).toBe(false);
    expect(world.canSwingDoor(door.id, true)).toBe(true);
    const plan = doorRoute(initial, world.player, stop.target, {
      doorId: door.id,
      canSwing: (id, open) => world.canSwingDoor(id, open),
    });
    expect(plan?.staging).toBe(true);
    for (let frame = 0; frame < 1200; frame++) {
      for (const portal of state.compiled.doors) {
        const motion = motions.get(portal.id)!;
        motion.step(portal.open, 1 / 60, (fraction) => world.doorBlocked(portal.id, fraction));
        world.setDoorFraction(portal.id, motion.fraction);
      }
      const result = tour.step(world, arrived ? null : request, view, 1 / 60, state.memory);
      view = result;
      expect(
        result.status,
        JSON.stringify({ from, feet: world.feet, reason: result.reason }),
      ).not.toBe('blocked');
      if (result.commands.length) {
        const next = editDocument(state, result.commands, world.player, { source: 'navigation' });
        const feet = world.feet;
        world.dispose();
        state = next;
        world = new CharacterWorld(state.compiled, feet);
      }
      if (result.status === 'arrived') {
        arrived = true;
        break;
      }
    }
    expect(arrived).toBe(true);
  } finally {
    world.dispose();
  }
});
