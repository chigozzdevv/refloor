import { describe, expect, it } from 'vitest';
import { compileBuilding } from '@refloor/engine';
import {
  wallInteractionPositions,
  interactionVisible,
  openableInteractionPositions,
} from '@refloor/engine/navigation/interaction';
import { createBuilding, getObject } from '@engine-test/fixtures';

describe('wall-mounted object interaction approaches', () => {
  it('places open-drawer approaches beyond the extended front rather than inside it', () => {
    const object = getObject(createBuilding(), 'sofa');
    object.assetId = 'catalogue/vanity';
    object.kind = 'custom';
    object.dimensions = { width: 1.15, height: 0.98, depth: 0.56 };
    object.behaviours = [{ kind: 'openable', state: { open: false } }];
    expect(openableInteractionPositions(object, 0.47)).toEqual([]);
    object.behaviours.find((behaviour) => behaviour.kind === 'openable')!.state.open = true;
    const positions = openableInteractionPositions(object, 0.47),
      extendedFront = object.dimensions.depth / 2 + object.dimensions.depth * 0.55 + 0.02;
    expect(positions).toHaveLength(3);
    expect(positions.every((point) => point.z > extendedFront + 0.46)).toBe(true);
  });
  it('keeps every candidate in front of the object and includes approaches beside low storage', () => {
    const object = getObject(createBuilding(), 'tv'),
      points = wallInteractionPositions(object, 0.47);
    expect(points.some((point) => point.x === 0)).toBe(true);
    expect(points.some((point) => point.x > object.dimensions.width / 2)).toBe(true);
    expect(points.some((point) => point.x < -object.dimensions.width / 2)).toBe(true);
    expect(points.every((point) => point.z > object.dimensions.depth / 2)).toBe(true);
  });

  it.each([0, Math.PI / 2])(
    'rejects a sight line through tall storage rotated %s and accepts a clear oblique approach',
    (rotation) => {
      const building = createBuilding(),
        television = getObject(building, 'tv'),
        obstacle = structuredClone(getObject(building, 'sofa'));
      obstacle.id = 'tall-storage';
      obstacle.position = { x: 4.5, y: 0, z: 5.1 };
      obstacle.dimensions = { width: 0.6, height: 2, depth: 0.3 };
      obstacle.rotation = rotation;
      building.objects.push(obstacle);
      const compiled = compileBuilding(building);
      expect(interactionVisible(compiled, television, { x: 4.5, y: 0, z: 5.6 })).toBe(false);
      expect(interactionVisible(compiled, television, { x: 3, y: 0, z: 5.6 })).toBe(true);
      obstacle.dimensions.height = 0.7;
      expect(
        interactionVisible(compileBuilding(building), television, { x: 4.5, y: 0, z: 5.6 }),
      ).toBe(true);
    },
  );
});
