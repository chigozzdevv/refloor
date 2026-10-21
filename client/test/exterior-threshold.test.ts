import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import type { Building } from '@refloor/scene';
import { applyCommands } from '@refloor/scene';
import { compileBuilding } from '@refloor/engine';
import { entryPose } from '@/shared/navigation/entry';
import { CharacterWorld } from '@/shared/navigation/physics-world';
import { compoundTiles, exteriorLayout, exteriorNormal } from '@/shared/scene/exterior';

const houses = [
  createHouse({ id: 'threshold-garden', name: 'Garden', storeys: 1 }),
  createHouse({ id: 'threshold-linden', name: 'Linden', storeys: 2 }),
  ...['generated-bungalow', 'generated-two-storey'].map(
    (name) =>
      JSON.parse(
        readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'),
      ) as Building,
  ),
];

describe('exterior doorway threshold', () => {
  it.each(houses)(
    'keeps facade trim out of the doorway and off the timber plane in $name',
    (building) => {
      const compiled = compileBuilding(building),
        site = exteriorLayout(compiled);
      for (const floor of building.floors)
        for (const wall of floor.walls) {
          if (!exteriorNormal(wall, floor)) continue;
          const trim = site.plinth.filter((part) => part.wallId === wall.id);
          for (const part of trim) {
            expect(part.position.y + part.height / 2).toBeLessThan(floor.elevation - 0.004);
            for (const opening of wall.openings.filter((value) => value.kind === 'door'))
              expect(
                part.end <= opening.offset + 1e-6 ||
                  part.start >= opening.offset + opening.width - 1e-6,
              ).toBe(true);
          }
        }
      const pad = site.paving[0]!;
      expect(pad.position.y + pad.height / 2).toBeCloseTo(site.ground.elevation - 0.095);
      const tiles = compoundTiles(site);
      expect(tiles.length).toBeGreaterThan(0);
      for (const tile of tiles)
        expect(
          Math.abs(tile.x - pad.position.x) - 0.215 >= pad.width / 2 ||
            Math.abs(tile.z - pad.position.z) - 0.105 >= pad.depth / 2,
        ).toBe(true);
      for (const threshold of site.paving.slice(1)) {
        const openingId = threshold.id.replace(/:threshold$/, ''),
          wall = site.ground.walls.find((value) =>
            value.openings.some((opening) => opening.id === openingId),
          )!,
          normal = exteriorNormal(wall, site.ground)!,
          offset =
            (threshold.position.x - wall.start.x) * normal.x +
            (threshold.position.z - wall.start.z) * normal.z;
        expect(offset - threshold.depth / 2).toBeGreaterThan(0.001);
        expect(threshold.position.y + threshold.height / 2).toBeCloseTo(
          site.ground.elevation - 0.008,
        );
        expect(threshold.position.y - threshold.height / 2).toBeCloseTo(
          pad.position.y + pad.height / 2,
        );
      }
      expect(site.paving.length).toBeGreaterThan(1);
    },
  );

  it.each(houses)(
    'walks over the same rendered stone threshold in both directions in $name',
    (building) => {
      const initial = compileBuilding(building),
        entry = entryPose(initial),
        opened = applyCommands(building, {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          expectedRevision: building.revision,
          commands: [{ type: 'set-door', doorId: entry.doorId, open: true }],
        }),
        compiled = compileBuilding(opened.building),
        door = compiled.doors.find((value) => value.id === entry.doorId)!,
        floor = compiled.building.floors.find((value) => value.id === entry.floorId)!,
        start = {
          x: door.centre.x - entry.normal.x * 0.65,
          y: floor.elevation - 0.095,
          z: door.centre.z - entry.normal.z * 0.65,
        },
        world = new CharacterWorld(compiled, start);
      const progress = () =>
        (world.feet.x - door.centre.x) * entry.normal.x +
        (world.feet.z - door.centre.z) * entry.normal.z;
      try {
        for (let frame = 0; frame < 100; frame++) world.step(entry.normal, 1 / 60);
        expect(progress()).toBeGreaterThan(0.6);
        expect(world.feet.y).toBeGreaterThan(floor.elevation - 0.02);
        for (let frame = 0; frame < 100; frame++)
          world.step({ x: -entry.normal.x, z: -entry.normal.z }, 1 / 60);
        expect(progress()).toBeLessThan(-0.6);
        expect(world.feet.y).toBeLessThan(floor.elevation - 0.05);
      } finally {
        world.dispose();
      }
    },
  );
});
