import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { applyCommands } from '@refloor/scene';
import { compileBuilding, isWalkable } from '@refloor/engine';
import { destinations } from '@/shared/navigation/destinations';
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
        if (marker.kind !== 'room' || marker.floorId !== entry.floorId) return false;
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
