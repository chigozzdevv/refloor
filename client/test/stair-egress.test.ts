import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import type { Building } from '@refloor/scene';
import { destinationRoute, destinations, smoothRoute } from '@/shared/navigation/destinations';
import { createJourney, stepJourney } from '@/shared/navigation/journey';
import { CharacterWorld, initializePhysics } from '@/shared/navigation/physics-world';

beforeAll(initializePhysics);

const houses = [
  createHouse({ id: 'landing-linden', name: 'Linden', storeys: 2 }),
  JSON.parse(
    readFileSync(new URL('fixtures/generated-two-storey.json', import.meta.url), 'utf8'),
  ) as Building,
];

describe('upper staircase egress', () => {
  it.each(houses)(
    'walks off the upper landing and reaches an upstairs stop in $name',
    (building) => {
      const compiled = compileBuilding(building),
        stair = compiled.stairs[0]!,
        world = new CharacterWorld(compiled, stair.lower.position);
      try {
        const climb = destinationRoute(compiled, world.player, stair.upper, 'current');
        expect(climb).not.toBeNull();
        const journey = createJourney(smoothRoute(compiled, climb!.points));
        let status = 'moving';
        for (let frame = 0; frame < 6000 && status === 'moving'; frame++)
          status = stepJourney(world, journey, 1 / 60);
        expect(
          status,
          JSON.stringify({ feet: world.feet, next: journey.points[journey.index] }),
        ).toBe('arrived');
        expect(world.player.floorId).toBe(stair.upper.floorId);
        const before = world.feet,
          previous = stair.path.at(-2)!,
          dx = stair.upper.position.x - previous.x,
          dz = stair.upper.position.z - previous.z,
          distance = Math.hypot(dx, dz);
        for (let frame = 0; frame < 36; frame++)
          world.step({ x: (dx / distance) * 1.4, z: (dz / distance) * 1.4 }, 1 / 60);
        expect(Math.hypot(world.feet.x - before.x, world.feet.z - before.z)).toBeGreaterThan(0.7);
        expect(world.feet.y).toBeCloseTo(stair.upper.position.y, 1);
        const stop = destinations(compiled)
          .filter((value) => value.kind === 'room' && value.floorId === stair.upper.floorId)
          .map((value) => ({
            value,
            route: destinationRoute(compiled, world.player, value.target, 'current'),
          }))
          .filter((value) => value.route && value.route.length > 1)
          .sort((a, b) => a.route!.length - b.route!.length)[0];
        expect(stop).toBeDefined();
        const exit = createJourney(smoothRoute(compiled, stop!.route!.points));
        status = 'moving';
        for (let frame = 0; frame < 6000 && status === 'moving'; frame++)
          status = stepJourney(world, exit, 1 / 60);
        expect(status, JSON.stringify({ feet: world.feet, next: exit.points[exit.index] })).toBe(
          'arrived',
        );
        expect(
          Math.hypot(
            world.feet.x - stop!.value.target.position.x,
            world.feet.z - stop!.value.target.position.z,
          ),
        ).toBeLessThan(0.05);
      } finally {
        world.dispose();
      }
    },
  );
});
