import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Building } from '@refloor/scene';
import { compileBuilding } from '@refloor/engine';
import { createHouse } from '@refloor/catalogue/houses';
import { CharacterWorld } from '@/shared/navigation/physics-world';
import { StairWalker, stairAssist } from '@/shared/navigation/stair-assist';
import { navigationPace } from '@/shared/navigation/pacing';

const houses = [
  createHouse({ id: 'stair-release', name: 'Linden', storeys: 2 }),
  JSON.parse(
    readFileSync(new URL('fixtures/generated-two-storey.json', import.meta.url), 'utf8'),
  ) as Building,
];
const forward = { forward: 1, sideways: 0, turn: 0 };

describe.each(houses)('stair walking in $name', (building) => {
  it.each([true, false])('hands held forward movement back after ascending=%s', (ascending) => {
    const compiled = compileBuilding(building),
      stair = compiled.stairs[0]!,
      path = ascending ? stair.path : stair.path.toReversed(),
      world = new CharacterWorld(compiled, path[0]!),
      walker = new StairWalker();
    let yaw = Math.atan2(path[0]!.x - path[1]!.x, path[0]!.z - path[1]!.z),
      arrived = false;
    try {
      for (let frame = 0; frame < 5000; frame++) {
        const result = walker.step(world, forward, yaw, 1 / 60);
        expect(result).not.toBeNull();
        expect(result!.status).not.toBe('blocked');
        yaw = result!.yaw;
        if (result!.status === 'arrived') {
          arrived = true;
          break;
        }
      }
      expect(arrived).toBe(true);
      const landing = world.feet;
      for (let frame = 0; frame < 60; frame++) {
        expect(walker.step(world, forward, yaw, 1 / 60)).toBeNull();
        world.step(
          { x: -Math.sin(yaw) * navigationPace.walk, z: -Math.cos(yaw) * navigationPace.walk },
          1 / 60,
        );
      }
      expect(Math.hypot(world.feet.x - landing.x, world.feet.z - landing.z)).toBeGreaterThan(0.7);
      expect(world.player.floorId).toBe(ascending ? stair.upper.floorId : stair.lower.floorId);
    } finally {
      world.dispose();
    }
  });

  it('allows crossing the upper landing sideways without starting a descent', () => {
    const compiled = compileBuilding(building),
      path = compiled.stairs[0]!.path.toReversed(),
      world = new CharacterWorld(compiled, path[0]!);
    try {
      const descending = Math.atan2(path[0]!.x - path[1]!.x, path[0]!.z - path[1]!.z);
      for (const offset of [-Math.PI / 2, Math.PI / 2, Math.PI])
        expect(stairAssist(compiled, world.player, descending + offset)).toBeNull();
      expect(stairAssist(compiled, world.player, descending)?.ascending).toBe(false);
    } finally {
      world.dispose();
    }
  });

  it('honours a manual turn until forward is released, then permits an intentional stair approach', () => {
    const compiled = compileBuilding(building),
      path = compiled.stairs[0]!.path,
      world = new CharacterWorld(compiled, path[0]!),
      walker = new StairWalker(),
      yaw = Math.atan2(path[0]!.x - path[1]!.x, path[0]!.z - path[1]!.z);
    try {
      expect(walker.step(world, forward, yaw, 1 / 60)?.status).toBe('moving');
      expect(walker.step(world, { ...forward, turn: 1 }, yaw, 1 / 60)).toBeNull();
      expect(walker.step(world, forward, yaw, 1 / 60)).toBeNull();
      expect(walker.step(world, { ...forward, forward: 0 }, yaw, 1 / 60)).toBeNull();
      expect(walker.step(world, forward, yaw, 1 / 60)?.status).toBe('moving');
    } finally {
      world.dispose();
    }
  });
});
