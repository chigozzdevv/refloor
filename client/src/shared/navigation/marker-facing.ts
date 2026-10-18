import { Vector3 } from 'three';
import type { Camera } from 'three';
import type { Destination } from '@/shared/navigation/destinations';

export function doorwayBearing(
  destination: Destination,
  camera: Camera,
  width: number,
  height: number,
) {
  const from = new Vector3(
    destination.anchor.x,
    destination.anchor.y,
    destination.anchor.z,
  ).project(camera);
  const to = new Vector3(
    destination.target.position.x,
    destination.anchor.y,
    destination.target.position.z,
  ).project(camera);
  const x = (to.x - from.x) * width,
    y = (to.y - from.y) * height;
  return Math.hypot(x, y) < 1 ? 0 : Math.atan2(-x, y);
}
