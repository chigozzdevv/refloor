import { describe, expect, it } from 'vitest';
import {
  compileBuilding,
  validateBuilding,
  buildNavigation,
  entrancePoints,
  findPath,
} from '@refloor/engine';
import { generateLayout } from '@refloor/server/shared/planning/layout';
import { validateRequirements } from '@refloor/server/shared/planning/requirements';
import { lShapedBrief as brief } from '@server-test/briefs/l-shaped';
import { wallExteriorSide } from '@refloor/scene/wall-exterior';

describe('L-shaped house generation', () => {
  it.each(['central-hall', 'living-hub'] as const)(
    'builds a real open corner with reachable rooms using %s',
    async (family) => {
      const building = await generateLayout(`l-shaped-${family}`, brief(family)),
        floor = building.floors[0]!,
        cut = floor.voids.find((hole) => hole.kind === 'courtyard')!.footprint,
        compiled = compileBuilding(building),
        navigation = buildNavigation(compiled),
        entrance = entrancePoints(navigation)[0]!;
      expect(
        floor.rooms.reduce((sum, room) => sum + room.footprint.width * room.footprint.depth, 0),
      ).toBeCloseTo(floor.footprint.width * floor.footprint.depth - cut.width * cut.depth);
      for (const room of floor.rooms) {
        const node = navigation.nodes.find(
          (node) =>
            node.floorId === floor.id &&
            node.position.x > room.footprint.x &&
            node.position.x < room.footprint.x + room.footprint.width &&
            node.position.z > room.footprint.z &&
            node.position.z < room.footprint.z + room.footprint.depth,
        );
        expect(node, room.name).toBeDefined();
        expect(findPath(navigation, entrance, node!), room.name).not.toBeNull();
      }
      const point = { x: cut.x + cut.width / 2, z: cut.z + cut.depth / 2 };
      expect(
        compiled.parts
          .filter((part) => part.role === 'slab' || part.role === 'roof')
          .some(
            (part) =>
              part.collider.shape === 'box' &&
              Math.abs(point.x - part.collider.position.x) < part.collider.size.x / 2 &&
              Math.abs(point.z - part.collider.position.z) < part.collider.size.z / 2,
          ),
      ).toBe(false);
      const recess = floor.walls.find((wall) => wall.id.endsWith('/courtyard-side'))!;
      expect(wallExteriorSide(floor, recess)).not.toBeNull();
      expect(recess.exteriorMaterial?.color).toBe('#eee8db');
      const incomplete = structuredClone(building);
      const brokenWall = incomplete.floors[0]!.walls.find((wall) => wall.id === recess.id)!;
      brokenWall.height = 0.8;
      brokenWall.openings = [];
      expect(() => validateBuilding(incomplete)).toThrow(/perimeter/);
    },
    60000,
  );
  it('rejects roof and storey combinations it cannot construct reliably', () => {
    expect(() => validateRequirements({ ...brief('central-hall'), roof: 'gable' })).toThrow(
      /flat-roof bungalows/,
    );
    expect(() => validateRequirements({ ...brief('central-hall'), storeys: 2 })).toThrow(
      /flat-roof bungalows/,
    );
  });
});
