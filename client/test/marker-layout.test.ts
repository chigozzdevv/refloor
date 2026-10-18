import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import { destinations } from '@/shared/navigation/destinations';
import { organizeMarkers } from '@/shared/navigation/marker-layout';

const stops = destinations(
  compileBuilding(createHouse({ id: 'layout', name: 'Layout', storeys: 1 })),
);
const marker = (x: number, y: number, distance: number, index = 0) => ({
  x,
  y,
  distance,
  destination: stops[index]!,
});

describe('tour marker layout', () => {
  it('keeps a nearer stop when points overlap in screen space', () => {
    const near = marker(160, 390, 2),
      far = marker(165, 360, 5, 1);
    expect(organizeMarkers([far, near], 320, 600)).toEqual([near]);
  });
  it('keeps controls clear of the header, floor plan and movement pad', () => {
    const clear = marker(160, 320, 3);
    expect(
      organizeMarkers(
        [marker(10, 320, 1), marker(160, 60, 1), marker(160, 550, 1), marker(160, 460, 1), clear],
        320,
        600,
      ),
    ).toEqual([clear]);
  });
  it('shows at most three separate choices in a wide view', () => {
    const result = organizeMarkers(
      [marker(150, 200, 2), marker(450, 300, 3), marker(750, 200, 4), marker(1050, 350, 5)],
      1280,
      800,
    );
    expect(result).toHaveLength(3);
    for (const [index, point] of result.entries())
      expect(
        result
          .slice(index + 1)
          .every((other) => Math.hypot(point.x - other.x, point.y - other.y) >= 100),
      ).toBe(true);
  });
  it('reserves room for long labels so they neither clip nor cover one another', () => {
    const destination = { ...stops[0]!, caption: 'Living and Dining Room' },
      near = { ...marker(200, 300, 2), destination },
      beside = { ...marker(310, 300, 3), destination },
      edge = { ...marker(40, 300, 1), destination };
    expect(organizeMarkers([edge, beside, near], 800, 600)).toEqual([near]);
  });
});
