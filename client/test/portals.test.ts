import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Building } from '@refloor/scene';
import { compileBuilding } from '@refloor/engine';
import { createHouse } from '@refloor/catalogue/houses';
import {
  destinations,
  destinationRoute,
  stairContinuation,
} from '@/shared/navigation/destinations';
import { navigationCues, tourPortals } from '@/shared/navigation/portals';
import { organizeMarkers } from '@/shared/navigation/marker-layout';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { entryPose } from '@/shared/navigation/entry';

const generated = JSON.parse(
  readFileSync(new URL('fixtures/generated-two-storey.json', import.meta.url), 'utf8'),
) as Building;

describe('tour portal access', () => {
  it('offers explicit destinations in both directions when stopped between floors', () => {
    const compiled = compileBuilding(
      createHouse({ id: 'mid-flight', name: 'Mid-flight', storeys: 2 }),
    );
    const stair = compiled.stairs[0]!,
      player = {
        floorId: stair.lower.floorId,
        position: stair.path[Math.floor(stair.path.length / 2)]!,
      };
    const links = stairContinuation(compiled, player);
    expect(links).toHaveLength(2);
    expect(links.find((link) => link.direction === 'down')?.target).toEqual(stair.lower);
    expect(links.find((link) => link.direction === 'up')?.target).toEqual(stair.upper);
    for (const link of links) {
      const tread = stair.path.find(
        (point) => point.x === link.anchor.x && point.z === link.anchor.z,
      )!;
      expect(link.anchor.y - 0.055).toBeCloseTo(tread.y);
      expect(
        link.direction === 'down' ? tread.y <= player.position.y : tread.y >= player.position.y,
      ).toBe(true);
      expect(
        Math.hypot(link.anchor.x - player.position.x, link.anchor.z - player.position.z),
      ).toBeLessThan(2);
    }
  });
  it('offers a room exit without projecting the downstairs marker through bedroom walls', () => {
    const compiled = compileBuilding(
        createHouse({ id: 'studio-exit', name: 'Studio exit', storeys: 2 }),
      ),
      stops = destinations(compiled),
      room = compiled.building.floors[1]!.rooms.find((value) => value.kind === 'workspace')!,
      start = stops.find((stop) => stop.kind === 'room' && stop.roomId === room.id)!.target,
      portals = tourPortals(compiled, start, stops),
      downstairs = portals.find((stop) => stop.direction === 'down');
    expect(portals.some((stop) => stop.kind === 'door' && stop.roomId === room.id)).toBe(true);
    expect(downstairs).toBeUndefined();
  });
  it.each([createHouse({ id: 'landing', name: 'Landing', storeys: 2 }), generated])(
    'anchors stair dots to real treads and offers only the correct direction at each landing in $name',
    (building) => {
      const compiled = compileBuilding(building),
        stops = destinations(compiled);
      for (const stair of compiled.stairs) {
        for (const [landing, direction] of [
          [stair.lower, 'up'],
          [stair.upper, 'down'],
        ] as const) {
          const stairs = tourPortals(compiled, landing, stops).filter(
            (stop) => stop.kind === 'stairs',
          );
          expect(stairs).toHaveLength(1);
          const marker = stairs[0]!;
          expect(marker.direction).toBe(direction);
          expect(marker.approach).toEqual(landing);
          expect(
            stair.path.some(
              (point) =>
                point.x === marker.anchor.x &&
                point.z === marker.anchor.z &&
                Math.abs(point.y + 0.055 - marker.anchor.y) < 0.001,
            ),
          ).toBe(true);
          expect(
            direction === 'up'
              ? marker.anchor.y > landing.position.y
              : marker.anchor.y < landing.position.y,
          ).toBe(true);
          expect(
            tourPortals(
              compiled,
              { ...landing, position: { ...landing.position, y: landing.position.y + 0.5 } },
              stops,
            ).some((stop) => stop.kind === 'stairs'),
          ).toBe(false);
        }
      }
    },
  );
  it('keeps a closed room exit available whether its doorway marker is visible or offscreen', () => {
    const compiled = compileBuilding(
      createHouse({ id: 'persistent-exit', name: 'Persistent exit', storeys: 2 }),
    );
    const stops = destinations(compiled),
      room = compiled.building.floors[1]!.rooms.find((value) => value.kind === 'workspace')!,
      player = stops.find((stop) => stop.kind === 'room' && stop.roomId === room.id)!.target,
      links = tourPortals(compiled, player, stops),
      exit = links.find((stop) => stop.kind === 'door')!;
    expect(exit).toBeDefined();
    for (const x of [400, -400]) {
      const layout = organizeMarkers([{ destination: exit, x, y: 250, distance: 3 }], 800, 600);
      expect(layout).toHaveLength(x > 0 ? 1 : 0);
      const cues = navigationCues(compiled, player, links);
      expect(cues).toEqual(
        links.map((destination) => ({
          destination,
          label: `Exit to ${destination.caption}`,
        })),
      );
      expect(cues[0]!.destination.doorId).toBe(exit.doorId);
    }
  });
  it('preserves semantic stair directions and names throughout a turn or mid-flight stop', () => {
    const compiled = compileBuilding(
      createHouse({ id: 'stair-cues', name: 'Stair cues', storeys: 2 }),
    );
    const stair = compiled.stairs[0]!,
      player = {
        floorId: stair.lower.floorId,
        position: stair.path[Math.floor(stair.path.length / 2)]!,
      },
      links = stairContinuation(compiled, player),
      cues = navigationCues(compiled, player, links);
    expect(cues.map((cue) => cue.label)).toEqual(['Upstairs', 'Downstairs']);
    expect(cues.map((cue) => cue.destination.direction)).toEqual(['up', 'down']);
    expect(cues.find((cue) => cue.destination.direction === 'up')!.destination.target).toEqual(
      stair.upper,
    );
    expect(cues.find((cue) => cue.destination.direction === 'down')!.destination.target).toEqual(
      stair.lower,
    );
  });
  it('keeps room choices beside nearby stair controls in shared circulation', () => {
    const compiled = compileBuilding(
      createHouse({ id: 'hall-cue-order', name: 'Hall cue order', storeys: 2 }),
    );
    const stops = destinations(compiled),
      stair = compiled.stairs[0]!;
    for (const [player, direction] of [
      [stair.lower, 'up'],
      [stair.upper, 'down'],
    ] as const) {
      const links = tourPortals(compiled, player, stops),
        cues = navigationCues(compiled, player, links);
      expect(links.some((link) => link.kind === 'door')).toBe(true);
      expect(cues.filter((cue) => cue.destination.kind === 'door')).toEqual(
        links
          .filter((destination) => destination.kind === 'door')
          .map((destination) => ({ destination, label: destination.caption })),
      );
      expect(cues.find((cue) => cue.destination.kind === 'stairs')?.destination.direction).toBe(
        direction,
      );
      expect(navigationCues(compiled, player, [...links.toReversed(), ...links])).toEqual(cues);
    }
  });
  it.each([createHouse({ id: 'entrance-cues', name: 'Entrance cues', storeys: 2 }), generated])(
    'offers entrance room choices before offering stairs farther inside $name',
    (building) => {
      const compiled = compileBuilding(building),
        entry = entryPose(compiled),
        player = { floorId: entry.floorId, position: entry.inside },
        stops = destinations(compiled),
        stair = stops.find((stop) => stop.kind === 'stairs' && stop.direction === 'up')!,
        path = destinationRoute(compiled, player, stair.approach!, 'current'),
        links = tourPortals(compiled, player, stops),
        cues = navigationCues(compiled, player, links);
      expect(path).not.toBeNull();
      expect(path!.length).toBeGreaterThan(2);
      expect(cues.some((cue) => cue.destination.kind === 'stairs')).toBe(false);
      expect(cues.some((cue) => cue.destination.kind === 'door')).toBe(true);
      expect(cues.every((cue) => !cue.label.startsWith('Exit to'))).toBe(true);
    },
  );
  it('keeps named room choices in entrance and landing hubs while private rooms have one exit', () => {
    const compiled = compileBuilding(
      createHouse({ id: 'hub-exits', name: 'Hub exits', storeys: 2 }),
    );
    const stops = destinations(compiled);
    for (const room of compiled.building.floors.flatMap((floor) => floor.rooms)) {
      const player = stops.find((stop) => stop.kind === 'room' && stop.roomId === room.id)!.target,
        links = tourPortals(compiled, player, stops),
        cues = navigationCues(compiled, player, links);
      if (room.kind === 'living') {
        expect(links.some((link) => link.kind === 'door')).toBe(true);
        expect(cues.some((cue) => cue.destination.kind === 'door')).toBe(true);
        expect(cues.every((cue) => !cue.label.startsWith('Exit to'))).toBe(true);
      } else {
        expect(cues).toHaveLength(1);
        expect(cues[0]!.label).toBe(
          `Exit to ${room.id.startsWith('ground/') ? 'Living & dining' : 'Gallery & lounge'}`,
        );
      }
    }
  });
  it('keeps a connecting-room choice beside one stable exit toward the entrance hall', () => {
    const building = structuredClone(generated),
      floor = building.floors[0]!,
      divider = floor.walls.find((wall) => wall.id === 'ground/divider-2')!,
      door = floor.walls
        .flatMap((wall) => wall.openings)
        .find((opening) => opening.kind === 'door')!;
    divider.openings.push({ ...structuredClone(door), id: 'workspace-bathroom', offset: 0.35 });
    const compiled = compileBuilding(building),
      stops = destinations(compiled),
      player = stops.find(
        (stop) => stop.kind === 'room' && stop.roomId === 'ground/room-3',
      )!.target,
      links = tourPortals(compiled, player, stops);
    expect(links.filter((link) => link.kind === 'door')).toHaveLength(2);
    const cues = navigationCues(compiled, player, links);
    expect(cues.map((cue) => cue.label)).toEqual([
      'Exit to Entrance hall',
      'Ground-Floor Bathroom',
    ]);
    expect(cues[0]!.destination.doorId).toBe('ground/room-3/door');
    expect(cues[1]!.destination.doorId).toBe('workspace-bathroom');
    expect(navigationCues(compiled, player, [...links.toReversed(), ...links])).toEqual(cues);
  });
  it('passes the clicked doorway through the shared journey request', () => {
    const compiled = compileBuilding(
      createHouse({ id: 'clicked-exit', name: 'Clicked exit', storeys: 1 }),
    );
    const door = destinations(compiled).find((stop) => stop.kind === 'door')!;
    useNavigation.getState().go(door.target, door.lookAt, door.label, door.doorId);
    expect(useNavigation.getState().request).toMatchObject({
      target: door.target,
      label: door.label,
      doorId: door.doorId,
    });
    useNavigation.getState().stop();
    expect(useNavigation.getState().request).toBeNull();
  });
});
