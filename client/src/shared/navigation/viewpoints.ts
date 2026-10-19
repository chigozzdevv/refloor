import type { Floor, Room } from '@refloor/scene';
import type { CompiledBuilding, Point3 } from '@refloor/engine';
import { contains, rotate } from '@refloor/engine/math';
import { colliderBounds } from '@refloor/engine/collision/bounds';

export function clearView(
  compiled: CompiledBuilding,
  from: Point3,
  to: Point3,
  featureId?: string,
) {
  return !compiled.colliders.some((collider) => {
    if (collider.entityId === featureId) return false;
    const box = colliderBounds(collider),
      origin = rotate({ x: from.x - box.position.x, z: from.z - box.position.z }, -box.rotation),
      end = rotate({ x: to.x - box.position.x, z: to.z - box.position.z }, -box.rotation);
    let near = 0.01,
      far = 0.98;
    const axes: [number, number, number][] = [
      [origin.x, end.x, box.size.x / 2],
      [from.y - box.position.y, to.y - box.position.y, box.size.y / 2],
      [origin.z, end.z, box.size.z / 2],
    ];
    for (const [start, finish, extent] of axes) {
      const delta = finish - start;
      if (Math.abs(delta) < 0.00001) {
        if (Math.abs(start) > extent) return false;
      } else {
        const a = (-extent - start) / delta,
          b = (extent - start) / delta;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
        if (near > far) return false;
      }
    }
    return true;
  });
}

export function roomViews(compiled: CompiledBuilding, floor: Floor, room: Room, points: Point3[]) {
  const rect = room.footprint,
    centre = { x: rect.x + rect.width / 2, y: floor.elevation, z: rect.z + rect.depth / 2 },
    transit = room.kind === 'corridor' || room.kind === 'stairwell';
  const feature = transit
    ? undefined
    : ['television', 'bed', 'sofa', 'table']
        .map((kind) =>
          compiled.building.objects.find(
            (object) => object.roomId === room.id && object.kind === kind,
          ),
        )
        .find((object) => object !== undefined);
  const focal = feature
    ? {
        x: feature.position.x,
        y: floor.elevation + feature.position.y + feature.dimensions.height * 0.65,
        z: feature.position.z,
      }
    : { ...centre, y: floor.elevation + 1.2 };
  const front = rotate(
    { x: 0, z: Math.min(3, Math.max(1.8, Math.min(rect.width, rect.depth) * 0.6)) },
    feature?.rotation ?? 0,
  );
  const desired = feature
    ? { x: focal.x + front.x, y: floor.elevation, z: focal.z + front.z }
    : centre;
  const candidates = points.filter(
    (point) =>
      contains(rect, point, 0.15) &&
      compiled.doors
        .filter((door) => door.floorId === floor.id)
        .every(
          (door) =>
            Math.hypot(point.x - door.hinge.x, point.z - door.hinge.z) >
            door.width + compiled.options.radius + 0.12,
        ),
  );
  const views: { position: Point3; lookAt?: Point3 }[] = [];
  const pick = (preferred: Point3) => {
    const ranked = candidates
      .filter((point) =>
        views.every(
          (view) => Math.hypot(view.position.x - point.x, view.position.z - point.z) > 2.2,
        ),
      )
      .map((point) => ({
        point,
        score:
          Math.hypot(point.x - preferred.x, point.z - preferred.z) +
          Math.max(
            0,
            0.7 -
              Math.min(
                point.x - rect.x,
                point.z - rect.z,
                rect.x + rect.width - point.x,
                rect.z + rect.depth - point.z,
              ),
          ) *
            3,
      }))
      .sort((a, b) => a.score - b.score);
    const best = feature
      ? (ranked
          .slice(0, 48)
          .find(({ point }) =>
            clearView(compiled, { ...point, y: floor.elevation + 1.62 }, focal, feature.id),
          ) ?? ranked[0])
      : ranked[0];
    if (best) views.push({ position: best.point, ...(!transit ? { lookAt: focal } : {}) });
  };
  pick(desired);
  if (!transit && rect.width * rect.depth > 25) pick(centre);
  return views;
}
