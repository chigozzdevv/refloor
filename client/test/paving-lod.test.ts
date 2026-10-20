import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import { exteriorLayout } from '@/shared/scene/exterior';
import { pavingRegions, PavingLod, PavingProjection } from '@/shared/scene/paving-lod';

describe('paving screen size', () => {
  it('keeps a single exact-height surface outside the foundation pad without overlapping regions', () => {
    const site = exteriorLayout(
        compileBuilding(createHouse({ id: 'paving-area', name: 'Linden', storeys: 2 })),
      ),
      regions = pavingRegions(site),
      pad = site.paving[0]!;
    expect(regions).toHaveLength(4);
    expect(regions.reduce((sum, region) => sum + region.width * region.depth, 0)).toBeCloseTo(
      site.compound.width * site.compound.depth - pad.width * pad.depth,
    );
    regions.forEach((region, index) => {
      expect(region.y).toBeCloseTo(pad.position.y + pad.height / 2);
      expect(region.x - region.width / 2).toBeGreaterThanOrEqual(site.compound.x);
      expect(region.x + region.width / 2).toBeLessThanOrEqual(
        site.compound.x + site.compound.width,
      );
      for (const other of regions.slice(index + 1)) {
        const overlapX =
            Math.min(region.x + region.width / 2, other.x + other.width / 2) -
            Math.max(region.x - region.width / 2, other.x - other.width / 2),
          overlapZ =
            Math.min(region.z + region.depth / 2, other.z + other.depth / 2) -
            Math.max(region.z - region.depth / 2, other.z - other.depth / 2);
        expect(overlapX <= 1e-8 || overlapZ <= 1e-8).toBe(true);
      }
    });
  });

  it('uses actual camera projection and buffer size instead of navigation mode', () => {
    const projection = new PavingProjection([{ x: 0, y: 0, z: 0, width: 6, depth: 6 }]),
      camera = new PerspectiveCamera(50, 1, 0.1, 500);
    camera.position.set(0, 2, 3);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const close = projection.measure(camera, 1200, 1200);
    expect(close).toBeGreaterThan(24);
    expect(projection.measure(camera, 600, 600)).toBeCloseTo(close / 2);
    camera.position.set(0, 40, 65);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    expect(projection.measure(camera, 1200, 1200)).toBeLessThan(18);
    camera.position.set(0, 1.6, 20);
    camera.lookAt(0, 1.6, 0);
    camera.updateMatrixWorld();
    expect(projection.measure(camera, 1200, 1200)).toBeLessThan(18);
  });

  it('keeps the current representation within the hysteresis band', () => {
    const lod = new PavingLod();
    expect(lod.update(22)).toBe(false);
    expect(lod.update(25)).toBe(true);
    for (const pixels of [23, 19, 21, 18]) expect(lod.update(pixels)).toBe(true);
    expect(lod.update(17)).toBe(false);
    for (const pixels of [19, 23, 20, 24]) expect(lod.update(pixels)).toBe(false);
  });
});
