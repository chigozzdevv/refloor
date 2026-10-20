import type { PerspectiveCamera } from 'three';

export function orbitAspectScale(previous: number, next: number, verticalFov = 45) {
  if (!Number.isFinite(previous) || !Number.isFinite(next) || previous <= 0 || next <= 0) return 1;
  const vertical = (verticalFov * Math.PI) / 360,
    limiting = (aspect: number) => Math.min(vertical, Math.atan(Math.tan(vertical) * aspect));
  return Math.sin(limiting(previous)) / Math.sin(limiting(next));
}

export function resizeOrbitCamera(
  camera: PerspectiveCamera,
  target: { x: number; y: number; z: number },
  previousAspect: number,
) {
  const scale = orbitAspectScale(previousAspect, camera.aspect, camera.fov);
  camera.position.set(
    target.x + (camera.position.x - target.x) * scale,
    target.y + (camera.position.y - target.y) * scale,
    target.z + (camera.position.z - target.z) * scale,
  );
}
