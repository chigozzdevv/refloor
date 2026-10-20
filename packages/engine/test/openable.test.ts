import { describe, expect, it } from 'vitest';
import { applyCommands, openableClearance } from '@refloor/scene';
import {
  buildNavigation,
  compileBuilding,
  isPlayerPositionValid,
  validatePlacement,
} from '@refloor/engine';
import { checkOpenableClearance } from '@refloor/engine/validation/openable-clearance';
import { createBuilding, edit } from '@engine-test/fixtures';

function home(rotation = 0) {
  const building = createBuilding();
  const object = building.objects.find((value) => value.id === 'sofa')!;
  object.assetId = 'catalogue/fridge';
  object.kind = 'custom';
  object.dimensions = { width: 0.72, height: 1.9, depth: 0.72 };
  object.position = { x: 3, y: 0, z: 3 };
  object.rotation = rotation;
  object.behaviours = [{ kind: 'openable', state: { open: false } }];
  return building;
}

describe('open household fixture clearance', () => {
  it.each([0, Math.PI / 2, -Math.PI / 2, Math.PI])(
    'reserves the moving front in world rotation %s',
    (rotation) => {
      const original = home(rotation),
        closed = compileBuilding(original),
        changed = applyCommands(
          original,
          edit([{ type: 'set-openable', objectId: 'sofa', state: { open: true } }]),
        ),
        opened = compileBuilding(changed.building),
        panel = opened.colliders.find((collider) => collider.id === 'sofa:openable-clearance')!;
      expect(closed.colliders.some((collider) => collider.id === panel.id)).toBe(false);
      expect(panel.rotation).toBe(rotation);
      expect(panel.position.x).toBeCloseTo(
        3 +
          (Math.sin(rotation) * (0.72 + openableClearance(changed.building.objects[0]!)!.depth)) /
            2,
      );
      expect(panel.position.z).toBeCloseTo(
        3 +
          (Math.cos(rotation) * (0.72 + openableClearance(changed.building.objects[0]!)!.depth)) /
            2,
      );
      expect(
        isPlayerPositionValid(closed, {
          floorId: 'ground',
          position: { x: panel.position.x, y: 0, z: panel.position.z },
        }),
      ).toBe(true);
      expect(
        isPlayerPositionValid(opened, {
          floorId: 'ground',
          position: { x: panel.position.x, y: 0, z: panel.position.z },
        }),
      ).toBe(false);
      expect(buildNavigation(opened).nodes).not.toBe(buildNavigation(closed).nodes);
    },
  );

  it('rejects opening into furniture atomically and leaves closed geometry usable', () => {
    const original = home();
    const obstacle = original.objects.find((object) => object.id === 'tv')!;
    obstacle.position = { x: 3, y: 0.9, z: 3.95 };
    const closed = compileBuilding(original);
    expect(checkOpenableClearance(closed)).toEqual([]);
    const edited = applyCommands(
      original,
      edit([{ type: 'set-openable', objectId: 'sofa', state: { open: true } }]),
    );
    expect(checkOpenableClearance(compileBuilding(edited.building))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'OPENABLE_CLEARANCE', entityId: 'sofa' }),
      ]),
    );
    expect(() =>
      validatePlacement(
        original,
        edit([{ type: 'set-openable', objectId: 'sofa', state: { open: true } }]),
      ),
    ).toThrow(/blocked by tv/);
    expect(original).toEqual(homeWithObstacle());
  });

  it('rejects opening into the current player and accepts a person standing clear', () => {
    const original = home();
    const command = edit([{ type: 'set-openable', objectId: 'sofa', state: { open: true } }]);
    expect(() =>
      validatePlacement(
        original,
        command,
        {},
        { floorId: 'ground', position: { x: 3, y: 0, z: 3.85 } },
      ),
    ).toThrow(/occupy the player/);
    expect(() =>
      validatePlacement(
        original,
        command,
        {},
        { floorId: 'ground', position: { x: 2, y: 0, z: 3 } },
      ),
    ).not.toThrow();
  });

  it('rejects opening through a wall while retaining closed fixture placement', () => {
    const original = home();
    original.objects.find((object) => object.id === 'sofa')!.position.z = 5.45;
    expect(checkOpenableClearance(compileBuilding(original))).toEqual([]);
    const result = applyCommands(
      original,
      edit([{ type: 'set-openable', objectId: 'sofa', state: { open: true } }]),
    );
    expect(checkOpenableClearance(compileBuilding(result.building))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'OPENABLE_CLEARANCE',
          entityId: 'sofa',
          message: expect.stringContaining('north'),
        }),
      ]),
    );
  });
});

function homeWithObstacle() {
  const original = home();
  original.objects.find((object) => object.id === 'tv')!.position = { x: 3, y: 0.9, z: 3.95 };
  return original;
}
