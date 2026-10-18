import { describe, expect, it } from 'vitest';
import { applyCommands } from '@refloor/scene';
import {
  buildNavigation,
  checkClearance,
  compileBuilding,
  entrancePoints,
  findPath,
  validateBuilding,
} from '@refloor/engine';
import {
  createTwoStorey,
  first,
  getObject,
  rotateBuilding,
  finish,
  createChair,
  edit,
} from '@engine-test/fixtures';
import { createPhysics, RAPIER, walkPath } from '@engine-test/physics';

describe('physical stair geometry', () => {
  it.each(['u-shaped', 'straight'] as const)(
    'walks from the entrance into an upstairs bedroom through %s stairs',
    async (kind) => {
      const building = createTwoStorey(kind),
        planned = buildNavigation(validateBuilding(building));
      const target = { floorId: 'upper', position: { x: 8, y: 3, z: 3 } };
      const route = findPath(planned, first(entrancePoints(planned)), target);
      if (!route) throw new Error('Upstairs route missing');
      const result = applyCommands(
        building,
        edit(route.doorIds.map((doorId) => ({ type: 'set-door' as const, doorId, open: true }))),
      );
      const compiled = validateBuilding(result.building),
        navigation = buildNavigation(compiled, 'current');
      const path = findPath(navigation, first(entrancePoints(navigation)), target);
      if (!path) throw new Error('Open doors did not provide the planned route');
      const world = await createPhysics(compiled);
      try {
        const position = walkPath(world, compiled, path.points);
        expect(position.y).toBeCloseTo(3, 1);
        expect(
          Math.hypot(position.x - target.position.x, position.z - target.position.z),
        ).toBeLessThan(0.1);
      } finally {
        world.free();
      }
    },
    15_000,
  );

  it.each(['u-shaped', 'straight'] as const)(
    'walks up and down generated %s colliders using Rapier',
    async (kind) => {
      const compiled = validateBuilding(createTwoStorey(kind)),
        stair = first(compiled.stairs),
        world = await createPhysics(compiled);
      try {
        const top = walkPath(world, compiled, stair.path);
        expect(top.y).toBeCloseTo(stair.upper.position.y, 1);
        expect(
          Math.hypot(top.x - stair.upper.position.x, top.z - stair.upper.position.z),
        ).toBeLessThan(0.1);
        const bottom = walkPath(world, compiled, stair.path.toReversed());
        expect(bottom.y).toBeCloseTo(stair.lower.position.y, 1);
      } finally {
        world.free();
      }
    },
    15_000,
  );

  it('does not create an upper slab over the stairwell', async () => {
    const compiled = compileBuilding(createTwoStorey()),
      stair = first(compiled.stairs),
      world = await createPhysics(compiled);
    try {
      const ray = new RAPIER.Ray(
        {
          x: stair.footprint.x + stair.footprint.width / 2,
          y: 3.1,
          z: stair.footprint.z + stair.footprint.depth * 0.8,
        },
        { x: 0, y: -1, z: 0 },
      );
      const hit = world.castRay(ray, 10, true);
      expect(hit).not.toBeNull();
      expect(hit?.timeOfImpact).toBeGreaterThan(1);
    } finally {
      world.free();
    }
  });

  it.each(['width', 'riser', 'run', 'heading', 'landing'] as const)(
    'rejects an invalid stair %s',
    (variant) => {
      const building = createTwoStorey(),
        stair = first(building.stairs);
      if (variant === 'width') stair.flightWidth = 2;
      if (variant === 'riser') stair.risers = 8;
      if (variant === 'run') stair.treadDepth = 1;
      if (variant === 'heading') stair.heading = Math.PI / 7;
      if (variant === 'landing') stair.landingDepth = 3;
      expect(() => compileBuilding(building)).toThrow();
    },
  );

  it('detects furniture occupying a stairwell', () => {
    const building = createTwoStorey(),
      sofa = getObject(building, 'sofa');
    sofa.position = { x: 2, y: 0, z: 3 };
    expect(
      checkClearance(compileBuilding(building)).some((issue) => issue.code === 'STAIR_RESERVATION'),
    ).toBe(true);
  });

  it('supports an odd riser count with a longer return flight', async () => {
    const building = createTwoStorey();
    first(building.stairs).risers = 19;
    const compiled = compileBuilding(building),
      world = await createPhysics(compiled);
    try {
      expect(walkPath(world, compiled, first(compiled.stairs).path).y).toBeCloseTo(3, 1);
    } finally {
      world.free();
    }
  }, 15_000);

  it.each(['u-shaped', 'straight'] as const)(
    'walks rotated %s stairs at both perpendicular headings',
    async (kind) => {
      for (const angle of [Math.PI / 2, (Math.PI * 3) / 2]) {
        const compiled = validateBuilding(rotateBuilding(createTwoStorey(kind), angle)),
          stair = first(compiled.stairs),
          world = await createPhysics(compiled);
        try {
          expect(walkPath(world, compiled, stair.path).y).toBeCloseTo(3, 1);
          expect(walkPath(world, compiled, stair.path.toReversed()).y).toBeCloseTo(0, 1);
        } finally {
          world.free();
        }
      }
    },
    15_000,
  );

  it('rejects an obstructed landing or one partly above a floor opening', () => {
    const building = createTwoStorey(),
      compiled = compileBuilding(building),
      stair = first(compiled.stairs),
      floor = first(building.floors);
    floor.walls.push({
      id: 'landing-blocker',
      start: { x: stair.lower.position.x - 0.4, z: stair.lower.position.z },
      end: { x: stair.lower.position.x + 0.4, z: stair.lower.position.z },
      height: 2.8,
      thickness: 0.15,
      material: finish,
      openings: [],
    });
    expect(
      checkClearance(compileBuilding(building)).some((issue) => issue.code === 'STAIR_ACCESS'),
    ).toBe(true);
    const upper = building.floors.find((value) => value.id === 'upper');
    if (!upper) throw new Error('Upper floor missing');
    const hole = first(upper.voids);
    hole.footprint.depth += 1;
    expect(() => compileBuilding(building)).toThrow(/Landing/);
  });

  it('detects an overhead obstruction along the stair route', () => {
    const building = createTwoStorey(),
      stair = first(compileBuilding(building).stairs),
      point = stair.path[1];
    if (!point) throw new Error('Stair tread missing');
    building.objects.push({
      ...createChair(),
      id: 'overhead-blocker',
      roomId: 'living',
      dimensions: { width: 0.2, height: 0.2, depth: 0.2 },
      position: { x: point.x, y: 1.6, z: point.z },
    });
    expect(
      checkClearance(compileBuilding(building)).some((issue) => issue.code === 'STAIR_HEADROOM'),
    ).toBe(true);
  });

  it('rejects a low wall across the stair approach even when both landings are clear', () => {
    const building = createTwoStorey(),
      stair = first(compileBuilding(building).stairs);
    first(building.floors).walls.push({
      id: 'low-stair-wall',
      start: { x: stair.lower.position.x - 0.5, z: 4.5 },
      end: { x: stair.lower.position.x + 0.5, z: 4.5 },
      height: 0.45,
      thickness: 0.1,
      material: finish,
      openings: [],
    });
    const issues = checkClearance(compileBuilding(building));
    expect(issues.some((issue) => issue.code === 'STAIR_HEADROOM')).toBe(true);
    expect(issues.some((issue) => issue.code === 'STAIR_ACCESS')).toBe(false);
  });
});
