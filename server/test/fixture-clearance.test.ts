import { describe, expect, it } from 'vitest';
import { createBuilding, createChair, getObject } from '@scene-test/fixtures';
import { validateFixtureOpenings } from '@refloor/server/shared/planning/fixture-clearance';

function home() {
  const building = createBuilding(),
    fridge = getObject(building, 'sofa');
  fridge.assetId = 'catalogue/fridge';
  fridge.kind = 'custom';
  fridge.dimensions = { width: 0.72, height: 1.9, depth: 0.72 };
  fridge.position = { x: 3, y: 0, z: 3 };
  fridge.behaviours = [{ kind: 'openable', state: { open: false } }];
  return building;
}

describe('generated fixture opening gate', () => {
  it('accepts a usable front without changing its saved closed state', () => {
    const building = home(),
      before = structuredClone(building);
    expect(() => validateFixtureOpenings(building)).not.toThrow();
    expect(building).toEqual(before);
  });

  it('rejects a closed fixture whose opened front would hit furniture', () => {
    const building = home(),
      chair = createChair();
    chair.roomId = 'living';
    chair.position = { x: 3, y: 0, z: 3.9 };
    building.objects.push(chair);
    const before = structuredClone(building);
    expect(() => validateFixtureOpenings(building)).toThrow('blocked by chair');
    expect(building).toEqual(before);
  });
});
