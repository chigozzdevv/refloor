import type { CompiledBuilding, NavigationPoint } from '@refloor/engine';
import { destinationRoute, nearbyRoute, smoothRoute } from '@/shared/navigation/destinations';
import { createJourney, stepJourney } from '@/shared/navigation/journey';
import type { Journey } from '@/shared/navigation/journey';
import type { CharacterWorld } from '@/shared/navigation/physics-world';

export type StairAssist = { id: string; journey: Journey; ascending: boolean; complete: boolean };

export function advanceStairAssist(
  world: CharacterWorld,
  assist: StairAssist,
  yaw: number,
  delta: number,
) {
  const dt = Math.min(delta, 0.05),
    feet = world.feet;
  const ahead = assist.journey.points
    .slice(assist.journey.index)
    .find((point) => Math.hypot(point.x - feet.x, point.z - feet.z) > 0.05);
  const heading = ahead ? Math.atan2(feet.x - ahead.x, feet.z - ahead.z) : yaw;
  const angle = Math.atan2(Math.sin(heading - yaw), Math.cos(heading - yaw));
  const nextYaw = yaw + Math.max(-dt * 2.8, Math.min(dt * 2.8, angle));
  if (assist.complete || Math.abs(angle) >= 0.4) {
    world.step({ x: 0, z: 0 }, dt);
    return { yaw: nextYaw, status: assist.complete ? ('arrived' as const) : ('moving' as const) };
  }
  const status = stepJourney(world, assist.journey, dt);
  assist.complete = status !== 'moving';
  return { yaw: nextYaw, status };
}

export function stairAssist(
  compiled: CompiledBuilding,
  player: NavigationPoint,
  yaw: number,
): StairAssist | null {
  for (const stair of compiled.stairs) {
    const point = player.position;
    const nearest = stair.path
      .map((position, index) => ({
        index,
        distance: Math.hypot(position.x - point.x, position.y - point.y, position.z - point.z),
      }))
      .sort((a, b) => a.distance - b.distance)[0]!;
    const onFlight =
      point.y > stair.lower.position.y + 0.15 &&
      point.y < stair.upper.position.y - 0.15 &&
      nearest.distance < 0.75;
    for (const ascending of [true, false]) {
      const start = ascending ? stair.lower : stair.upper;
      if (
        !onFlight &&
        (player.floorId !== start.floorId ||
          Math.hypot(point.x - start.position.x, point.z - start.position.z) > 1.4 ||
          !nearbyRoute(
            compiled,
            { ...player, position: { ...point, y: start.position.y } },
            start,
            'current',
          ))
      )
        continue;
      const path = ascending ? stair.path : stair.path.toReversed();
      const ahead = onFlight
        ? stair.path[
            Math.max(0, Math.min(stair.path.length - 1, nearest.index + (ascending ? 3 : -3)))
          ]!
        : Math.hypot(point.x - start.position.x, point.z - start.position.z) > 0.5
          ? start.position
          : path[1]!;
      const dx = ahead.x - point.x,
        dz = ahead.z - point.z,
        distance = Math.hypot(dx, dz);
      const facing = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / Math.max(0.001, distance);
      if (facing < (onFlight ? 0 : -0.15)) continue;
      const target = ascending ? stair.upper : stair.lower;
      const route = destinationRoute(compiled, player, target, 'current');
      if (!route) continue;
      return {
        id: stair.id,
        ascending,
        complete: false,
        journey: createJourney(smoothRoute(compiled, route.points)),
      };
    }
  }
  return null;
}
