import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { applyCommands } from '@refloor/scene';
import { compileBuilding, isWalkable } from '@refloor/engine';
import { destinations, nearbyRoute } from '@/shared/navigation/destinations';
import { entryPose } from '@/shared/navigation/entry';
import { clearSegment } from '@refloor/engine/navigation/surfaces';

describe('house navigation destinations', () => {
  it('provides a clear next step from the entrance of a long two-storey house', () => {
    const compiled = compileBuilding(
      createHouse({ id: 'long-hall', name: 'Long hall', storeys: 2, width: 14, depth: 12 }),
    );
    const entry = entryPose(compiled);
    expect(
      destinations(compiled).some((marker) => {
        if (!['room', 'waypoint'].includes(marker.kind) || marker.floorId !== entry.floorId)
          return false;
        const dx = marker.target.position.x - entry.inside.x,
          dz = marker.target.position.z - entry.inside.z,
          distance = Math.hypot(dx, dz);
        return (
          distance > 1 &&
          distance < 5 &&
          (dx * entry.normal.x + dz * entry.normal.z) / distance > 0.7 &&
          clearSegment(compiled, entry.floorId, entry.inside, marker.target.position, 'current')
        );
      }),
    ).toBe(true);
  });
  it('connects the entrance, corridor turns and staircase through nearby stops', () => {
    const compiled = compileBuilding(
      createHouse({ id: 'tour-links', name: 'Tour links', storeys: 2, width: 14, depth: 12 }),
    );
    const entry = entryPose(compiled),
      points = destinations(compiled)
        .filter(
          (value) => value.floorId === entry.floorId && ['room', 'waypoint'].includes(value.kind),
        )
        .map((value) => value.target.position);
    const reached = [entry.inside];
    for (let index = 0; index < reached.length; index++)
      for (const point of points)
        if (
          !reached.includes(point) &&
          Math.hypot(point.x - reached[index]!.x, point.z - reached[index]!.z) <= 5 &&
          clearSegment(compiled, entry.floorId, reached[index]!, point, 'current')
        )
          reached.push(point);
    expect(
      reached.some(
        (point) =>
          Math.hypot(
            point.x - compiled.stairs[0]!.lower.position.x,
            point.z - compiled.stairs[0]!.lower.position.z,
          ) < 4 &&
          clearSegment(
            compiled,
            entry.floorId,
            point,
            compiled.stairs[0]!.lower.position,
            'current',
          ),
      ),
    ).toBe(true);
    for (const room of compiled.building.floors.flatMap((floor) => floor.rooms))
      expect(
        destinations(compiled).filter((value) => value.kind === 'room' && value.roomId === room.id)
          .length,
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
