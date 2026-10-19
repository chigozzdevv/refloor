import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import { createEditMemory } from '@refloor/scene/edit-memory';
import { applyCommands } from '@refloor/scene';
import type { Building } from '@refloor/scene';
import { destinations } from '@/shared/navigation/destinations';
import { arrivalView } from '@/shared/navigation/arrival';
import { tourPortals } from '@/shared/navigation/portals';
import { CharacterWorld, initializePhysics } from '@/shared/navigation/physics-world';
import { Walkthrough } from '@/shared/navigation/walkthrough';

beforeAll(initializePhysics);
const houses = [
  createHouse({ id: 'tour-garden', name: 'Garden', storeys: 1 }),
  createHouse({ id: 'tour-linden', name: 'Linden', storeys: 2 }),
  ...['generated-bungalow', 'generated-two-storey'].map(
    (name) =>
      JSON.parse(
        readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'),
      ) as Building,
  ),
];

describe('complete walkthrough', () => {
  it.each(houses)(
    'opens, crosses and closes doors and faces a usable view at every stop in $name',
    (building) => {
      let compiled = compileBuilding(building),
        world = new CharacterWorld(compiled);
      const tour = new Walkthrough();
      tour.doors.recover(compiled, createEditMemory(building));
      const fractions = new Map(compiled.doors.map((door) => [door.id, Number(door.open)]));
      const stops = destinations(compiled).filter((stop) => stop.kind === 'room');
      let view = { yaw: Math.PI, pitch: 0.2 };
      try {
        for (const stop of [...stops, ...stops.toReversed()]) {
          const request = {
            id: crypto.randomUUID(),
            target: stop.target,
            label: stop.label,
            ...(stop.lookAt ? { lookAt: stop.lookAt } : {}),
          };
          let arrived = false;
          const trace: string[] = [];
          for (let frame = 0; frame < 9000; frame++) {
            for (const door of compiled.doors) {
              const next = MathUtils.damp(fractions.get(door.id)!, Number(door.open), 9, 1 / 60);
              if (!world.doorBlocked(door.id, next)) fractions.set(door.id, next);
              world.setDoorFraction(door.id, fractions.get(door.id)!);
            }
            const result = tour.step(world, arrived ? null : request, view, 1 / 60);
            view = result;
            if (result.commands.length) {
              expect(
                result.commands.filter((command) => command.type === 'set-door' && command.open),
              ).toHaveLength(
                result.commands.some((command) => command.type === 'set-door' && command.open)
                  ? 1
                  : 0,
              );
              const changed = applyCommands(compiled.building, {
                id: crypto.randomUUID(),
                at: new Date().toISOString(),
                expectedRevision: compiled.building.revision,
                commands: result.commands,
              });
              trace.push(
                result.commands
                  .map((c) => (c.type === 'set-door' ? `${c.doorId}:${c.open}` : c.type))
                  .join(','),
              );
              const position = world.feet;
              world.dispose();
              compiled = compileBuilding(changed.building);
              world = new CharacterWorld(compiled, position);
            }
            expect(
              result.status,
              JSON.stringify({ stop: stop.label, feet: world.feet, trace, reason: result.reason }),
            ).not.toBe('blocked');
            if (result.status === 'arrived') arrived = true;
            if (arrived && compiled.doors.every((door) => !door.open)) break;
          }
          expect(arrived, JSON.stringify({ stop: stop.label, feet: world.feet, trace })).toBe(true);
          expect(
            compiled.doors.filter((door) => door.open),
            stop.label,
          ).toEqual([]);
          const facing = arrivalView(compiled, stop.target, stop.lookAt);
          expect(facing, stop.label).not.toBeNull();
          const camera = new PerspectiveCamera(65, 1.6, 0.08, 200);
          camera.position.set(world.feet.x, world.feet.y + 1.62, world.feet.z);
          camera.rotation.set(view.pitch, view.yaw, 0, 'YXZ');
          camera.updateMatrixWorld(true);
          const point = new Vector3(facing!.point.x, facing!.point.y, facing!.point.z).project(
            camera,
          );
          expect(Math.abs(point.x), stop.label).toBeLessThan(0.8);
          expect(Math.abs(point.y), stop.label).toBeLessThan(0.8);
          expect(point.z, stop.label).toBeLessThan(1);
          expect(
            tourPortals(compiled, world.player, destinations(compiled)).length,
            stop.label,
          ).toBeGreaterThan(0);
        }
      } finally {
        world.dispose();
      }
    },
    60000,
  );
});
