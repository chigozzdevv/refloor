import type { SceneObject } from '@refloor/scene';
import { openableClearance } from '@refloor/scene';
import { colliderBounds } from '@refloor/engine/collision/bounds';
import { rotate } from '@refloor/engine/math';
import type { BoxCollider, CompiledBuilding, Point3 } from '@refloor/engine/types';

export function wallInteractionPositions(object: SceneObject, margin: number) {
  const side = object.dimensions.width / 2 + margin;
  return [margin, margin + 0.5, margin + 1].flatMap((distance) =>
    [0, -side, side].map((x) => ({ x, z: object.dimensions.depth / 2 + distance })),
  );
}

export function openableInteractionPositions(object: SceneObject, margin: number) {
  if (!object.behaviours.some((behaviour) => behaviour.kind === 'openable' && behaviour.state.open))
    return [];
  const clearance = openableClearance(object);
  if (!clearance) return [];
  return [0, -clearance.width / 2 - margin, clearance.width / 2 + margin].map((x) => ({
    x: clearance.offsetX + x,
    z: object.dimensions.depth / 2 + clearance.depth + margin,
  }));
}

function segmentIntersectsBox(from: Point3, to: Point3, box: BoxCollider): boolean {
  const local = (point: Point3) => ({
    ...rotate({ x: point.x - box.position.x, z: point.z - box.position.z }, -box.rotation),
    y: point.y - box.position.y,
  });
  const start = local(from),
    end = local(to);
  let enter = 0,
    exit = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const delta = end[axis] - start[axis],
      half = box.size[axis] / 2;
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(start[axis]) > half) return false;
      continue;
    }
    const near = (-half - start[axis]) / delta,
      far = (half - start[axis]) / delta;
    enter = Math.max(enter, Math.min(near, far));
    exit = Math.min(exit, Math.max(near, far));
    if (enter > exit) return false;
  }
  return exit > 1e-6 && enter < 1 - 1e-6;
}

export function interactionVisible(compiled: CompiledBuilding, object: SceneObject, point: Point3) {
  const eye = { ...point, y: point.y + Math.min(1.6, compiled.options.headroom - 0.1) },
    target = {
      x: object.position.x,
      y: point.y + object.position.y + object.dimensions.height / 2,
      z: object.position.z,
    };
  return !compiled.colliders.some(
    (collider) =>
      collider.entityId !== object.id &&
      collider.role !== 'door' &&
      collider.role !== 'window' &&
      segmentIntersectsBox(eye, target, colliderBounds(collider)),
  );
}
