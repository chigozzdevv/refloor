import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/blueprints';
import { getCatalogueEntry } from '@refloor/catalogue';
import { compileBuilding } from '@refloor/engine';
import { sameMaterial } from '@/runtime/rendering/finish';
import { partGeometry } from '@/runtime/rendering/geometry';

describe('rendering contracts', () => {
  it('preserves original scanned PBR materials after scene parsing and JSON reload', () => {
    const building = createHouse({ id: 'scanned-home', name: 'Scanned home', storeys: 1 });
    const reloaded: typeof building = JSON.parse(JSON.stringify(building));
    const scanned = reloaded.objects.filter((object) => getCatalogueEntry(object.assetId).modelUrl);
    expect(scanned.length).toBeGreaterThan(0);
    for (const object of scanned) {
      const original = getCatalogueEntry(object.assetId).materials.body;
      expect(sameMaterial(object.materials.body, original)).toBe(true);
      expect(sameMaterial({ ...object.materials.body!, color: '#f010ff' }, original)).toBe(false);
    }
  });
  it('keeps floor tops and white undersides separate without a draw call per triangle', () => {
    const compiled = compileBuilding(
        createHouse({ id: 'floor-home', name: 'Floor home', storeys: 1 }),
      ),
      slab = compiled.parts.find((part) => part.role === 'slab')!,
      geometry = partGeometry(slab);
    expect(geometry.groups.length).toBeLessThanOrEqual(3);
    expect(new Set(geometry.groups.map((group) => group.materialIndex))).toEqual(new Set([0, 1]));
    for (const group of geometry.groups)
      for (let offset = group.start; offset < group.start + group.count; offset += 3) {
        const vertex = geometry.index!.getX(offset);
        expect(geometry.attributes.normal!.getY(vertex) > 0.5).toBe(group.materialIndex === 0);
      }
    geometry.dispose();
  });
});
