import { describe, expect, it } from 'vitest';
import { buildNavigation, compileBuilding } from '@refloor/engine';
import { createTwoStorey } from '@engine-test/fixtures';

describe('allocated navigation node budgets', () => {
  it('permits obstacle boundary samples that do not allocate walkable graph nodes', () => {
    const building = createTwoStorey(),
      baseline = buildNavigation(compileBuilding(building)),
      compiled = compileBuilding(building, { maxNodes: baseline.nodes.length });
    expect(buildNavigation(compiled).nodes).toHaveLength(baseline.nodes.length);
  });

  it('enforces the combined allocated node cap across floors', () => {
    const building = createTwoStorey(),
      baseline = buildNavigation(compileBuilding(building)),
      largestRegularFloor = Math.max(
        ...building.floors.map(
          (floor) =>
            Math.ceil(floor.footprint.width / 0.2) * Math.ceil(floor.footprint.depth / 0.2),
        ),
      ),
      maxNodes = Math.floor((largestRegularFloor + baseline.nodes.length) / 2);
    expect(maxNodes).toBeGreaterThanOrEqual(largestRegularFloor);
    expect(maxNodes).toBeLessThan(baseline.nodes.length);
    expect(() => buildNavigation(compileBuilding(building, { maxNodes }))).toThrow(
      'Building exceeds the navigation node budget',
    );
  });
});
