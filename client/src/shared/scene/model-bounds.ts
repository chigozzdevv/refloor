import { Box3, Mesh } from 'three';
import type { Object3D } from 'three';

export function visibleMeshBounds(model: Object3D) {
  const bounds = new Box3();
  model.updateMatrixWorld(true);
  model.traverseVisible((child) => {
    if (!(child instanceof Mesh)) return;
    child.geometry.computeBoundingBox();
    if (child.geometry.boundingBox)
      bounds.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld));
  });
  return bounds;
}
