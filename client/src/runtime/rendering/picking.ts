import { Mesh } from 'three';
import type { Intersection, Object3D, Raycaster } from 'three';

export function isVisible(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

export function visibleMeshRaycast(this: Mesh, raycaster: Raycaster, hits: Intersection[]) {
  if (isVisible(this)) Mesh.prototype.raycast.call(this, raycaster, hits);
}

export function visibleGroupRaycast(this: Object3D) {
  return isVisible(this) ? undefined : false;
}
