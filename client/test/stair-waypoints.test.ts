import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import { contains } from '@refloor/engine/math';
import type { Building } from '@refloor/scene';
import { arrivalView } from '@/shared/navigation/arrival';
import { destinationRoute, destinations } from '@/shared/navigation/destinations';
import { entryPose } from '@/shared/navigation/entry';
import { navigationCues, tourPortals } from '@/shared/navigation/portals';
import { CharacterWorld, initializePhysics } from '@/shared/navigation/physics-world';
import { Walkthrough } from '@/shared/navigation/walkthrough';

beforeAll(initializePhysics);

const generated = JSON.parse(
  readFileSync(new URL('fixtures/generated-two-storey.json', import.meta.url), 'utf8'),
) as Building;

describe('stair approach waypoints', () => {
  it('offers a same-floor approach at the entrance before offering a floor change', () => {
    const compiled = compileBuilding(
        createHouse({ id: 'stair-approach', name: 'Stair approach', storeys: 2 }),
      ),
      entry = entryPose(compiled),
      player = { floorId: entry.floorId, position: entry.inside },
      links = tourPortals(compiled, player, destinations(compiled)),
      approach = links.find((link) => link.kind === 'waypoint')!;
    expect(approach).toBeDefined();
    expect(approach.label).toBe('Walk to stairs');
    expect(approach.target.floorId).toBe(player.floorId);
    expect(links.some((link) => link.kind === 'stairs')).toBe(false);
    expect(destinationRoute(compiled, player, approach.target, 'current')!.stairIds).toEqual([]);
    expect(navigationCues(compiled, player, links)).toContainEqual({
      destination: approach,
      label: 'Walk to stairs',
    });
    const atStairs = tourPortals(compiled, approach.target, destinations(compiled));
    expect(atStairs.some((link) => link.kind === 'waypoint' && link.stairId)).toBe(false);
    expect(atStairs.some((link) => link.kind === 'stairs' && link.direction === 'up')).toBe(true);
  });

  it('keeps stair guidance out of bedrooms separated from the circulation room', () => {
    const compiled = compileBuilding(generated),
      stop = destinations(compiled).find(
        (value) =>
          value.kind === 'room' &&
          generated.floors.some((floor) =>
            floor.rooms.some((room) => room.kind === 'bedroom' && room.id === value.roomId),
          ),
      )!;
    expect(stop).toBeDefined();
    const links = tourPortals(compiled, stop.target, destinations(compiled));
    expect(links.some((link) => link.kind === 'waypoint' || link.kind === 'stairs')).toBe(false);
  });

  it('walks from a bedroom exit to the stairs and downstairs with real collision physics', () => {
    const compiled = compileBuilding(generated),
      upper = compiled.building.floors[1]!,
      stops = destinations(compiled),
      exit = stops.find((stop) => {
        if (stop.kind !== 'door' || stop.floorId !== upper.id) return false;
        const room = upper.rooms.find((value) => contains(value.footprint, stop.target.position));
        return (
          room?.kind === 'corridor' &&
          tourPortals(compiled, stop.target, stops).some((link) => link.kind === 'waypoint')
        );
      })!;
    expect(exit).toBeDefined();
    const approach = tourPortals(compiled, exit.target, stops).find(
        (link) => link.kind === 'waypoint',
      )!,
      world = new CharacterWorld(compiled, exit.target.position),
      tour = new Walkthrough();
    let view = { yaw: 0, pitch: 0 };
    const travel = (target: typeof approach) => {
      const request = {
        id: crypto.randomUUID(),
        target: target.target,
        label: target.label,
        ...(target.lookAt ? { lookAt: target.lookAt } : {}),
      };
      for (let frame = 0; frame < 6000; frame++) {
        const result = tour.step(world, request, view, 1 / 60);
        view = result;
        expect(result.status).not.toBe('blocked');
        expect(result.commands).toEqual([]);
        if (result.status === 'arrived') return;
      }
      throw new Error(`Did not arrive at ${target.label}: ${JSON.stringify(world.feet)}`);
    };
    try {
      travel(approach);
      expect(world.player.floorId).toBe(upper.id);
      const down = tourPortals(compiled, world.player, stops).find(
        (link) => link.kind === 'stairs' && link.direction === 'down',
      )!;
      expect(down).toBeDefined();
      travel(down);
      expect(world.player.floorId).toBe(compiled.building.floors[0]!.id);
    } finally {
      world.dispose();
    }
  });

  it('prefers a reachable stair approach to a distant inactive door after exiting a bedroom', () => {
    const compiled = compileBuilding(generated),
      upper = compiled.building.floors[1]!,
      stops = destinations(compiled),
      exit = stops.find((stop) => {
        if (stop.kind !== 'door' || stop.floorId !== upper.id) return false;
        const room = upper.rooms.find((value) => contains(value.footprint, stop.target.position));
        if (room?.kind !== 'corridor') return false;
        const links = tourPortals(compiled, stop.target, stops);
        return (
          links.some((link) => link.kind === 'waypoint') &&
          !links.some(
            (link) =>
              link.kind === 'door' &&
              link.doorId !== stop.doorId &&
              Math.hypot(
                link.anchor.x - stop.target.position.x,
                link.anchor.z - stop.target.position.z,
              ) < 3.35,
          )
        );
      })!;
    expect(exit).toBeDefined();
    const view = arrivalView(compiled, exit.target, exit.lookAt, exit.doorId);
    expect(view?.kind).toBe('route');
    expect(view?.entityId).toMatch(/^approach:stairs:/);
  });
});
