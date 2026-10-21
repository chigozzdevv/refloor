import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import { createJourney, stepJourney } from '@/shared/navigation/journey';
import { journeyPace, navigationPace } from '@/shared/navigation/pacing';
import { CharacterWorld } from '@/shared/navigation/physics-world';

function emptyHouse() {
  const building = createHouse({ id: 'walking-pace', name: 'Walking pace', storeys: 1 });
  building.objects = [];
  return compileBuilding(building);
}

describe('navigation pacing', () => {
  it('walks a useful distance in one second without changing the character collision size', () => {
    const compiled = emptyHouse(),
      world = new CharacterWorld(compiled, { x: 2, y: 0, z: 1.5 });
    try {
      const start = world.feet;
      for (let frame = 0; frame < 60; frame++) world.step({ x: 0, z: navigationPace.walk }, 1 / 60);
      expect(world.feet.z - start.z).toBeCloseTo(2.25, 2);
      expect(world.capsule.radius()).toBeCloseTo(compiled.options.radius, 5);
    } finally {
      world.dispose();
    }
  });

  it('keeps the wall solid at the faster manual pace', () => {
    const compiled = emptyHouse(),
      world = new CharacterWorld(compiled, { x: 2, y: 0, z: 1 });
    try {
      for (let frame = 0; frame < 90; frame++)
        world.step({ x: 0, z: -navigationPace.fastWalk }, 1 / 30);
      expect(world.feet.z).toBeGreaterThan(compiled.options.radius);
      expect(world.feet.z).toBeLessThan(0.6);
    } finally {
      world.dispose();
    }
  });

  it.each([30, 60])('finishes a clear six-metre trip promptly at %s fps', (fps) => {
    const compiled = emptyHouse(),
      start = { x: 2, y: 0, z: 1.5 },
      target = { x: 2, y: 0, z: 7.5 },
      world = new CharacterWorld(compiled, start),
      journey = createJourney([start, target]);
    let status = 'moving',
      frames = 0;
    try {
      while (status === 'moving' && frames < fps * 5) {
        status = stepJourney(world, journey, 1 / fps);
        frames++;
      }
      expect(status).toBe('arrived');
      expect(frames / fps).toBeLessThan(3.5);
      expect(Math.hypot(world.feet.x - target.x, world.feet.z - target.z)).toBeLessThan(0.05);
      const arrived = world.feet;
      for (let frame = 0; frame < fps; frame++) stepJourney(world, journey, 1 / fps);
      expect(Math.hypot(world.feet.x - arrived.x, world.feet.z - arrived.z)).toBeLessThan(0.001);
    } finally {
      world.dispose();
    }
  });

  it('reserves slower pacing for doorway thresholds and staircase landings', () => {
    const compiled = compileBuilding(
        createHouse({ id: 'careful-travel', name: 'Careful travel', storeys: 2 }),
      ),
      doorway = compiled.doors[0]!.centre,
      stair = compiled.stairs[0]!.lower.position;
    expect(journeyPace(compiled, doorway, doorway)).toBeLessThan(navigationPace.walk);
    expect(journeyPace(compiled, stair, stair)).toBeLessThan(navigationPace.walk);
    expect(journeyPace(compiled, { x: 2, y: 0, z: 5 }, { x: 2, y: 0, z: 6 })).toBeGreaterThan(
      navigationPace.walk,
    );
  });
});
