import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import type { BufferGeometry } from 'three';
import { landscapeFoliage } from '@/shared/scene/landscape-foliage';
import { landscapeLayout } from '@/shared/scene/landscape';
import { exteriorLayout } from '@/shared/scene/exterior';

const triangles = (geometry: BufferGeometry) =>
  (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;

describe('landscape leaf geometry', () => {
  it('keeps actual foliage within the tested planting clearances and shades every leaf', () => {
    const geometry = landscapeFoliage('high');
    try {
      for (const [kind, radius] of [
        ['shrubs', 1.05],
        ['trees', 1.4],
      ] as const) {
        const positions = geometry[kind].getAttribute('position'),
          colors = geometry[kind].getAttribute('color'),
          normal = geometry[kind].getAttribute('normal');
        expect(colors.count).toBe(positions.count);
        expect(normal.count).toBe(positions.count);
        for (let index = 0; index < positions.count; index++) {
          expect(Math.hypot(positions.getX(index), positions.getZ(index))).toBeLessThanOrEqual(
            radius + 1e-6,
          );
          expect(Number.isFinite(normal.getY(index))).toBe(true);
        }
      }
      geometry.trunks.computeBoundingBox();
      expect(geometry.trunks.boundingBox!.min.y).toBeLessThan(0.01);
      expect(geometry.trunks.boundingBox!.max.y).toBeGreaterThan(2.5);
    } finally {
      Object.values(geometry).forEach((value) => value.dispose());
    }
  });

  it('retains the same leaf positions in reduced quality and remains within the geometry budget', () => {
    const site = exteriorLayout(
        compileBuilding(createHouse({ id: 'foliage-budget', name: 'Linden', storeys: 2 })),
      ),
      high = landscapeFoliage('high'),
      low = landscapeFoliage('balanced');
    try {
      for (const kind of ['shrubs', 'trees'] as const) {
        const source = high[kind].getAttribute('position'),
          reduced = low[kind].getAttribute('position'),
          positions = new Set(
            Array.from(
              { length: source.count },
              (_value, index) =>
                `${source.getX(index)}:${source.getY(index)}:${source.getZ(index)}`,
            ),
          );
        expect(triangles(low[kind])).toBeLessThan(triangles(high[kind]));
        for (let index = 0; index < reduced.count; index++)
          expect(
            positions.has(`${reduced.getX(index)}:${reduced.getY(index)}:${reduced.getZ(index)}`),
          ).toBe(true);
      }
      for (const [quality, geometry, maximum] of [
        ['high', high, 100_000],
        ['balanced', low, 40_000],
      ] as const) {
        for (const compound of [site.compound, { ...site.compound, width: 60, depth: 60 }]) {
          const layout = landscapeLayout({ ...site, compound }, quality),
            count =
              layout.shrubs.length * triangles(geometry.shrubs) +
              layout.trees.length * (triangles(geometry.trees) + triangles(geometry.trunks)) +
              layout.grasses.length * 27 +
              layout.stones.length * 20 +
              144;
          expect(count).toBeLessThan(maximum);
        }
      }
    } finally {
      [...Object.values(high), ...Object.values(low)].forEach((value) => value.dispose());
    }
  });
});
