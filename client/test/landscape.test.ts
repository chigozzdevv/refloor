import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import type { Building } from '@refloor/scene';
import { compileBuilding } from '@refloor/engine';
import { exteriorLayout } from '@/shared/scene/exterior';
import { landscapeLayout } from '@/shared/scene/landscape';

const buildings = [
  createHouse({ id: 'landscape-bungalow', name: 'Garden', storeys: 1 }),
  createHouse({ id: 'landscape-two-storey', name: 'Linden', storeys: 2 }),
  ...['generated-bungalow', 'generated-two-storey'].map(
    (name) =>
      JSON.parse(
        readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'),
      ) as Building,
  ),
];

function clearOfCompound(
  compound: ReturnType<typeof exteriorLayout>['compound'],
  x: number,
  z: number,
  halfWidth: number,
  halfDepth: number,
) {
  return (
    x + halfWidth < compound.x ||
    x - halfWidth > compound.x + compound.width ||
    z + halfDepth < compound.z ||
    z - halfDepth > compound.z + compound.depth
  );
}

describe('compound landscaping', () => {
  it.each(buildings)(
    'keeps beds and every plant outside the navigable kerb in $name',
    (building) => {
      const site = exteriorLayout(compileBuilding(building)),
        layout = landscapeLayout(site);
      for (const bed of layout.beds) {
        expect(clearOfCompound(site.compound, bed.x, bed.z, bed.width / 2, bed.depth / 2)).toBe(
          true,
        );
        expect(bed.width).toBeGreaterThan(1);
        expect(bed.depth).toBeGreaterThan(1);
      }
      for (const shrub of layout.shrubs)
        expect(
          clearOfCompound(
            site.compound,
            shrub.position[0],
            shrub.position[2],
            shrub.scale[0] * 1.05,
            shrub.scale[2] * 1.05,
          ),
        ).toBe(true);
      for (const grass of layout.grasses)
        expect(
          clearOfCompound(
            site.compound,
            grass.position[0],
            grass.position[2],
            grass.scale[0] * 0.3,
            grass.scale[2] * 0.3,
          ),
        ).toBe(true);
      for (const tree of layout.trees)
        expect(
          clearOfCompound(
            site.compound,
            tree.position[0],
            tree.position[2],
            tree.scale[0] * 1.4,
            tree.scale[2] * 1.4,
          ),
        ).toBe(true);
      for (const stone of layout.stones)
        expect(
          clearOfCompound(
            site.compound,
            stone.position[0],
            stone.position[2],
            stone.scale[0] * 1.8,
            stone.scale[2] * 1.8,
          ),
        ).toBe(true);
      for (const edge of layout.edging)
        expect(
          clearOfCompound(
            site.compound,
            edge.position[0],
            edge.position[2],
            edge.scale[0] / 2,
            edge.scale[2] / 2,
          ),
        ).toBe(true);
      expect(layout.ground).toBeCloseTo(site.ground.elevation - 0.205);
      expect(layout.shrubs.length).toBeGreaterThan(20);
    },
  );

  it('follows a translated compound and raised floor without a separate fixed garden', () => {
    const original = exteriorLayout(compileBuilding(buildings[0]!)),
      base = landscapeLayout(original),
      shifted = landscapeLayout({
        compound: {
          ...original.compound,
          x: original.compound.x + 17,
          z: original.compound.z - 23,
        },
        ground: { ...original.ground, elevation: original.ground.elevation + 2.3 },
      });
    for (const kind of ['shrubs', 'grasses', 'stones', 'trees', 'edging'] as const)
      shifted[kind].forEach((item, index) => {
        expect(item.position[0] - base[kind][index]!.position[0]).toBeCloseTo(17);
        expect(item.position[2] - base[kind][index]!.position[2]).toBeCloseTo(-23);
        expect(item.position[1] - base[kind][index]!.position[1]).toBeCloseTo(2.3);
        expect(item.scale).toEqual(base[kind][index]!.scale);
      });
  });

  it('keeps planting deterministic and reduces density in balanced quality', () => {
    const site = exteriorLayout(compileBuilding(buildings[1]!)),
      high = landscapeLayout(site),
      balanced = landscapeLayout(site, 'balanced');
    expect(landscapeLayout(site)).toEqual(high);
    expect(balanced.beds).toEqual(high.beds);
    expect(balanced.edging).toEqual(high.edging);
    expect(balanced.trees).toEqual(high.trees);
    expect(balanced.shrubs.length).toBeLessThan(high.shrubs.length);
    expect(balanced.grasses.length).toBeLessThan(high.grasses.length);
    expect(balanced.stones.length).toBeLessThan(high.stones.length);
    for (const kind of ['shrubs', 'grasses', 'stones'] as const)
      for (const item of balanced[kind]) expect(high[kind]).toContainEqual(item);
  });
});
