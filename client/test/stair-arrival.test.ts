import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import type { Building } from '@refloor/scene';
import { arrivalView } from '@/shared/navigation/arrival';
import { destinations } from '@/shared/navigation/destinations';
import { CharacterWorld, initializePhysics } from '@/shared/navigation/physics-world';
import { clearView } from '@/shared/navigation/viewpoints';
import { Walkthrough } from '@/shared/navigation/walkthrough';

beforeAll(initializePhysics);

describe('onward views after stair travel', () => {
  it.each([
    createHouse({ id: 'stair-arrival-linden', name: 'Linden', storeys: 2 }),
    JSON.parse(
      readFileSync(new URL('fixtures/generated-two-storey.json', import.meta.url), 'utf8'),
    ) as Building,
  ])('faces an onward room interaction after ascending and descending in $name', (building) => {
    const compiled = compileBuilding(building),
      stair = compiled.stairs[0]!;
    for (const [start, target, adjacent] of [
      [stair.lower, stair.upper, stair.path.at(-2)!],
      [stair.upper, stair.lower, stair.path[1]!],
    ] as const) {
      const world = new CharacterWorld(compiled, start.position),
        tour = new Walkthrough(),
        destination = destinations(compiled).find(
          (stop) => stop.kind === 'stairs' && stop.target === target,
        )!,
        request = {
          id: crypto.randomUUID(),
          target,
          label: destination.label,
          ...(destination.lookAt ? { lookAt: destination.lookAt } : {}),
        };
      let view = { yaw: 0, pitch: 0 },
        arrived = false;
      try {
        for (let frame = 0; frame < 6000; frame++) {
          const result = tour.step(world, request, view, 1 / 60);
          view = result;
          expect(result.commands).toEqual([]);
          expect(result.status).not.toBe('blocked');
          if (result.status === 'arrived') {
            arrived = true;
            break;
          }
        }
        expect(arrived, destination.label).toBe(true);
        expect(world.player.floorId).toBe(target.floorId);
        const onward = arrivalView(compiled, target, destination.lookAt, undefined, stair.id)!;
        expect(onward).not.toBeNull();
        expect(onward.kind).not.toBe('stairs');
        expect(onward.entityId).not.toContain(`stairs:${stair.id}`);
        expect(
          clearView(
            compiled,
            { ...world.feet, y: world.feet.y + 1.62 },
            onward.point,
            onward.entityId,
          ),
        ).toBe(true);
        const yaw = Math.atan2(world.feet.x - onward.point.x, world.feet.z - onward.point.z);
        expect(
          Math.abs(Math.atan2(Math.sin(view.yaw - yaw), Math.cos(view.yaw - yaw))),
        ).toBeLessThan(0.08);
        const returnYaw = Math.atan2(world.feet.x - adjacent.x, world.feet.z - adjacent.z);
        expect(
          Math.abs(Math.atan2(Math.sin(view.yaw - returnYaw), Math.cos(view.yaw - returnYaw))),
          destination.label,
        ).toBeGreaterThan(0.55);
      } finally {
        world.dispose();
      }
    }
  });
});
