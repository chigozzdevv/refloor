import type { SceneCommand, SceneObject } from '@refloor/scene';
import { Mesh } from 'three';
import type { Intersection } from 'three';
import { isVisible } from '@/shared/editor/picking';

export type FixtureCapability = 'cooker' | 'water' | 'openable';

export function fixtureToggle(
  object: SceneObject,
  capability: FixtureCapability,
  burner?: number,
): SceneCommand {
  if (capability === 'openable') {
    const state = object.behaviours.find((value) => value.kind === 'openable')?.state;
    if (!state) throw new Error('This item has no opening mechanism.');
    return { type: 'set-openable', objectId: object.id, state: { open: !state.open } };
  }
  if (capability === 'water') {
    const state = object.behaviours.find((value) => value.kind === 'water')?.state;
    if (!state) throw new Error('This item has no water supply.');
    return state.powered && state.flow > 0
      ? { type: 'set-water', objectId: object.id, state: { powered: false } }
      : { type: 'start-water', objectId: object.id };
  }
  const state = object.behaviours.find((value) => value.kind === 'cooker')?.state;
  if (!state) throw new Error('This item has no cooker.');
  if (burner === undefined)
    return state.powered && state.heat > 0
      ? { type: 'set-cooker', objectId: object.id, state: { powered: false } }
      : { type: 'ignite-cooker', objectId: object.id };
  if (!Number.isInteger(burner) || burner < 0 || burner > 3)
    throw new Error('That burner does not exist.');
  return {
    type: 'set-cooker-burner',
    objectId: object.id,
    burner,
    enabled: !(state.powered && state.heat > 0 && state.burners[burner]),
  };
}

export function fixtureProgress(current: number, target: number, delta: number) {
  if (Math.abs(current - target) < 0.0005) return target;
  return target + (current - target) * Math.exp(-12 * Math.min(0.1, Math.max(0, delta)));
}

export function fixtureOccludes(hit: Intersection, distance: number) {
  if (
    !isVisible(hit.object) ||
    hit.object.userData.navigationMarker ||
    hit.distance >= distance - 0.06
  )
    return false;
  if (hit.object instanceof Mesh) {
    const materials = Array.isArray(hit.object.material)
      ? hit.object.material
      : [hit.object.material];
    if (materials.every((material) => material.transparent && material.opacity <= 0.25))
      return false;
  }
  return true;
}

export class FixtureRaycastBudget {
  private frame = -1;
  private used = 0;
  acquire(frame: number) {
    if (this.frame !== frame) {
      this.frame = frame;
      this.used = 0;
    }
    return this.used++ < 2;
  }
}
