import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useProject } from '@/shared/scene/scene-store';
import { chooseLightGroups, lightGroups } from '@/shared/scene/light-budget';
import { invalidateShadows } from '@/shared/scene/shadow-updates';

export function LightBudget() {
  const previous = useRef(new Set<string>()),
    present = useRef<Set<string> | null>(null),
    recentlyPowered = useRef(new Map<string, number>());
  useFrame(({ scene, camera, gl, clock }) => {
    const state = useProject.getState(),
      floor = state.compiled.building.floors.find((value) => value.id === state.floorId),
      footprint = floor?.footprint,
      exterior =
        state.mode === 'orbit' ||
        !footprint ||
        camera.position.x < footprint.x ||
        camera.position.x > footprint.x + footprint.width ||
        camera.position.z < footprint.z ||
        camera.position.z > footprint.z + footprint.depth;
    const groups = lightGroups(scene, camera.position),
      now = clock.elapsedTime;
    if (present.current)
      for (const group of groups)
        if (!present.current.has(group.id)) recentlyPowered.current.set(group.id, now + 8);
    for (const [id, until] of recentlyPowered.current)
      if (until < now) recentlyPowered.current.delete(id);
    present.current = new Set(groups.map((group) => group.id));
    const chosen = chooseLightGroups(groups, {
      maxTextures: gl.capabilities.maxTextures,
      exterior,
      floorId: state.floorId,
      previous: previous.current,
      ...(state.selection?.kind === 'object' ? { selectedId: state.selection.id } : {}),
      recentlyPowered: new Set(recentlyPowered.current.keys()),
    });
    let changed = false;
    for (const group of groups)
      for (const light of group.lights) {
        const active = chosen.has(group.id);
        if (light.visible !== active || light.castShadow !== active) changed = true;
        light.visible = active;
        light.castShadow = active;
      }
    if (changed) invalidateShadows();
    previous.current = chosen;
  }, -1);
  return null;
}
