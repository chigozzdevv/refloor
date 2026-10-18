import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/blueprints';
import { validateBuilding, buildNavigation, entrancePoints, findPath } from '@refloor/engine';

describe('parametric starting homes', () => {
  it.each([1, 2] as const)('builds a furnished, reachable %s-storey home', (storeys) => {
    const building = createHouse({ id: 'house', name: 'My home', storeys });
    const compiled = validateBuilding(building),
      navigation = buildNavigation(compiled);
    expect(building.floors).toHaveLength(storeys);
    expect(building.objects.length).toBeGreaterThan(10);
    const floor = building.floors.at(-1);
    if (!floor) throw new Error('Floor missing');
    const path = findPath(navigation, entrancePoints(navigation)[0]!, {
      floorId: floor.id,
      position: { x: 8.25, y: floor.elevation, z: 3.4 },
    });
    expect(path).not.toBeNull();
    if (storeys === 2) expect(path?.stairIds).toEqual(['staircase']);
  });
  it.each([
    [11.5, 9.5],
    [14, 12],
    [16, 14],
  ])('keeps dimensions and clearance valid at %sx%s m', (width, depth) => {
    expect(
      createHouse({ id: 'house', name: 'My home', storeys: 2, width, depth }).floors[0]?.footprint,
    ).toEqual({ x: 0, z: 0, width, depth });
  });
  it('rejects dimensions outside its supported envelope', () => {
    expect(() => createHouse({ id: 'house', name: 'Home', storeys: 1, width: 6 })).toThrow(/width/);
  });
});
