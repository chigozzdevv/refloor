import {
  invalidateShadows,
  refreshShadows,
  shadowRevision,
  shadowsCurrent,
} from '@/shared/scene/shadow-updates';
import { describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  Group,
  PointLight,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from 'three';
import { belongsToDoor, visibleGroupRaycast, visibleMeshRaycast } from '@/shared/editor/picking';
import { createHouse } from '@refloor/catalogue/houses';
import { getCatalogueEntry } from '@refloor/catalogue';
import { compileBuilding } from '@refloor/engine';
import { sameMaterial } from '@/shared/scene/finish';
import { partGeometry } from '@/shared/scene/geometry';

describe('rendering contracts', () => {
  it('keeps exterior roofing separate from the interior ceiling on flat and gable roofs', () => {
    for (const kind of ['flat', 'gable'] as const) {
      const building = createHouse({ id: `ceiling-${kind}`, name: 'Finished ceiling', storeys: 2 });
      building.roof = { ...building.roof, kind, pitch: kind === 'gable' ? 0.3 : 0 };
      const compiled = compileBuilding(building),
        roof = compiled.parts.find((part) => part.role === 'roof')!,
        geometry = partGeometry(roof);
      expect(new Set(geometry.groups.map((group) => group.materialIndex))).toEqual(new Set([0, 1]));
      for (const group of geometry.groups)
        for (let offset = group.start; offset < group.start + group.count; offset += 3) {
          const vertex = geometry.index!.getX(offset);
          expect(geometry.attributes.normal!.getY(vertex) < -0.5).toBe(group.materialIndex === 1);
        }
      geometry.dispose();
    }
  });
  it('recognizes a portal leaf through nested door handles without ignoring other occluders', () => {
    const door = new Group(),
      handle = new Mesh(new BoxGeometry(), new MeshBasicMaterial()),
      wall = new Group();
    door.userData.doorId = 'bedroom-door';
    door.add(handle);
    expect(belongsToDoor(handle, 'bedroom-door')).toBe(true);
    expect(belongsToDoor(wall, 'bedroom-door')).toBe(false);
    expect(belongsToDoor(wall, undefined)).toBe(false);
    handle.geometry.dispose();
    (handle.material as MeshBasicMaterial).dispose();
  });
  it('preserves original scanned PBR materials after scene parsing and JSON reload', () => {
    const building = createHouse({ id: 'scanned-home', name: 'Scanned home', storeys: 1 });
    const reloaded: typeof building = JSON.parse(JSON.stringify(building));
    const scanned = reloaded.objects.filter((object) => getCatalogueEntry(object.assetId).modelUrl);
    expect(scanned.length).toBeGreaterThan(0);
    for (const object of scanned) {
      const original = getCatalogueEntry(object.assetId).materials.body;
      expect(sameMaterial(object.materials.body, original)).toBe(true);
      expect(sameMaterial({ ...object.materials.body!, color: '#f010ff' }, original)).toBe(false);
    }
  });
  it('selects visible surfaces behind cutaway walls and hidden furniture groups', () => {
    const geometry = new BoxGeometry(2, 2, 0.1),
      material = new MeshBasicMaterial(),
      wall = new Mesh(geometry, material),
      object = new Mesh(geometry, material),
      group = new Group(),
      surface = new Mesh(geometry, material),
      ray = new Raycaster(new Vector3(0, 0, 5), new Vector3(0, 0, -1));
    wall.position.z = 2;
    wall.visible = false;
    wall.raycast = visibleMeshRaycast;
    group.position.z = 1;
    group.visible = false;
    group.raycast = visibleGroupRaycast;
    group.add(object);
    wall.updateMatrixWorld(true);
    group.updateMatrixWorld(true);
    surface.updateMatrixWorld(true);
    expect(
      ray.intersectObjects([wall, group, surface]).every((hit) => hit.object === surface),
    ).toBe(true);
    expect(ray.intersectObjects([wall, group, surface])[0]?.object).toBe(surface);
    group.visible = true;
    expect(ray.intersectObjects([wall, group, surface])[0]?.object).toBe(object);
    wall.visible = true;
    expect(ray.intersectObjects([wall, group, surface])[0]?.object).toBe(wall);
    geometry.dispose();
    material.dispose();
  });
  it('keeps floor tops and white undersides separate without a draw call per triangle', () => {
    const compiled = compileBuilding(
        createHouse({ id: 'floor-home', name: 'Floor home', storeys: 1 }),
      ),
      slab = compiled.parts.find((part) => part.role === 'slab')!,
      geometry = partGeometry(slab);
    expect(geometry.groups.length).toBeLessThanOrEqual(3);
    expect(new Set(geometry.groups.map((group) => group.materialIndex))).toEqual(new Set([0, 1]));
    for (const group of geometry.groups)
      for (let offset = group.start; offset < group.start + group.count; offset += 3) {
        const vertex = geometry.index!.getX(offset);
        expect(geometry.attributes.normal!.getY(vertex) > 0.5).toBe(group.materialIndex === 0);
      }
    geometry.dispose();
  });
  it('maps exterior cladding to only the outward face with continuous metre UVs', () => {
    const building = createHouse({ id: 'facade-home', name: 'Facade home', storeys: 1 }),
      compiled = compileBuilding(building);
    const parts = compiled.parts.filter((part) => part.role === 'wall' && part.exterior);
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      const geometry = partGeometry(part);
      expect(geometry.groups.length).toBeLessThanOrEqual(3);
      expect(new Set(geometry.groups.map((group) => group.materialIndex))).toEqual(new Set([0, 1]));
      for (const group of geometry.groups)
        for (let offset = group.start; offset < group.start + group.count; offset += 3) {
          const vertex = geometry.index!.getX(offset);
          expect(geometry.attributes.normal!.getZ(vertex) * part.exterior!.side > 0.5).toBe(
            group.materialIndex === 1,
          );
        }
      geometry.dispose();
    }
    expect(compiled.colliders.filter((collider) => collider.role === 'wall')).toHaveLength(
      compiled.parts.filter((part) => part.role === 'wall').length,
    );
  });
  it('invalidates cached light shadows without a wall-clock expiry', () => {
    const scene = new Group(),
      point = new PointLight(),
      sun = new DirectionalLight();
    point.castShadow = sun.castShadow = true;
    point.shadow.autoUpdate = false;
    point.shadow.needsUpdate = sun.shadow.needsUpdate = false;
    scene.add(point, sun);
    const previous = shadowRevision();
    invalidateShadows();
    expect(shadowsCurrent()).toBe(false);
    expect(shadowRevision()).toBeGreaterThan(previous);
    refreshShadows(scene);
    expect(shadowsCurrent()).toBe(true);
    expect(point.shadow.needsUpdate).toBe(true);
    expect(sun.shadow.needsUpdate).toBe(true);
    expect(point.shadow.autoUpdate).toBe(false);
    point.dispose();
    sun.dispose();
  });
});
