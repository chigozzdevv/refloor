import { describe, expect, it } from 'vitest';
import { assetFromCatalogue } from '@refloor/catalogue';
import { createHouse } from '@refloor/catalogue/houses';
import { validateBuilding } from '@refloor/engine';
import { fingerprintBuilding } from '@refloor/scene';
import { createEditMemory } from '@refloor/scene/edit-memory';
import { completeFurnishings } from '@/shared/editor/furnishings';
import { editDocument, restoreBefore } from '@/shared/editor/document';

describe('existing house furnishings', () => {
  it('upgrades old fittings without changing rooms and restores the entire change in one undo', async () => {
    const building = createHouse({ id: 'existing', name: 'Existing house', storeys: 2 });
    building.objects = building.objects.filter(
      (object) => !['catalogue/fridge', 'catalogue/wardrobe'].includes(object.assetId),
    );
    for (const object of building.objects) {
      if (
        !['catalogue/kitchen-counter', 'catalogue/kitchen-island', 'catalogue/desk'].includes(
          object.assetId,
        )
      )
        continue;
      const dimensions = object.dimensions;
      Object.assign(object, assetFromCatalogue('catalogue/cabinet'), { dimensions });
    }
    const compiled = validateBuilding(building),
      original = fingerprintBuilding(building),
      result = await completeFurnishings(compiled),
      edited = editDocument(
        { compiled, past: [], future: [], memory: createEditMemory(compiled.building) },
        result.commands,
      );
    expect(result.commands.length).toBeGreaterThan(3);
    expect(edited.compiled.building.floors).toEqual(building.floors);
    expect(edited.compiled.building.stairs).toEqual(building.stairs);
    expect(edited.compiled.building.objects.map((object) => object.assetId)).toEqual(
      expect.arrayContaining([
        'catalogue/kitchen-counter',
        'catalogue/fridge',
        'catalogue/desk',
        'catalogue/wardrobe',
      ]),
    );
    const restored = restoreBefore(edited, edited.past[0]!.revision.id);
    expect(fingerprintBuilding(restored.compiled.building)).toBe(original);
    expect((await completeFurnishings(edited.compiled)).commands).toEqual([]);
  }, 30000);
});
