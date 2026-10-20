import { describe, expect, it } from 'vitest';
import {
  assetFromCatalogue,
  catalogueBehaviourUpgrades,
  createFurniture,
  validateBuildingAssets,
} from '@refloor/catalogue';
import { createHouse } from '@refloor/catalogue/houses';
import { applyCommands, getObjectAsset, undoRevision } from '@refloor/scene';

describe('household catalogue capabilities', () => {
  it.each([
    ['catalogue/kitchen-counter', ['cooker', 'water', 'openable']],
    ['catalogue/vanity', ['water', 'openable']],
    ['catalogue/shower', ['water']],
    ['catalogue/fridge', ['openable']],
    ['catalogue/wardrobe', ['openable']],
    ['catalogue/cabinet', ['openable']],
    ['catalogue/kitchen-island', ['openable']],
    ['catalogue/bedside', ['openable']],
  ])('creates %s with declared usable capabilities', (assetId, kinds) => {
    const asset = assetFromCatalogue(assetId as string);
    expect(asset.behaviours.map((behaviour) => behaviour.kind)).toEqual(kinds);
    for (const behaviour of asset.behaviours)
      expect(behaviour.state).toMatchObject(
        behaviour.kind === 'openable' ? { open: false } : { powered: false },
      );
  });

  it('upgrades old fixtures additively without changing materials, IDs, placement or existing state', () => {
    const original = createHouse({ id: 'upgrade-home', name: 'Saved home', storeys: 1 });
    for (const object of original.objects)
      object.behaviours = object.behaviours.filter(
        (behaviour) => !['cooker', 'water', 'openable'].includes(behaviour.kind),
      );
    const kitchen = original.objects.find(
      (object) => object.assetId === 'catalogue/kitchen-counter',
    )!;
    kitchen.materials.body!.color = '#123456';
    kitchen.behaviours = [{ kind: 'water', state: { powered: true, flow: 0.15, temperature: 41 } }];
    validateBuildingAssets(original);
    const before = structuredClone(original);
    const commands = catalogueBehaviourUpgrades(original);
    expect(commands.length).toBeGreaterThan(0);
    const changed = applyCommands(original, {
      id: 'upgrade',
      at: '2026-10-20T12:00:00Z',
      expectedRevision: original.revision,
      commands,
    });
    validateBuildingAssets(changed.building);
    expect(original).toEqual(before);
    expect(catalogueBehaviourUpgrades(changed.building)).toEqual([]);
    const updatedKitchen = changed.building.objects.find((object) => object.id === kitchen.id)!;
    expect(updatedKitchen.behaviours.find((behaviour) => behaviour.kind === 'water')).toEqual(
      kitchen.behaviours[0],
    );
    for (const object of changed.building.objects) {
      const previous = before.objects.find((value) => value.id === object.id)!;
      expect({ ...object, behaviours: previous.behaviours }).toEqual(previous);
    }
    expect(
      undoRevision(changed.building, changed.revision, {
        id: 'undo-upgrade',
        at: '2026-10-20T12:01:00Z',
      }).building,
    ).toEqual({ ...before, revision: 2 });
  });

  it('does not grant appliance capabilities to assets that cannot render them', () => {
    const building = createHouse({ id: 'invalid-home', name: 'Home', storeys: 1 });
    const sofa = building.objects.find((object) => object.assetId === 'catalogue/sofa')!;
    sofa.behaviours = [{ kind: 'water', state: { powered: false, flow: 0.5, temperature: 22 } }];
    expect(() => validateBuildingAssets(building)).toThrow(/incompatible/);
    expect(
      getObjectAsset(
        createFurniture('catalogue/vanity', {
          id: 'vanity',
          floorId: 'ground',
          roomId: 'bath',
          position: { x: 1, y: 0, z: 1 },
          rotation: 0,
        }),
      ).behaviours,
    ).toHaveLength(2);
  });
});
