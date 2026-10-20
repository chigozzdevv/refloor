import { InstancedMesh, Mesh } from 'three';
import type { Intersection, Object3D, Raycaster } from 'three';

export function isScenePointer(event: { nativeEvent: { target: EventTarget | null } }): boolean {
  return event.nativeEvent.target instanceof HTMLCanvasElement;
}

export function isVisible(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

export function belongsToDoor(object: Object3D, doorId: string | undefined): boolean {
  if (!doorId) return false;
  for (let current: Object3D | null = object; current; current = current.parent)
    if (current.userData.doorId === doorId) return true;
  return false;
}

export function visibleMeshRaycast(this: Mesh, raycaster: Raycaster, hits: Intersection[]) {
  if (isVisible(this)) Mesh.prototype.raycast.call(this, raycaster, hits);
}

export function visibleInstancedMeshRaycast(
  this: InstancedMesh,
  raycaster: Raycaster,
  hits: Intersection[],
) {
  if (isVisible(this)) InstancedMesh.prototype.raycast.call(this, raycaster, hits);
}

export function visibleGroupRaycast(this: Object3D) {
  return isVisible(this) ? undefined : false;
}
