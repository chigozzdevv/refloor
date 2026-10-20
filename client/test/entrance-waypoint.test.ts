import { beforeAll, describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import { contains } from '@refloor/engine/math';
import { applyCommands } from '@refloor/scene';
import { DoorMotion } from '@/shared/behaviours/door-motion';
import { traverseDoor } from '@/shared/behaviours/door';
import { destinations } from '@/shared/navigation/destinations';
import { entryPose } from '@/shared/navigation/entry';
import { navigationCues, tourPortals } from '@/shared/navigation/portals';
import { CharacterWorld, initializePhysics } from '@/shared/navigation/physics-world';
import { physicsSession } from '@/shared/navigation/physics-session';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { Walkthrough } from '@/shared/navigation/walkthrough';
import { useProject } from '@/shared/scene/scene-store';
import { arrivalView } from '@/shared/navigation/arrival';

beforeAll(initializePhysics);

describe('entrance approach', () => {
  it.each([1, 2] as const)(
    'guides visitors to the closed entrance handle before walking outside in a %s-storey home',
    (storeys) => {
      let compiled = compileBuilding(
        createHouse({ id: `entrance-waypoint-${storeys}`, name: 'Entrance waypoint', storeys }),
      );
      const entry = entryPose(compiled),
        room = compiled.building.floors[0]!.rooms.find((value) =>
          contains(value.footprint, entry.inside),
        )!,
        stop = destinations(compiled).find(
          (value) =>
            value.kind === 'room' &&
            value.roomId === room.id &&
            Math.hypot(
              value.target.position.x - entry.inside.x,
              value.target.position.z - entry.inside.z,
            ) > 0.8,
        )!,
        previous = useProject.getState(),
        previousWorld = physicsSession.current;
      expect(stop).toBeDefined();
      let world = new CharacterWorld(compiled, stop.target.position);
      const tour = new Walkthrough(),
        links = tourPortals(compiled, world.player, destinations(compiled)),
        cue = navigationCues(compiled, world.player, links).find(
          (value) => value.destination.id === `entrance:${entry.doorId}`,
        )!;
      expect(cue).toBeDefined();
      expect(cue.label).toBe('Walk to entrance');
      expect(cue.destination.doorId).toBeUndefined();
      expect(cue.destination.target).toEqual({ floorId: entry.floorId, position: entry.inside });
      let view = { yaw: 0, pitch: 0 };
      try {
        const request = {
          id: crypto.randomUUID(),
          target: cue.destination.target,
          label: cue.label,
          lookAt: cue.destination.lookAt!,
        };
        let arrived = false;
        for (let frame = 0; frame < 1800; frame++) {
          const result = tour.step(world, request, view, 1 / 60);
          view = result;
          expect(result.commands).toEqual([]);
          expect(result.status).not.toBe('blocked');
          if (result.status === 'arrived') {
            arrived = true;
            break;
          }
        }
        expect(arrived).toBe(true);
        expect(compiled.doors.find((door) => door.id === entry.doorId)!.open).toBe(false);
        const facing = Math.atan2(world.feet.x - entry.target.x, world.feet.z - entry.target.z);
        expect(
          Math.abs(Math.atan2(Math.sin(view.yaw - facing), Math.cos(view.yaw - facing))),
        ).toBeLessThan(0.08);
        expect(
          Math.hypot(world.feet.x - entry.target.x, world.feet.z - entry.target.z),
        ).toBeLessThan(3);
        expect(
          tourPortals(compiled, world.player, destinations(compiled)).some(
            (value) => value.id === cue.destination.id,
          ),
        ).toBe(false);
        physicsSession.current = world;
        useProject.setState({ compiled, mode: 'walk', floorId: entry.floorId });
        traverseDoor(entry.doorId);
        const outside = useNavigation.getState().request!;
        expect(outside.doorId).toBe(entry.doorId);
        expect(contains(compiled.building.floors[0]!.footprint, outside.target.position)).toBe(
          false,
        );
        const motion = new DoorMotion(false);
        arrived = false;
        for (let frame = 0; frame < 1800; frame++) {
          const door = compiled.doors.find((value) => value.id === entry.doorId)!;
          motion.step(door.open, 1 / 60, (fraction) => world.doorBlocked(door.id, fraction));
          world.setDoorFraction(door.id, motion.fraction);
          const result = tour.step(world, outside, view, 1 / 60);
          view = result;
          expect(result.status).not.toBe('blocked');
          if (result.commands.length) {
            const changed = applyCommands(compiled.building, {
              id: crypto.randomUUID(),
              at: new Date().toISOString(),
              expectedRevision: compiled.building.revision,
              commands: result.commands,
            });
            const position = world.feet;
            world.dispose();
            compiled = compileBuilding(changed.building);
            world = new CharacterWorld(compiled, position);
          }
          if (result.status === 'arrived') {
            arrived = true;
            break;
          }
        }
        expect(arrived).toBe(true);
        expect(contains(compiled.building.floors[0]!.footprint, world.feet)).toBe(false);
        const exteriorView = arrivalView(compiled, world.player);
        expect(exteriorView?.kind).toBe('object');
        const exteriorFacing = Math.atan2(
          world.feet.x - exteriorView!.point.x,
          world.feet.z - exteriorView!.point.z,
        );
        expect(
          Math.abs(
            Math.atan2(Math.sin(view.yaw - exteriorFacing), Math.cos(view.yaw - exteriorFacing)),
          ),
        ).toBeLessThan(0.08);
      } finally {
        useNavigation.getState().stop();
        useProject.setState(previous, true);
        physicsSession.current = previousWorld;
        world.dispose();
      }
    },
  );
});
