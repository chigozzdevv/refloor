import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding, isPlayerPositionValid } from '@refloor/engine';
import type { NavigationPoint } from '@refloor/engine';
import { applyCommands } from '@refloor/scene';
import type { Building } from '@refloor/scene';
import { MapPlan } from '@/components/navigation/map-plan';
import { DoorMotion } from '@/shared/behaviours/door-motion';
import { traverseDoor } from '@/shared/behaviours/door';
import { compoundDoorExit, compoundPath } from '@/shared/navigation/compound-route';
import { createJourney, stepJourney } from '@/shared/navigation/journey';
import { destinationRoute } from '@/shared/navigation/destinations';
import { entryPose } from '@/shared/navigation/entry';
import { mapDestination } from '@/shared/navigation/map-route';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { CharacterWorld, initializePhysics } from '@/shared/navigation/physics-world';
import { physicsSession } from '@/shared/navigation/physics-session';
import { Walkthrough } from '@/shared/navigation/walkthrough';
import { useProject } from '@/shared/scene/scene-store';

beforeAll(initializePhysics);
const houses = [
  createHouse({ id: 'map-garden', name: 'Garden', storeys: 1 }),
  createHouse({ id: 'map-linden', name: 'Linden', storeys: 2 }),
  ...['generated-bungalow', 'generated-two-storey'].map(
    (name) =>
      JSON.parse(
        readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'),
      ) as Building,
  ),
];

