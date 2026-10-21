import { afterEach, describe, expect, it } from 'vitest';
import { compileBuilding } from '@refloor/engine';
import { createHouse } from '@refloor/catalogue/houses';
import {
  joystickVector,
  movementInput,
  resetWalkInput,
  turningInput,
  walkInput,
} from '@/shared/navigation/input';
import { advanceStairAssist, stairAssist } from '@/shared/navigation/stair-assist';
import { CharacterWorld } from '@/shared/navigation/physics-world';

afterEach(resetWalkInput);

describe('walk pad input', () => {
  it('moves diagonally without rotating and has a centre dead zone', () => {
    expect(joystickVector(2, -2, 40)).toEqual({ x: 0, y: 0 });
    walkInput.pad = joystickVector(100, -100, 40);
    expect(walkInput.pad.x).toBeGreaterThan(0);
    expect(walkInput.pad.y).toBeGreaterThan(0);
    expect(movementInput().x).toBeGreaterThan(0);
    expect(movementInput().y).toBeGreaterThan(0);
    expect(turningInput()).toBe(0);
    walkInput.keys.add('w');
    walkInput.keys.add('d');
    expect(Math.hypot(...Object.values(movementInput()))).toBeCloseTo(1);
    resetWalkInput();
    expect(movementInput()).toEqual({ x: 0, y: 0 });
  });
  it.each([-1, 1])('steps sideways in direction %s without changing the view', (x) => {
    walkInput.pad = { x, y: 0 };
    expect(movementInput()).toEqual({ x, y: 0 });
    expect(turningInput()).toBe(0);
  });
  it('turns independently while walking and combines keyboard turning', () => {
    walkInput.pad = { x: 1, y: 0 };
    walkInput.turn = -1;
    walkInput.keys.add('arrowright');
    expect(movementInput()).toEqual({ x: 1, y: 0 });
    expect(turningInput()).toBe(0);
    walkInput.keys.clear();
    expect(turningInput()).toBe(-1);
  });
  it('keeps keyboard sideways movement and clamps combined inputs', () => {
    walkInput.keys.add('a');
    walkInput.pad = { x: -1, y: 1 };
    walkInput.turn = 1;
    walkInput.keys.add('arrowright');
    expect(movementInput().x).toBeLessThan(0);
    expect(movementInput().y).toBeGreaterThan(0);
    expect(Math.hypot(...Object.values(movementInput()))).toBeCloseTo(1);
    expect(turningInput()).toBe(1);
    resetWalkInput();
    expect(movementInput()).toEqual({ x: 0, y: 0 });
    expect(turningInput()).toBe(0);
  });
});

describe('stair alignment', () => {
  it.each([12, 14])('aligns and walks the actual %sm house staircase up and down', (width) => {
    const compiled = compileBuilding(
      createHouse({ id: `assist-${width}`, name: 'Stair assist', storeys: 2, width }),
    );
    const stair = compiled.stairs[0]!;
    const world = new CharacterWorld(compiled, stair.lower.position);
    try {
      for (const ascending of [true, false]) {
        const path = ascending ? stair.path : stair.path.toReversed();
        const a = path[0]!,
          b = path[1]!;
        let yaw = Math.atan2(a.x - b.x, a.z - b.z) + 0.8;
        const assist = stairAssist(compiled, world.player, yaw);
        expect(assist?.ascending).toBe(ascending);
        let status = 'moving';
        for (let i = 0; i < 5000 && status === 'moving'; i++) {
          const step = advanceStairAssist(world, assist!, yaw, 1 / 60);
          expect(Math.abs(step.yaw - yaw)).toBeLessThanOrEqual(2.8 / 60 + 1e-6);
          yaw = step.yaw;
          status = step.status;
        }
        expect(status).toBe('arrived');
        expect(world.feet.y).toBeCloseTo(
          ascending ? stair.upper.position.y : stair.lower.position.y,
          1,
        );
      }
    } finally {
      world.dispose();
    }
  });
  it('leaves walking alone when facing away from the stairs', () => {
    const compiled = compileBuilding(createHouse({ id: 'away', name: 'Away', storeys: 2 }));
    const stair = compiled.stairs[0]!,
      a = stair.path[0]!,
      b = stair.path[1]!;
    expect(stairAssist(compiled, stair.lower, Math.atan2(b.x - a.x, b.z - a.z))).toBeNull();
  });
});
