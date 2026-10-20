import type { Point3 } from '@refloor/engine';
import type { CharacterWorld } from '@/shared/navigation/physics-world';
import { journeyPace, navigationPace } from '@/shared/navigation/pacing';

export type Journey = {
  points: Point3[];
  index: number;
  speed: number;
  idle: number;
  heading: number | null;
};

export function createJourney(points: Point3[]): Journey {
  return { points, index: 0, speed: 0, idle: 0, heading: null };
}

export function stepJourney(world: CharacterWorld, journey: Journey, delta: number) {
  const feet = world.feet,
    dt = Math.min(delta, 0.05);
  let point = journey.points[journey.index];
  while (
    point &&
    Math.hypot(point.x - feet.x, point.z - feet.z) < 0.035 &&
    Math.abs(point.y - feet.y) < 0.4
  )
    point = journey.points[++journey.index];
  if (!point) {
    world.step({ x: 0, z: 0 }, dt);
    return 'arrived' as const;
  }
  const distance = Math.hypot(point.x - feet.x, point.z - feet.z),
    last = journey.points.at(-1)!,
    remaining = Math.hypot(last.x - feet.x, last.z - feet.z, last.y - feet.y);
  journey.speed = Math.min(
    journeyPace(world.compiled, feet, point),
    journey.speed + dt * navigationPace.acceleration,
    Math.max(0.3, Math.sqrt(remaining * navigationPace.braking)),
  );
  const speed = Math.min(journey.speed, distance / Math.max(dt, 1 / 60)),
    x = distance > 0.0001 ? ((point.x - feet.x) / distance) * speed : 0,
    z = distance > 0.0001 ? ((point.z - feet.z) / distance) * speed : 0;
  if (distance > 0.1) journey.heading = Math.atan2(-x, -z);
  world.step({ x, z }, dt);
  const next = world.feet;
  const progress =
    Math.hypot(point.x - feet.x, point.y - feet.y, point.z - feet.z) -
    Math.hypot(point.x - next.x, point.y - next.y, point.z - next.z);
  journey.idle = progress < 0.0005 ? journey.idle + dt : 0;
  return journey.idle > 1.2 ? ('blocked' as const) : ('moving' as const);
}