describe('map navigation', () => {
  it('keeps compact rooms interactive without changing the compact presentation', () => {
    const compiled = compileBuilding(houses[1]!),
      floor = compiled.building.floors[0]!,
      markup = renderToStaticMarkup(
        createElement(MapPlan, {
          compiled,
          floorId: floor.id,
          player: null,
          heading: 0,
          compact: true,
          navigate: () => undefined,
        }),
      );
    expect(markup).toContain('plan-compact');
    expect(markup.match(/role="button"/g)).toHaveLength(floor.rooms.length);
    for (const room of floor.rooms)
      expect(markup).toContain(`Go to ${room.name.replaceAll('&', '&amp;')}`);
    expect(markup).not.toContain('plan-furniture');
  });

  it.each(houses)(
    'routes map room choices from the compound and crosses real doors and stairs in $name',
    (building) => {
      let compiled = compileBuilding(
        applyCommands(building, {
          id: 'closed-doors',
          at: '2026-10-19T12:00:00Z',
          expectedRevision: building.revision,
          commands: building.floors.flatMap((floor) =>
            floor.walls.flatMap((wall) =>
              wall.openings
                .filter((opening) => opening.kind === 'door')
                .map((door) => ({ type: 'set-door', doorId: door.id, open: false }) as const),
            ),
          ),
        }).building,
      );
      const entry = entryPose(compiled),
        outside = {
          floorId: entry.floorId,
          position: { x: entry.outside.x, y: -0.095, z: entry.outside.z },
        };
      for (const floor of compiled.building.floors)
        for (const room of floor.rooms) {
          const destination = mapDestination(compiled, outside, room.id);
          expect(destination, room.name).toBeDefined();
          expect(
            destinationRoute(compiled, outside, destination!.target, 'openable')?.doorIds,
          ).toContain(entry.doorId);
          expect(destinationRoute(compiled, outside, destination!.target, 'current')).toBeNull();
        }
      let world = new CharacterWorld(compiled, outside.position),
        view = { yaw: 0, pitch: 0 };
      const tour = new Walkthrough(),
        motions = new Map(compiled.doors.map((door) => [door.id, new DoorMotion(door.open)]));
      const travel = (target: NavigationPoint, label: string) => {
        const request = { id: crypto.randomUUID(), target, label };
        let arrived = false;
        const trace: string[] = [];
        for (let frame = 0; frame < 9000; frame++) {
          for (const door of compiled.doors) {
            const motion = motions.get(door.id)!;
            motion.step(door.open, 1 / 60, (fraction) => world.doorBlocked(door.id, fraction));
            world.setDoorFraction(door.id, motion.fraction);
          }
          const result = tour.step(world, arrived ? null : request, view, 1 / 60);
          view = result;
          if (result.commands.length) {
            const changed = applyCommands(compiled.building, {
              id: crypto.randomUUID(),
              at: new Date().toISOString(),
              expectedRevision: compiled.building.revision,
              commands: result.commands,
            });
            trace.push(JSON.stringify(result.commands));
            expect(
              trace.length,
              JSON.stringify({ label, player: world.player, trace }),
            ).toBeLessThan(20);
            const position = world.feet;
            world.dispose();
            compiled = compileBuilding(changed.building);
            world = new CharacterWorld(compiled, position);
          }
          expect(
            result.status,
            JSON.stringify({ label, player: world.player, reason: result.reason, trace }),
          ).not.toBe('blocked');
          if (result.status === 'arrived') arrived = true;
          if (arrived && compiled.doors.every((door) => !door.open)) break;
        }
        expect(arrived, JSON.stringify({ label, player: world.player, trace })).toBe(true);
        expect(
          Math.hypot(world.feet.x - target.position.x, world.feet.z - target.position.z),
        ).toBeLessThan(0.05);
        expect(isPlayerPositionValid(compiled, world.player)).toBe(true);
        expect(compiled.doors.filter((door) => door.open)).toEqual([]);
      };
      try {
        for (const floor of compiled.building.floors) {
          const room = floor.rooms.findLast(
            (value) => !['corridor', 'stairwell'].includes(value.kind),
          )!;
          const destination = mapDestination(compiled, world.player, room.id)!;
          travel(destination.target, destination.label);
        }
        const door = compiled.doors.find((value) => value.id === entry.doorId)!;
        travel(compoundDoorExit(compiled, door)!, 'Step outside');
        const destination = mapDestination(
          compiled,
          world.player,
          compiled.building.floors[0]!.rooms[0]!.id,
        )!;
        travel(destination.target, destination.label);
      } finally {
        world.dispose();
      }
    },
    60000,
  );

  it('queues entrance handle traversal from outside instead of saving a manual open state', () => {
    const compiled = compileBuilding(houses[0]!),
      entry = entryPose(compiled),
      world = new CharacterWorld(compiled, { x: entry.outside.x, y: -0.095, z: entry.outside.z }),
      previous = useProject.getState(),
      previousPhysics = physicsSession.current;
    physicsSession.current = world;
    useProject.setState({ compiled, mode: 'walk', selection: null });
    try {
      traverseDoor(entry.doorId);
      expect(useNavigation.getState().request).toMatchObject({
        target: { floorId: entry.floorId, position: entry.inside },
        doorId: entry.doorId,
      });
      expect(
        useProject.getState().compiled.doors.find((door) => door.id === entry.doorId)?.open,
      ).toBe(false);
    } finally {
      useNavigation.getState().stop();
      useProject.setState(previous, true);
      physicsSession.current = previousPhysics;
      world.dispose();
    }
  });

  it('walks around the outside corner instead of routing through the building', () => {
    const compiled = compileBuilding(houses[0]!),
      entry = entryPose(compiled),
      floor = compiled.building.floors[0]!,
      start = {
        x: floor.footprint.x - 1.5,
        y: -0.095,
        z: floor.footprint.z + floor.footprint.depth * 0.7,
      },
      target = { x: entry.outside.x, y: -0.095, z: entry.outside.z },
      points = compoundPath(compiled, start, target, 'current');
    expect(points).not.toBeNull();
    expect(points!.length).toBeGreaterThan(2);
    const world = new CharacterWorld(compiled, start),
      journey = createJourney(points!);
    try {
      let status = stepJourney(world, journey, 1 / 60);
      for (let frame = 0; frame < 5000 && status === 'moving'; frame++)
        status = stepJourney(world, journey, 1 / 60);
      expect(
        status,
        JSON.stringify({ player: world.player, next: journey.points[journey.index] }),
      ).toBe('arrived');
      expect(Math.hypot(world.feet.x - target.x, world.feet.z - target.z)).toBeLessThan(0.05);
    } finally {
      world.dispose();
    }
  });
});
