import type { Footprint } from '@refloor/scene';
import type { BoxCollider, Point2, Point3 } from '@refloor/engine/types';

export const epsilon = 1e-6;
export const distance = (a: Point3, b: Point3): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function rotate(point: Point2, angle: number): Point2 {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return { x: point.x * c + point.z * s, z: -point.x * s + point.z * c };
}

export function worldPoint(point: Point3, origin: Point3, angle: number): Point3 {
  const p = rotate(point, angle);
  return { x: p.x + origin.x, y: point.y + origin.y, z: p.z + origin.z };
}

export function contains(rect: Footprint, point: Point2, inset = 0): boolean {
  return (
    point.x >= rect.x + inset - epsilon &&
    point.z >= rect.z + inset - epsilon &&
    point.x <= rect.x + rect.width - inset + epsilon &&
    point.z <= rect.z + rect.depth - inset + epsilon
  );
}

export function rectPolygon(rect: Footprint): Point2[] {
  return [
    { x: rect.x, z: rect.z },
    { x: rect.x + rect.width, z: rect.z },
    { x: rect.x + rect.width, z: rect.z + rect.depth },
    { x: rect.x, z: rect.z + rect.depth },
  ];
}

export function boxPolygon(box: BoxCollider): Point2[] {
  return rectPolygon({
    x: -box.size.x / 2,
    z: -box.size.z / 2,
    width: box.size.x,
    depth: box.size.z,
  }).map((point) => {
    const p = rotate(point, box.rotation);
    return { x: p.x + box.position.x, z: p.z + box.position.z };
  });
}

export function polygonsOverlap(a: Point2[], b: Point2[]): boolean {
  for (const polygon of [a, b])
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i],
        q = polygon[(i + 1) % polygon.length];
      if (!p || !q) continue;
      const axis = { x: -(q.z - p.z), z: q.x - p.x };
      const pa = a.map((v) => v.x * axis.x + v.z * axis.z),
        pb = b.map((v) => v.x * axis.x + v.z * axis.z);
      if (
        Math.max(...pa) <= Math.min(...pb) + epsilon ||
        Math.max(...pb) <= Math.min(...pa) + epsilon
      )
        return false;
    }
  return true;
}

export function boxesOverlap(a: BoxCollider, b: BoxCollider): boolean {
  if (
    a.position.y + a.size.y / 2 <= b.position.y - b.size.y / 2 + epsilon ||
    b.position.y + b.size.y / 2 <= a.position.y - a.size.y / 2 + epsilon
  )
    return false;
  return polygonsOverlap(boxPolygon(a), boxPolygon(b));
}

export function distanceToBox(point: Point2, box: BoxCollider): number {
  const local = rotate({ x: point.x - box.position.x, z: point.z - box.position.z }, -box.rotation);
  return Math.hypot(
    Math.max(Math.abs(local.x) - box.size.x / 2, 0),
    Math.max(Math.abs(local.z) - box.size.z / 2, 0),
  );
}

export function quarterTurn(angle: number): number | null {
  const turns = Math.round(angle / (Math.PI / 2));
  return Math.abs(angle - (turns * Math.PI) / 2) < epsilon ? ((turns % 4) + 4) % 4 : null;
}

export function uniqueSorted(values: number[]): number[] {
  const result: number[] = [];
  for (const value of [...values].sort((a, b) => a - b)) {
    const previous = result.at(-1);
    if (previous === undefined || value - previous > epsilon) result.push(value);
  }
  return result;
}
