import { readFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { applyCommands } from '@refloor/scene';
import type { Building } from '@refloor/scene';
import { createEditMemory, recordTransition } from '@refloor/scene/edit-memory';
import { compileBuilding } from '@refloor/engine';
import { DoorMotion } from '@/shared/behaviours/door-motion';
import { destinations } from '@/shared/navigation/destinations';
import { CharacterWorld, initializePhysics } from '@/shared/navigation/physics-world';
import { Walkthrough } from '@/shared/navigation/walkthrough';

beforeAll(initializePhysics);
const houses = [
  createHouse({ id: 'door-garden', name: 'Garden', storeys: 1 }),
  createHouse({ id: 'door-linden', name: 'Linden', storeys: 2 }),
  ...['generated-bungalow', 'generated-two-storey'].map(
    (name) =>
      JSON.parse(
        readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'),
      ) as Building,
  ),
];

it.each(houses)(
  'crosses each selected doorway and closes it with real edit history in $name',
  (building) => {
    const initial = compileBuilding(building);
    for (const stop of destinations(initial).filter((value) => value.kind === 'door')) {
      let compiled = initial,
        memory = createEditMemory(building);
      let world = new CharacterWorld(compiled, stop.approach!.position);
      const motions = new Map(compiled.doors.map((door) => [door.id, new DoorMotion(door.open)]));
      const tour = new Walkthrough();
      tour.doors.recover(compiled, memory);
      const door = compiled.doors.find((value) => value.id === stop.doorId)!;
      let view = {
        yaw: Math.atan2(world.feet.x - door.centre.x, world.feet.z - door.centre.z),
        pitch: 0,
      };
      const request = {
        id: crypto.randomUUID(),
        label: stop.label,
        target: stop.target,
        doorId: door.id,
      };
      let arrived = false;
      try {
        for (let frame = 0; frame < 600; frame++) {
          for (const portal of compiled.doors) {
            const motion = motions.get(portal.id)!;
            motion.step(portal.open, 1 / 60, (fraction) => world.doorBlocked(portal.id, fraction));
            world.setDoorFraction(portal.id, motion.fraction);
          }
          const result = tour.step(world, arrived ? null : request, view, 1 / 60, memory);
          view = result;
          expect(result.status, `${stop.id}: ${JSON.stringify(world.feet)}`).not.toBe('blocked');
          if (result.commands.length) {
            const change = applyCommands(compiled.building, {
              id: crypto.randomUUID(),
              at: new Date().toISOString(),
              expectedRevision: compiled.building.revision,
              commands: result.commands,
            });
            memory = recordTransition(memory, change.building, {
              revision: change.revision,
              kind: 'edit',
              source: 'navigation',
              label: 'Walk through door',
            });
            const position = world.feet;
            world.dispose();
            compiled = compileBuilding(change.building);
            world = new CharacterWorld(compiled, position);
          }
          if (result.status === 'arrived') arrived = true;
          const selected = compiled.doors.find((value) => value.id === door.id)!;
          if (arrived && !selected.open && motions.get(door.id)!.fraction === 0) break;
        }
        expect(arrived, stop.id).toBe(true);
        expect(compiled.doors.find((value) => value.id === door.id)!.open, stop.id).toBe(false);
        expect(motions.get(door.id)!.fraction, stop.id).toBe(0);
      } finally {
        world.dispose();
      }
    }
  },
  60000,
);
