import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Building } from '@refloor/scene';
import { compileBuilding } from '@refloor/engine';
import { createHouse } from '@refloor/catalogue/houses';
import { destinations, stairContinuation } from '@/shared/navigation/destinations';
import { portalPosition, tourPortals } from '@/shared/navigation/portals';

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
    expect(portals.some((stop) => stop.label === 'Leave room')).toBe(true);
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
  it('keeps a hidden doorway cue at the screen edge and points relative to the camera', () => {
    const compiled = compileBuilding(createHouse({ id: 'edge', name: 'Edge', storeys: 1 })),
      stop = destinations(compiled).find((value) => value.kind === 'door')!,
      player = { floorId: stop.floorId, position: { ...stop.anchor, x: stop.anchor.x - 2 } };
    expect(portalPosition(player, stop, 0, 320, 600)).toEqual({ x: 298, y: 288, angle: 90 });
    const rotated = portalPosition(player, stop, Math.PI, 320, 600);
    expect(rotated.x).toBe(22);
    expect(rotated.angle).toBeCloseTo(-90);
  });
});
