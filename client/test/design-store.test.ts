import { expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import { createEditMemory } from '@refloor/scene/edit-memory';
import { saveDesign } from '@/shared/editor/design-checkpoints';
import { editDocument } from '@/shared/editor/document';
import { CharacterWorld } from '@/shared/navigation/physics-world';
import { physicsSession } from '@/shared/navigation/physics-session';
import { entryPose } from '@/shared/navigation/entry';
import { useProject } from '@/shared/scene/scene-store';
import { viewSession } from '@/shared/scene/view';
import type { SceneView } from '@/shared/scene/view';

it('switches named designs without reframing the camera and restores the working undo history', () => {
  const compiled = compileBuilding(
      createHouse({ id: 'design-store', name: 'Design store', storeys: 1 }),
    ),
    saved = saveDesign(
      { compiled, memory: createEditMemory(compiled.building), past: [], future: [] },
      'Original',
    ),
    working = editDocument(saved, [
      {
        type: 'set-roof-material',
        roofId: compiled.building.roof.id,
        material: { ...compiled.building.roof.material, color: '#334455' },
      },
    ]),
    entry = entryPose(working.compiled),
    previous = useProject.getState(),
    previousWorld = physicsSession.current,
    previousView = { ...viewSession };
  let world = new CharacterWorld(working.compiled, entry.inside);
  const snapshot: SceneView = {
    version: 1,
    buildingId: compiled.building.id,
    mode: 'walk',
    floorId: entry.floorId,
    lighting: 'evening',
    cutaway: false,
    camera: {
      position: { ...entry.inside, y: entry.inside.y + 1.62 },
      rotation: { x: -0.1, y: 1.2, z: 0 },
      fov: 65,
    },
    player: { floorId: entry.floorId, position: entry.inside },
    target: null,
  };
  try {
    useProject.getState().loadProject(working.compiled, undefined, working.memory);
    useProject.setState({
      mode: 'walk',
      past: working.past,
      future: working.future,
      selection: { kind: 'roof', id: compiled.building.roof.id },
    });
    physicsSession.current = world;
    viewSession.current = snapshot;
    const epoch = useProject.getState().projectEpoch,
      id = saved.memory.designs!.items[0]!.id;
    expect(useProject.getState().viewDesign(id)).toBe(true);
    expect(useProject.getState().compiled.building.roof.material).toEqual(
      compiled.building.roof.material,
    );
    expect(useProject.getState().selection).toBeNull();
    expect(useProject.getState().mode).toBe('walk');
    expect(useProject.getState().projectEpoch).toBe(epoch);
    expect(viewSession.current).toBe(snapshot);
    const viewed = useProject.getState().compiled;
    expect(useProject.getState().returnToWorking()).toBe(false);
    expect(useProject.getState().compiled).toBe(viewed);
    world.dispose();
    world = new CharacterWorld(viewed, entry.inside);
    physicsSession.current = world;
    expect(useProject.getState().returnToWorking()).toBe(true);
    expect(useProject.getState().compiled.building.roof.material.color).toBe('#334455');
    expect(useProject.getState().past).toEqual(working.past);
    expect(useProject.getState().projectEpoch).toBe(epoch);
    expect(viewSession.current).toBe(snapshot);
    const current = useProject.getState().compiled;
    useProject.getState().beginChat('pending-design-request');
    expect(useProject.getState().saveDesign('During request')).toBe(false);
    expect(useProject.getState().compiled).toBe(current);
    expect(useProject.getState().memory.designs!.items).toHaveLength(1);
  } finally {
    useProject.setState(previous, true);
    physicsSession.current = previousWorld;
    Object.assign(viewSession, previousView);
    world.dispose();
  }
});
