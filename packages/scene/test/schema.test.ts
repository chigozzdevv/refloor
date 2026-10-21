import { describe, expect, it } from 'vitest';
import { buildingSchema, parseBuilding } from '@refloor/scene';
import type { Building } from '@refloor/scene';
import { createBuilding, createTwoStorey, first, getObject } from '@scene-test/fixtures';

describe('building validation', () => {
  it('round-trips a complete building through JSON', () => {
    const building = createBuilding();
    expect(parseBuilding(JSON.parse(JSON.stringify(building)))).toEqual(building);
  });

  it('validates a two-storey building and its stair opening', () => {
    expect(parseBuilding(createTwoStorey()).stairs).toHaveLength(1);
  });

  it('rejects unknown fields and unsupported units', () => {
    expect(buildingSchema.safeParse({ ...createBuilding(), unexpected: true }).success).toBe(false);
    expect(buildingSchema.safeParse({ ...createBuilding(), units: 'feet' }).success).toBe(false);
  });

  const invalid: [string, (building: Building) => void][] = [
    [
      'duplicate entity IDs',
      (b) => {
        getObject(b, 'sofa').id = 'ground';
      },
    ],
    [
      'missing floor',
      (b) => {
        getObject(b, 'sofa').floorId = 'missing';
      },
    ],
    [
      'missing room',
      (b) => {
        getObject(b, 'sofa').roomId = 'missing';
      },
    ],
    [
      'missing wall reference',
      (b) => {
        first(first(b.floors).rooms).wallIds.push('missing');
      },
    ],
    [
      'duplicate wall references',
      (b) => {
        first(first(b.floors).rooms).wallIds.push('south');
      },
    ],
    [
      'room outside floor',
      (b) => {
        first(first(b.floors).rooms).footprint.width = 20;
      },
    ],
    [
      'overlapping rooms',
      (b) => {
        const room = first(b.floors).rooms.find((r) => r.id === 'bedroom');
        if (room) room.footprint.x = 5;
      },
    ],
    [
      'zero-length wall',
      (b) => {
        const wall = first(first(b.floors).walls);
        wall.end = { ...wall.start };
      },
    ],
    [
      'wall above ceiling',
      (b) => {
        first(first(b.floors).walls).height = 4;
      },
    ],
    [
      'wall outside floor',
      (b) => {
        first(first(b.floors).walls).end.x = 11;
      },
    ],
    [
      'opening outside wall',
      (b) => {
        first(first(first(b.floors).walls).openings).offset = 20;
      },
    ],
    [
      'opening above wall',
      (b) => {
        first(first(first(b.floors).walls).openings).height = 4;
      },
    ],
    [
      'overlapping openings',
      (b) => {
        const wall = first(first(b.floors).walls);
        const door = first(wall.openings);
        wall.openings.push({ ...structuredClone(door), id: 'duplicate-door' });
      },
    ],
    [
      'object outside room',
      (b) => {
        getObject(b, 'sofa').position.x = 8;
      },
    ],
    [
      'object above ceiling',
      (b) => {
        getObject(b, 'sofa').position.y = 2.5;
      },
    ],
    [
      'negative object height',
      (b) => {
        getObject(b, 'sofa').dimensions.height = -1;
      },
    ],
    [
      'non-finite position',
      (b) => {
        getObject(b, 'sofa').position.x = Infinity;
      },
    ],
    [
      'negative floor-relative elevation',
      (b) => {
        getObject(b, 'sofa').position.y = -1;
      },
    ],
    [
      'duplicate behaviours',
      (b) => {
        const lamp = getObject(b, 'lamp');
        lamp.behaviours.push(structuredClone(first(lamp.behaviours)));
      },
    ],
    [
      'television without screen behaviour',
      (b) => {
        getObject(b, 'tv').behaviours = [];
      },
    ],
    [
      'light without light behaviour',
      (b) => {
        getObject(b, 'lamp').behaviours = [];
      },
    ],
    [
      'invalid roof pitch',
      (b) => {
        b.roof.pitch = 0.2;
      },
    ],
  ];
  it.each(invalid)('rejects %s', (_, mutate) => {
    const building = createBuilding();
    mutate(building);
    expect(buildingSchema.safeParse(building).success).toBe(false);
  });

  it('checks the rotated footprint rather than only the unrotated dimensions', () => {
    const building = createBuilding(),
      sofa = getObject(building, 'sofa');
    sofa.position.z = 0.5;
    expect(buildingSchema.safeParse(building).success).toBe(true);
    sofa.rotation = Math.PI / 2;
    expect(buildingSchema.safeParse(building).success).toBe(false);
  });

  it.each(['opening', 'offset', 'floor', 'height', 'void-boundary'] as const)(
    'rejects invalid storey %s',
    (variant) => {
      const building = createTwoStorey(),
        stair = first(building.stairs),
        upper = building.floors.find((floor) => floor.id === 'upper');
      if (!upper) throw new Error('Upper floor missing');
      if (variant === 'opening') upper.voids = [];
      if (variant === 'offset') first(upper.voids).footprint.x += 0.5;
      if (variant === 'floor') stair.upperFloorId = 'ground';
      if (variant === 'height') upper.elevation = 2;
      if (variant === 'void-boundary') first(upper.voids).footprint.width = 20;
      expect(buildingSchema.safeParse(building).success).toBe(false);
    },
  );

  it('does not treat a courtyard as a staircase opening', () => {
    const building = createTwoStorey(),
      upper = building.floors.find((floor) => floor.id === 'upper')!;
    first(upper.voids).kind = 'courtyard';
    const result = buildingSchema.safeParse(building);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(
        result.error.issues.some((issue) => /covering the stairwell/.test(issue.message)),
      ).toBe(true);
  });
});
