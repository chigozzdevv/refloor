import type { Object3D, Light, LightShadow } from 'three';

let revision = 0;
export const shadowRevision = () => revision;
export const invalidateShadows = () => {
  revision++;
};
export function refreshShadows(scene: Object3D) {
  scene.traverse((object) => {
    const light = object as Light & { shadow?: LightShadow };
    if (light.isLight && light.castShadow && light.shadow) light.shadow.needsUpdate = true;
  });
}
