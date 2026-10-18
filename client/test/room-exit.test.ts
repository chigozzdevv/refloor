import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import { contains } from '@refloor/engine/math';
import { destinations, destinationRoute } from '@/shared/navigation/destinations';
import { entryPose } from '@/shared/navigation/entry';
import { roomExit } from '@/shared/navigation/room-exit';

describe('room exit navigation', () => {
  it.each([1, 2] as const)(
    'finds a reachable way out of a bedroom in a %s-storey house',
    (storeys) => {
      const compiled = compileBuilding(
          createHouse({ id: `exit-${storeys}`, name: 'Room exits', storeys }),
        ),
        stops = destinations(compiled);
      for (const floor of compiled.building.floors) {
        for (const room of floor.rooms.filter((value) => value.kind === 'bedroom')) {
          const start = stops.find(
              (value) => value.kind === 'room' && value.roomId === room.id,
            )!.target,
            exit = roomExit(compiled, start, stops);
          expect(exit).not.toBeNull();
          expect(exit?.kind).toBe('door');
          expect(exit?.floorId).toBe(floor.id);
          expect(contains(room.footprint, exit!.target.position)).toBe(false);
          const route = destinationRoute(compiled, start, exit!.target, 'openable');
          expect(route).not.toBeNull();
          expect(route?.stairIds).toHaveLength(0);
        }
      }
    },
  );

  it('keeps the entrance space and staircase landing free of misleading room exits', () => {
    const compiled = compileBuilding(
        createHouse({ id: 'exit-hubs', name: 'Room exits', storeys: 2 }),
      ),
      entry = entryPose(compiled),
      stops = destinations(compiled);
    expect(
      roomExit(compiled, { floorId: entry.floorId, position: entry.inside }, stops),
    ).toBeNull();
    expect(roomExit(compiled, compiled.stairs[0]!.upper, stops)).toBeNull();
  });
});
