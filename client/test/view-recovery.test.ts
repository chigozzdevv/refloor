import { beforeAll, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import { createEditMemory } from '@refloor/scene/edit-memory';
import {
  applySceneView,
  requestSceneView,
  takeSceneView,
  validateSceneView,
  viewSession,
} from '@/shared/scene/view';
import type { SceneView } from '@/shared/scene/view';
import { initialExperience, useExperience } from '@/shared/scene/experience-store';
import { useProject } from '@/shared/scene/scene-store';
import { CharacterWorld, initializePhysics } from '@/shared/navigation/physics-world';
import { destinations } from '@/shared/navigation/destinations';
import { encodeDraft, decodeDraft } from '@/shared/scene/draft-codec';
import { orbitAspectScale, resizeOrbitCamera } from '@/shared/scene/orbit-framing';
import { exteriorCamera } from '@/shared/scene/exterior';

beforeAll(initializePhysics);
const compiled = compileBuilding(
  createHouse({ id: 'returning-home', name: 'Returning home', storeys: 2 }),
);
const stop = destinations(compiled).find(
  (value) => value.kind === 'room' && value.floorId === 'first',
)!;
const view = (): SceneView => ({
  version: 1,
  buildingId: compiled.building.id,
  mode: 'walk',
  floorId: stop.target.floorId,
  lighting: 'day',
  cutaway: false,
  camera: {
    position: { ...stop.target.position, y: stop.target.position.y + 1.62 },
    rotation: { x: -0.23, y: 1.19, z: 0 },
    fov: 65,
  },
  target: null,
  player: structuredClone(stop.target),
});

describe('returning to a house', () => {
  it('resumes a saved house directly and gives an existing generation priority over it', () => {
    expect(initialExperience(false, false)).toBe('prompt');
    expect(initialExperience(true, false)).toBe('ready');
    expect(initialExperience(false, true)).toBe('prompt');
    expect(initialExperience(true, true)).toBe('prompt');
  });

  it('restores the upstairs player and exact camera after a complete draft round-trip', () => {
    const state = { compiled, past: [], future: [], memory: createEditMemory(compiled.building) },
      restored = decodeDraft(encodeDraft(state)),
      snapshot = validateSceneView(JSON.parse(JSON.stringify(view())), restored.compiled)!,
      camera = new PerspectiveCamera(),
      world = new CharacterWorld(restored.compiled, snapshot.player!.position);
    try {
      expect(snapshot).not.toBeNull();
      applySceneView(snapshot, camera);
      expect(camera.position.toArray()).toEqual(Object.values(snapshot.camera.position));
      expect(camera.rotation.x).toBe(snapshot.camera.rotation.x);
      expect(camera.rotation.y).toBe(snapshot.camera.rotation.y);
      expect(camera.fov).toBe(65);
      for (let i = 0; i < 60; i++) world.step({ x: 0, z: 0 }, 1 / 60);
      expect(world.player.floorId).toBe('first');
      expect(world.feet.x).toBeCloseTo(snapshot.player!.position.x, 4);
      expect(world.feet.z).toBeCloseTo(snapshot.player!.position.z, 4);
      expect(world.feet.y).toBeCloseTo(snapshot.player!.position.y, 1);
    } finally {
      world.dispose();
    }
  });

  it('restores the overview target, angle and zoom through real orbit controls', () => {
    const camera = new PerspectiveCamera(45),
      orbit = new OrbitControls(camera),
      snapshot = {
        ...view(),
        mode: 'orbit' as const,
        camera: { position: { x: 20, y: 15, z: -8 }, rotation: { x: 0, y: 0, z: 0 }, fov: 45 },
        target: { x: 6, y: 2, z: 5 },
      };
    try {
      applySceneView(snapshot, camera, orbit);
      const position = camera.position.clone(),
        direction = camera.getWorldDirection(new Vector3());
      orbit.update();
      expect(camera.position.distanceTo(position)).toBeLessThan(1e-10);
      expect(orbit.target.distanceTo(new Vector3(6, 2, 5))).toBeLessThan(1e-10);
      expect(
        direction.distanceTo(new Vector3(6, 2, 5).sub(camera.position).normalize()),
      ).toBeLessThan(1e-10);
    } finally {
      if (orbit.domElement) orbit.dispose();
    }
  });

  it('rejects a view from another house and unsafe walking positions', () => {
    expect(validateSceneView({ ...view(), buildingId: 'another-house' }, compiled)).toBeNull();
    expect(validateSceneView({ ...view(), floorId: 'missing' }, compiled)).toBeNull();
    expect(
      validateSceneView(
        { ...view(), player: { floorId: 'first', position: { x: -100, y: 3, z: -100 } } },
        compiled,
      ),
    ).toBeNull();
    expect(
      validateSceneView({ ...view(), camera: { ...view().camera, fov: Infinity } }, compiled),
    ).toBeNull();
    expect(validateSceneView({ ...view(), mode: 'orbit', target: null }, compiled)).toBeNull();
  });

  it('preserves overview direction, panned target and zoom ratio across viewport orientation changes', () => {
    const landscape = 1329 / 723,
      portrait = 390 / 844,
      target = new Vector3(8.5, 3.2, 6.1),
      camera = new PerspectiveCamera(45, landscape),
      offset = new Vector3(22, 16, -17),
      wideFit = exteriorCamera(compiled, landscape),
      narrowFit = exteriorCamera(compiled, portrait);
    camera.position.copy(target).add(offset);
    const zoom = offset.length() / wideFit.distance;
    camera.aspect = portrait;
    resizeOrbitCamera(camera, target, landscape);
    const resized = camera.position.clone().sub(target);
    expect(resized.clone().normalize().distanceTo(offset.clone().normalize())).toBeLessThan(1e-10);
    expect(resized.length() / narrowFit.distance).toBeCloseTo(zoom, 10);
    camera.aspect = landscape;
    resizeOrbitCamera(camera, target, portrait);
    expect(camera.position.distanceTo(target.clone().add(offset))).toBeLessThan(1e-10);
    expect(orbitAspectScale(landscape, landscape)).toBe(1);
  });

  it('adapts saved overview framing to the restoring viewport while leaving walking positions exact', () => {
    const landscape = 1329 / 723,
      portrait = 390 / 844,
      snapshot = {
        ...view(),
        mode: 'orbit' as const,
        camera: {
          position: { x: 20, y: 15, z: -8 },
          rotation: { x: 0, y: 0, z: 0 },
          fov: 45,
          aspect: landscape,
        },
        target: { x: 6, y: 2, z: 5 },
      },
      camera = new PerspectiveCamera(45, portrait),
      orbit = new OrbitControls(camera),
      sourceDistance = new Vector3(20, 15, -8).distanceTo(new Vector3(6, 2, 5));
    try {
      const restored = validateSceneView(JSON.parse(JSON.stringify(snapshot)), compiled)!;
      applySceneView(restored, camera, orbit);
      expect(camera.position.distanceTo(orbit.target)).toBeCloseTo(
        sourceDistance * orbitAspectScale(landscape, portrait),
        10,
      );
      applySceneView({ ...view(), camera: { ...view().camera, aspect: landscape } }, camera);
      expect(camera.position.toArray()).toEqual(Object.values(view().camera.position));
    } finally {
      if (orbit.domElement) orbit.dispose();
    }
  });

  it('returns from the new-house prompt without resetting the house or replaying its entrance', () => {
    const previousProject = useProject.getState(),
      previousExperience = useExperience.getState(),
      previousView = { ...viewSession },
      snapshot = view();
    try {
      useProject.setState({ compiled, mode: 'orbit', floorId: 'first' });
      viewSession.current = snapshot;
      useExperience.setState({ stage: 'ready' });
      useExperience.getState().compose();
      expect(useExperience.getState().stage).toBe('prompt');
      expect(useProject.getState().mode).toBe('orbit');
      expect(useProject.getState().compiled).toBe(compiled);
      useExperience.getState().resume();
      expect(useExperience.getState().stage).toBe('ready');
      expect(useProject.getState().mode).toBe('walk');
      expect(viewSession.pending).toEqual(snapshot);
      const applied = viewSession.applied;
      expect(takeSceneView(compiled)).toEqual(snapshot);
      expect(viewSession.applied).toBe(applied + 1);
      expect(takeSceneView(compiled)).toBeNull();
      viewSession.current = { ...snapshot, buildingId: 'previous-house' };
      requestSceneView(compiled);
      expect(viewSession.pending).toBeNull();
    } finally {
      useProject.setState(previousProject, true);
      useExperience.setState(previousExperience, true);
      Object.assign(viewSession, previousView);
    }
  });
});
