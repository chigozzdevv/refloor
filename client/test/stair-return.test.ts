import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { Building } from '@refloor/scene';
import { compileBuilding } from '@refloor/engine';
import { CharacterWorld } from '@/shared/navigation/physics-world';
import { destinations, destinationRoute, smoothRoute } from '@/shared/navigation/destinations';
import { createJourney, stepJourney } from '@/shared/navigation/journey';
it('returns downstairs from the room-tour landing with a settled character', () => {
  const compiled = compileBuilding(
    JSON.parse(
      readFileSync(new URL('fixtures/generated-two-storey.json', import.meta.url), 'utf8'),
    ) as Building,
  );
  const hall = destinations(compiled).find((s) => s.kind === 'room' && s.roomId === 'first/hall')!;
  const world = new CharacterWorld(compiled, hall.target.position);
  try {
    for (let i = 0; i < 60; i++) world.step({ x: 0, z: 0 }, 1 / 60);
    const route = destinationRoute(compiled, world.player, compiled.stairs[0]!.lower, 'current');
    expect(route).not.toBeNull();
    const journey = createJourney(smoothRoute(compiled, route!.points));
    let status = 'moving';
    for (let i = 0; i < 6000 && status === 'moving'; i++)
      status = stepJourney(world, journey, 1 / 60);
    expect(
      status,
      JSON.stringify({
        feet: world.feet,
        index: journey.index,
        next: journey.points[journey.index],
        points: journey.points,
      }),
    ).toBe('arrived');
    expect(world.player.floorId).toBe('ground');
  } finally {
    world.dispose();
  }
});
