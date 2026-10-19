import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Building } from '@refloor/scene';
import { createHouse } from '@refloor/catalogue/houses';
import { applyCommands } from '@refloor/scene';
import { compileBuilding, isWalkable } from '@refloor/engine';
import { destinations, nearbyRoute, destinationRoute } from '@/shared/navigation/destinations';
import { tourPortals } from '@/shared/navigation/portals';
import { entryPose } from '@/shared/navigation/entry';
import { clearSegment } from '@refloor/engine/navigation/surfaces';

describe('house navigation destinations', () => {
  it('provides entry and exit markers on both sides of every generated interior door', () => {
    const building = JSON.parse(
      readFileSync(new URL('fixtures/generated-two-storey.json', import.meta.url), 'utf8'),
    ) as Building;
    const compiled = compileBuilding(building),
      markers = destinations(compiled);
    for (const door of compiled.doors.filter((value) => value.id !== 'ground/entrance')) {
      const sides = markers.filter((marker) => marker.doorId === door.id);
      expect(sides, door.id).toHaveLength(2);
      expect(new Set(sides.map((side) => side.roomId)).size).toBe(2);
      for (const side of sides) expect(isWalkable(compiled, side.target, 'openable')).toBe(true);
    }
  });
  it('keeps room doors available through a long hall and offers stairs at their landing', () => {
    const compiled = compileBuilding(
      createHouse({ id: 'long-hall', name: 'Long hall', storeys: 2, width: 14, depth: 12 }),
    );
    const entry = entryPose(compiled),
      stops = destinations(compiled);
    const player = { floorId: entry.floorId, position: entry.inside };
    const links = tourPortals(compiled, player, stops);
    expect(links.some((link) => link.kind === 'stairs')).toBe(false);
    expect(links.some((link) => link.kind === 'door')).toBe(true);
    const stair = compiled.stairs[0]!;
    expect(
      tourPortals(compiled, stair.lower, stops).some(
        (link) => link.kind === 'stairs' && link.direction === 'up',
      ),
    ).toBe(true);
    for (const link of links)
      expect(destinationRoute(compiled, player, link.target, 'openable')).not.toBeNull();
    for (const room of compiled.building.floors.flatMap((floor) => floor.rooms))
      expect(
        stops.filter((stop) => stop.kind === 'room' && stop.roomId === room.id).length,
      ).toBeLessThanOrEqual(2);
  });
  it('allows a short safe route around a stair corner without requiring a straight walk', () => {
    const compiled = compileBuilding(
      createHouse({ id: 'tour-corner', name: 'Tour corner', storeys: 2, width: 14, depth: 12 }),
    );
    const from = { floorId: 'ground', position: { x: 3.65, y: 0, z: 3 } },
      target = { floorId: 'ground', position: { x: 3.2, y: 0, z: 5.2 } };
    expect(isWalkable(compiled, from, 'current')).toBe(true);
    expect(isWalkable(compiled, target, 'current')).toBe(true);
    expect(clearSegment(compiled, from.floorId, from.position, target.position, 'current')).toBe(
      false,
    );
    expect(nearbyRoute(compiled, from, target, 'current')).toBe(true);
  });
  it.each([1, 2] as const)(
    'generates clear room targets and stair links for a %s-storey house',
    (storeys) => {
      const compiled = compileBuilding(
        createHouse({ id: `markers-${storeys}`, name: 'Markers', storeys }),
      );
      const markers = destinations(compiled);
      for (const room of compiled.building.floors.flatMap((floor) => floor.rooms))
        expect(markers.some((marker) => marker.kind === 'room' && marker.roomId === room.id)).toBe(
          true,
        );
      for (const marker of markers)
        expect(isWalkable(compiled, marker.target, 'openable')).toBe(true);
      expect(markers.filter((marker) => marker.kind === 'stairs')).toHaveLength(
        storeys === 2 ? 2 : 0,
      );
      for (const marker of markers.filter((value) => value.kind === 'stairs'))
        expect(marker.lookAt).toBeDefined();
      expect(new Set(markers.map((marker) => marker.id)).size).toBe(markers.length);
    },
  );
  it('rebuilds destinations around furniture edits instead of leaving a marker inside the object', () => {
    const building = createHouse({ id: 'edited-markers', name: 'Edited markers', storeys: 1 });
    const chair = building.objects.find((object) => object.kind === 'chair')!,
      before = destinations(compileBuilding(building)),
      marker = before.find((value) => value.kind === 'room' && value.roomId === chair.roomId)!;
    const changed = applyCommands(building, {
      id: 'move-chair',
      at: '2026-10-18T12:00:00Z',
      expectedRevision: building.revision,
      commands: [
        {
          type: 'move-object',
          objectId: chair.id,
          roomId: chair.roomId,
          rotation: 0,
          position: marker.target.position,
        },
      ],
    });
    const compiled = compileBuilding(changed.building),
      after = destinations(compiled).find((value) => value.id === marker.id)!;
    expect(isWalkable(compiled, marker.target, 'openable')).toBe(false);
    expect(isWalkable(compiled, after.target, 'openable')).toBe(true);
    expect(after.target.position).not.toEqual(marker.target.position);
  });
});
