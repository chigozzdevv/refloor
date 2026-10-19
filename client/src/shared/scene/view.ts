import { z } from 'zod';
import type { CompiledBuilding } from '@refloor/engine';
import { isPlayerPositionValid } from '@refloor/engine';
import { PerspectiveCamera } from 'three';
import type { Camera, Vector3 } from 'three';

export const viewKey = 'refloor.scene-view.v1';
const point = z.strictObject({ x: z.number(), y: z.number(), z: z.number() });
export const sceneViewSchema = z.strictObject({
  version: z.literal(1),
  buildingId: z.string(),
  mode: z.enum(['entry', 'orbit', 'walk']),
  floorId: z.string(),
  lighting: z.enum(['day', 'evening']),
  cutaway: z.boolean(),
  camera: z.strictObject({ position: point, rotation: point, fov: z.number().min(30).max(100) }),
  target: point.nullable(),
  player: z.strictObject({ floorId: z.string(), position: point }).nullable(),
});
export type SceneView = z.infer<typeof sceneViewSchema>;

export function validateSceneView(input: unknown, compiled: CompiledBuilding): SceneView | null {
  const parsed = sceneViewSchema.safeParse(input);
  if (!parsed.success) return null;
  const view = parsed.data;
  if (
    view.buildingId !== compiled.building.id ||
    !compiled.building.floors.some((floor) => floor.id === view.floorId) ||
    (view.mode === 'orbit' && !view.target) ||
    (view.mode === 'walk' &&
      (!view.player ||
        view.player.floorId !== view.floorId ||
        !isPlayerPositionValid(compiled, view.player)))
  )
    return null;
  return {
    ...view,
    player: view.player && isPlayerPositionValid(compiled, view.player) ? view.player : null,
  };
}

export function applySceneView(
  view: SceneView,
  camera: Camera,
  orbit?: { target: Vector3; update: () => void } | null,
) {
  camera.position.set(view.camera.position.x, view.camera.position.y, view.camera.position.z);
  camera.rotation.set(
    view.camera.rotation.x,
    view.camera.rotation.y,
    view.camera.rotation.z,
    'YXZ',
  );
  if (camera instanceof PerspectiveCamera) {
    camera.fov = view.camera.fov;
    camera.updateProjectionMatrix();
  }
  if (view.target && orbit) {
    orbit.target.set(view.target.x, view.target.y, view.target.z);
    orbit.update();
  }
  camera.updateMatrixWorld();
}

export const viewSession: {
  current: SceneView | null;
  pending: SceneView | null;
  applied: number;
} = { current: null, pending: null, applied: 0 };
let written = '',
  lastWrite = 0;

export function restoreSceneView(compiled: CompiledBuilding): SceneView | null {
  try {
    const view = validateSceneView(JSON.parse(localStorage.getItem(viewKey) ?? 'null'), compiled);
    viewSession.current = viewSession.pending = view;
    return view;
  } catch {
    return null;
  }
}

export function flushSceneView() {
  if (!viewSession.current) return;
  try {
    const encoded = JSON.stringify(viewSession.current);
    if (encoded !== written) {
      localStorage.setItem(viewKey, encoded);
      written = encoded;
    }
  } catch {
    /* View recovery is optional when browser storage is unavailable. */
  }
}

export function rememberSceneView(view: SceneView, now: number) {
  viewSession.current = view;
  if (now - lastWrite >= 500) {
    flushSceneView();
    lastWrite = now;
  }
}

export function requestSceneView(compiled: CompiledBuilding) {
  viewSession.pending = validateSceneView(viewSession.current, compiled);
  return viewSession.pending;
}

export function takeSceneView(compiled: CompiledBuilding) {
  const view = validateSceneView(viewSession.pending, compiled);
  viewSession.pending = null;
  if (view) viewSession.applied++;
  return view;
}

export function clearSceneView() {
  viewSession.current = viewSession.pending = null;
  written = '';
  lastWrite = 0;
  try {
    localStorage.removeItem(viewKey);
  } catch {
    /* A replacement house starts at its entrance without a saved view. */
  }
}
