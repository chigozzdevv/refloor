import { describe, expect, it } from 'vitest';
import { duvetGeometry, roundedFurnitureGeometry } from '@/shared/scene/furniture-geometry';

describe('furniture detail geometry', () => {
  it('maps broad joinery faces in metres while preserving the requested bounds', () => {
    const geometry = roundedFurnitureGeometry([1.6, 0.65, 0.42]);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.x).toBeCloseTo(-0.8);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(0.325);
    expect(geometry.boundingBox?.max.z).toBeCloseTo(0.21);
    const position = geometry.getAttribute('position'),
      normal = geometry.getAttribute('normal'),
      uv = geometry.getAttribute('uv');
    let frontVertices = 0;
    for (let i = 0; i < position.count; i++) {
      if (normal.getZ(i) < 0.999) continue;
      frontVertices++;
      expect(uv.getX(i)).toBeCloseTo(position.getX(i));
      expect(uv.getY(i)).toBeCloseTo(position.getY(i));
    }
    expect(frontVertices).toBeGreaterThan(0);
    geometry.dispose();
  });

  it('keeps countertop texture coordinates continuous across separately cut pieces', () => {
    const left = roundedFurnitureGeometry([0.7, 0.05, 0.65], 0.018, [-0.4, 0.87, 0]),
      right = roundedFurnitureGeometry([0.7, 0.05, 0.65], 0.018, [0.4, 0.87, 0]);
    for (const [geometry, offset] of [
      [left, -0.4],
      [right, 0.4],
    ] as const) {
      const position = geometry.getAttribute('position'),
        normal = geometry.getAttribute('normal'),
        uv = geometry.getAttribute('uv');
      for (let i = 0; i < position.count; i++) {
        if (normal.getY(i) < 0.999) continue;
        expect(uv.getX(i)).toBeCloseTo(position.getX(i) + offset);
        expect(uv.getY(i)).toBeCloseTo(position.getZ(i));
      }
      geometry.dispose();
    }
  });

  it('keeps bedding inside the bed footprint and forms a visible side and foot drape', () => {
    const geometry = duvetGeometry(1.95, 2.2);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.x).toBeGreaterThan(-1.95 / 2);
    expect(geometry.boundingBox?.max.x).toBeLessThan(1.95 / 2);
    expect((geometry.boundingBox?.max.z ?? 0) + 2.2 * 0.105).toBeLessThan(2.2 / 2);
    expect(geometry.boundingBox?.min.y).toBeLessThan(-0.35);
    expect(geometry.boundingBox?.max.y).toBeGreaterThan(0);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      expect(Number.isFinite(position.getY(i))).toBe(true);
      expect(Number.isFinite(geometry.getAttribute('normal').getY(i))).toBe(true);
    }
    geometry.dispose();
  });
});
