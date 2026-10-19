import { describe, expect, it } from 'vitest';
import { Group, PointLight, SpotLight, Vector3 } from 'three';
import { chooseLightGroups, lightGroups } from '@/shared/scene/light-budget';

function litScene() {
  const scene = new Group();
  for (let i = 0; i < 6; i++) {
    const light = new PointLight('#fff1d0', 20);
    light.position.set(i * 2, 2, 2);
    light.userData.lightBudget = {
      id: `pendant-${i}`,
      floorId: i < 3 ? 'ground' : 'first',
      exterior: false,
    };
    scene.add(light);
  }
  for (const side of [-1, 1])
    for (let beam = 0; beam < 2; beam++) {
      const light = new SpotLight('#ffddb0', 42);
      light.position.set(5 + side, 1.8 + beam * 0.4, -0.2);
      light.userData.lightBudget = { id: `wall-${side}`, floorId: 'ground', exterior: true };
      scene.add(light);
    }
  for (const side of [-1, 1]) {
    const light = new SpotLight('#ffe6c4', 100);
    light.position.set(5 + side * 2, 2.5, -0.2);
    light.userData.lightBudget = { id: `flood-${side}`, floorId: 'ground', exterior: true };
    scene.add(light);
  }
  return scene;
}

describe('physical local light budget', () => {
  it('keeps all powered fixtures within the fragment texture budget and both wall beams together', () => {
    const groups = lightGroups(litScene(), new Vector3(5, 1.8, -1));
    const chosen = chooseLightGroups(groups, {
      maxTextures: 16,
      exterior: true,
      floorId: 'ground',
      previous: new Set(),
    });
    expect(
      groups
        .filter((group) => chosen.has(group.id))
        .reduce((sum, group) => sum + group.lights.length, 0),
    ).toBeLessThanOrEqual(4);
    expect([...chosen].every((id) => id.startsWith('wall-') || id.startsWith('flood-'))).toBe(true);
    for (const group of groups.filter((value) => value.id.startsWith('wall-')))
      expect(group.lights).toHaveLength(2);
  });

  it('prioritizes the occupied storey indoors and retains nearby choices across small camera movements', () => {
    const scene = litScene();
    const groups = lightGroups(scene, new Vector3(8, 4.6, 2));
    const chosen = chooseLightGroups(groups, {
      maxTextures: 16,
      exterior: false,
      floorId: 'first',
      previous: new Set(),
    });
    expect(['pendant-3', 'pendant-4', 'pendant-5'].every((id) => chosen.has(id))).toBe(true);
    expect([...chosen].some((id) => id.startsWith('wall-'))).toBe(false);
    const moved = chooseLightGroups(lightGroups(scene, new Vector3(8.02, 4.6, 2.02)), {
      maxTextures: 16,
      exterior: false,
      floorId: 'first',
      previous: chosen,
    });
    expect(moved).toEqual(chosen);
  });

  it('shows a selected or newly powered fixture without taking unrelated indoor slots', () => {
    const groups = lightGroups(litScene(), new Vector3(5, 1.8, -1));
    const baseline = chooseLightGroups(groups, {
      maxTextures: 16,
      exterior: true,
      floorId: 'ground',
      previous: new Set(),
    });
    const selected = chooseLightGroups(groups, {
      maxTextures: 16,
      exterior: true,
      floorId: 'ground',
      previous: baseline,
      selectedId: 'flood-1',
    });
    expect(selected.has('flood-1')).toBe(true);
    const powered = chooseLightGroups(groups, {
      maxTextures: 16,
      exterior: true,
      floorId: 'ground',
      previous: baseline,
      recentlyPowered: new Set(['flood-1']),
    });
    expect(powered.has('flood-1')).toBe(true);
    const indoors = chooseLightGroups(groups, {
      maxTextures: 16,
      exterior: false,
      floorId: 'first',
      previous: powered,
      recentlyPowered: new Set(['flood-1']),
    });
    expect(indoors.has('flood-1')).toBe(false);
    expect(['pendant-3', 'pendant-4', 'pendant-5'].every((id) => indoors.has(id))).toBe(true);
  });

  it('reserves room for PBR textures and respects smaller device budgets', () => {
    const groups = lightGroups(litScene(), new Vector3(5, 1.8, -1));
    for (const maxTextures of [8, 12, 14, 16, 32]) {
      const chosen = chooseLightGroups(groups, {
        maxTextures,
        exterior: true,
        floorId: 'ground',
        previous: new Set(),
      });
      expect(
        groups
          .filter((group) => chosen.has(group.id))
          .reduce((sum, group) => sum + group.lights.length, 0),
      ).toBeLessThanOrEqual(Math.max(0, Math.min(4, maxTextures - 12)));
    }
  });
});
