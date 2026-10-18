import { describe, expect, it } from 'vitest';
import { compileBuilding } from '@refloor/engine';
import { createHouse } from '@refloor/catalogue/houses';
import { destinations, destinationRoute } from '@/shared/navigation/destinations';
import { portalPosition, tourPortals } from '@/shared/navigation/portals';

describe('tour portal access', () => {
  it('provides the studio exit and a real downstairs route even far from the staircase', () => {
    const compiled = compileBuilding(
        createHouse({ id: 'studio-exit', name: 'Studio exit', storeys: 2 }),
      ),
      stops = destinations(compiled),
      room = compiled.building.floors[1]!.rooms.find((value) => value.kind === 'workspace')!,
      start = stops.find((stop) => stop.kind === 'room' && stop.roomId === room.id)!.target,
      portals = tourPortals(compiled, start, stops),
      downstairs = portals.find((stop) => stop.direction === 'down');
    expect(portals.some((stop) => stop.label === 'Leave room')).toBe(true);
    expect(downstairs).toBeDefined();
    expect(downstairs?.target.floorId).toBe('ground');
    expect(destinationRoute(compiled, start, downstairs!.target, 'openable')?.stairIds).toEqual([
      'staircase',
    ]);
  });
  it('keeps off-screen portals inside the viewport and flips a target behind the camera', () => {
    expect(portalPosition(-800, 900, false, 320, 600)).toEqual({ x: 48, y: 350 });
    expect(portalPosition(-800, 200, true, 320, 600).x).toBe(272);
  });
});
