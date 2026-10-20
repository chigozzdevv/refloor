import { Vector3 } from 'three';
import type { Object3D, Light } from 'three';

export type BudgetedLight = Light & { distance?: number };
export type LightGroup = {
  id: string;
  exterior: boolean;
  floorId: string;
  lights: BudgetedLight[];
  distance: number;
};

export function lightGroups(scene: Object3D, position: Vector3) {
  const groups = new Map<string, LightGroup>();
  const world = new Vector3();
  scene.traverse((object) => {
    const light = object as BudgetedLight;
    const metadata = light.userData.lightBudget;
    if (!light.isLight || !metadata) return;
    const distance = light.getWorldPosition(world).distanceTo(position);
    const group = groups.get(metadata.id);
    if (group) {
      group.lights.push(light);
      group.distance = Math.min(group.distance, distance);
    } else
      groups.set(metadata.id, {
        id: metadata.id,
        exterior: metadata.exterior,
        floorId: metadata.floorId,
        lights: [light],
        distance,
      });
  });
  return [...groups.values()];
}

export function chooseShadowGroups(
  groups: LightGroup[],
  options: {
    maxTextures: number;
    exterior: boolean;
    floorId: string;
    previous: Set<string>;
    selectedId?: string;
    recentlyPowered?: Set<string>;
  },
) {
  // Reserve texture units for PBR maps, transmission, the environment and sunlight shadows.
  const budget = Math.max(0, Math.min(4, options.maxTextures - 12));
  const score = (group: LightGroup) =>
    (group.id === options.selectedId ? -2000 : 0) +
    (options.recentlyPowered?.has(group.id) ? -50 : 0) +
    (group.exterior === options.exterior ? 0 : 1000) +
    (!options.exterior && group.floorId !== options.floorId ? 100 : 0) +
    group.distance * (options.previous.has(group.id) ? 0.8 : 1);
  const ordered = [...groups].sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id));
  let remaining = budget;
  const chosen = new Set<string>();
  for (const group of ordered)
    if (group.lights.length <= remaining) {
      chosen.add(group.id);
      remaining -= group.lights.length;
    }
  return chosen;
}

export function applyShadowBudget(groups: LightGroup[], chosen: Set<string>) {
  let changed = false;
  for (const group of groups)
    for (const light of group.lights) {
      const shadow = chosen.has(group.id);
      if (light.castShadow !== shadow) changed = true;
      light.visible = true;
      light.castShadow = shadow;
    }
  return changed;
}
