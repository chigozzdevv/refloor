import type { Floor, Room, SceneObject } from '@refloor/scene';
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

export function roomObjectUse(object: SceneObject): Room['kind'] | null {
  if (
    object.assetId === 'catalogue/kitchen-counter' ||
    object.behaviours.some((item) => item.kind === 'cooker')
  )
    return 'kitchen';
  if (['catalogue/vanity', 'catalogue/shower'].includes(object.assetId)) return 'bathroom';
  if (object.kind === 'television' || object.kind === 'sofa') return 'living';
  if (object.kind === 'bed') return 'bedroom';
  if (object.assetId === 'catalogue/dining-table') return 'dining';
  if (object.assetId === 'catalogue/desk') return 'workspace';
  return null;
}

export function roomObjectPriority(room: Room, object: SceneObject): number {
  const use = roomObjectUse(object),
    uses = room.uses ?? [room.kind];
  if (use && uses.includes(use))
    return object.kind === 'sofa' || object.assetId === 'catalogue/shower' ? 1 : 0;
  if (
    object.kind === 'television' ||
    object.kind === 'bed' ||
    object.behaviours.some((item) => ['cooker', 'water'].includes(item.kind))
  )
    return 4;
  return object.kind === 'decor' ? 8 : 6;
}

export function objectLookAt(floor: Floor, object: SceneObject): Point3 {
  const fixture =
    object.behaviours.some((item) => item.kind === 'cooker' || item.kind === 'water') ||
    ['catalogue/kitchen-counter', 'catalogue/vanity'].includes(object.assetId);
  return {
    x: object.position.x,
    y:
      floor.elevation +
      Math.max(1.05, object.position.y + object.dimensions.height * (fixture ? 0.95 : 0.65)),
    z: object.position.z,
  };
}

export function comfortableLookAt(from: Point3, focal: Point3): Point3 {
  const distance = Math.hypot(focal.x - from.x, focal.z - from.z);
  return { ...focal, y: Math.max(focal.y, from.y - Math.tan(Math.PI / 10) * distance) };
}

export function roomViews(compiled: CompiledBuilding, floor: Floor, room: Room, points: Point3[]) {
  const rect = room.footprint,
    centre = { x: rect.x + rect.width / 2, y: floor.elevation, z: rect.z + rect.depth / 2 },
    transit = room.kind === 'corridor' || room.kind === 'stairwell';
  const features = transit
    ? []
    : compiled.building.objects
        .filter((object) => object.roomId === room.id && object.kind !== 'light')
        .sort(
          (a, b) =>
            roomObjectPriority(room, a) - roomObjectPriority(room, b) ||
            Number(roomObjectUse(a) !== room.kind) - Number(roomObjectUse(b) !== room.kind),
        );
  const feature = features[0];
  const focalFor = (object?: SceneObject) =>
    object ? objectLookAt(floor, object) : { ...centre, y: floor.elevation + 1.2 };
  const desiredFor = (object?: SceneObject) => {
    if (!object) return centre;
    const focal = focalFor(object),
      front = rotate(
        { x: 0, z: Math.min(3, Math.max(2.2, Math.min(rect.width, rect.depth) * 0.6)) },
        object.rotation,
      );
    return { x: focal.x + front.x, y: floor.elevation, z: focal.z + front.z };
  };
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
  const pick = (preferred: Point3, subject = feature) => {
    const focal = focalFor(subject);
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
    const best = subject
      ? (ranked.slice(0, 48).find(({ point }) => {
          const from = { ...point, y: floor.elevation + 1.62 };
          return (
            clearView(compiled, from, focal, subject.id) &&
            clearView(compiled, from, comfortableLookAt(from, focal), subject.id)
          );
        }) ?? ranked[0])
      : ranked[0];
    if (best)
      views.push({
        position: best.point,
        ...(!transit
          ? { lookAt: comfortableLookAt({ ...best.point, y: floor.elevation + 1.62 }, focal) }
          : {}),
      });
  };
  pick(desiredFor(feature));
  if (!transit && rect.width * rect.depth > 25) {
    const secondary = features
      .filter((object) => {
        const use = roomObjectUse(object);
        return (
          use &&
          use !== (feature ? roomObjectUse(feature) : null) &&
          (room.uses ?? [room.kind]).includes(use)
        );
      })
      .sort(
        (a, b) =>
          ['kitchen', 'living', 'dining'].indexOf(roomObjectUse(a)!) -
            ['kitchen', 'living', 'dining'].indexOf(roomObjectUse(b)!) ||
          roomObjectPriority(room, a) - roomObjectPriority(room, b),
      )[0];
    pick(secondary ? desiredFor(secondary) : centre, secondary ?? feature);
  }
  return views;
}
