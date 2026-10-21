import { describe, expect, it } from 'vitest';
import { fingerprintBuilding } from '@refloor/scene';
import { compileBuilding } from '@refloor/engine';
import { useProject } from '@/shared/scene/scene-store';
import { createHouse } from '@refloor/catalogue/houses';
import { CharacterWorld } from '@/shared/navigation/physics-world';
import { physicsSession } from '@/shared/navigation/physics-session';
import { entryPose } from '@/shared/navigation/entry';
import { selectedContext } from '@/shared/editor/chat-context';

describe('scene and editor state integration', () => {
  it('closes a saved open entrance before showing it and opens only on entry action', () => {
    const previous = useProject.getState(),
      building = createHouse({ id: 'closed-entrance', name: 'Closed entrance', storeys: 1 });
    const entrance = entryPose(compileBuilding(building));
    for (const wall of building.floors[0]!.walls)
      for (const opening of wall.openings)
        if (opening.kind === 'door' && opening.id === entrance.doorId) opening.state.open = true;
    try {
      useProject.getState().loadProject(compileBuilding(building));
      useProject.getState().setSceneReady(true);
      const state = useProject.getState();
      expect(state.compiled.doors.find((door) => door.id === entrance.doorId)?.open).toBe(false);
      expect(state.past.at(-1)?.source).toBe('navigation');
      const count = state.past.length;
      state.setSceneReady(true);
      expect(useProject.getState().past).toHaveLength(count);
      state.enterHome();
      expect(useProject.getState().mode).toBe('walk');
      expect(
        useProject.getState().compiled.doors.find((door) => door.id === entrance.doorId)?.open,
      ).toBe(true);
      state.setMode('entry');
      expect(
        useProject.getState().compiled.doors.find((door) => door.id === entrance.doorId)?.open,
      ).toBe(false);
    } finally {
      useProject.setState(previous, true);
    }
  });

  it('preserves an explicitly open door when a walking view becomes ready', () => {
    const previous = useProject.getState(),
      compiled = compileBuilding(
        createHouse({ id: 'resume-open-door', name: 'Resume open door', storeys: 1 }),
      ),
      entry = entryPose(compiled);
    try {
      useProject.getState().loadProject(compiled);
      useProject.getState().setMode('walk');
      expect(useProject.getState().setDoor(entry.doorId, true)).toBe(true);
      useProject.getState().setSceneReady(true);
      expect(
        useProject.getState().compiled.doors.find((door) => door.id === entry.doorId)?.open,
      ).toBe(true);
      expect(useProject.getState().past.at(-1)?.source).toBe('manual');
    } finally {
      useProject.setState(previous, true);
    }
  });

  it('rejects a blocked door swing without changing its saved state or chat action', () => {
    const previous = useProject.getState();
    const compiled = compileBuilding(
      createHouse({ id: 'door-state', name: 'Door state', storeys: 1 }),
    );
    const entry = entryPose(compiled),
      world = new CharacterWorld(compiled, entry.threshold);
    useProject.getState().loadProject(compiled);
    useProject.setState({ mode: 'walk' });
    physicsSession.current = world;
    try {
      expect(useProject.getState().setDoor(entry.doorId, true)).toBe(false);
      expect(useProject.getState().notice).toContain('Step clear');
      expect(
        useProject.getState().compiled.doors.find((door) => door.id === entry.doorId)?.open,
      ).toBe(false);
      expect(
        selectedContext(useProject.getState().compiled.building, { kind: 'door', id: entry.doorId })
          ?.suggestions,
      ).toEqual(['Open the door']);
      world.teleport(entry.inside);
      expect(useProject.getState().setDoor(entry.doorId, true)).toBe(true);
      expect(
        selectedContext(useProject.getState().compiled.building, { kind: 'door', id: entry.doorId })
          ?.suggestions,
      ).toEqual(['Close the door']);
    } finally {
      physicsSession.current = null;
      world.dispose();
      useProject.setState(previous);
    }
  });
  it('preserves a clarification when the chat closes and clears context when another house opens', () => {
    const state = useProject.getState(),
      target = { kind: 'object' as const, id: state.compiled.building.objects[0]!.id },
      id = crypto.randomUUID();
    expect(state.beginChat(id)).toBe(true);
    state.select(target);
    state.select(null);
    state.finishChat(id, {
      id,
      at: new Date().toISOString(),
      target,
      message: 'Move it',
      reply: 'Which direction?',
      status: 'clarification',
      baseRevision: state.compiled.building.revision,
      revisionId: null,
    });
    state.select(target);
    expect(useProject.getState().memory.turns.at(-1)?.reply).toBe('Which direction?');
    expect(useProject.getState().chatPending).toBeNull();
    state.loadProject(
      compileBuilding(createHouse({ id: 'other-home', name: 'Other home', storeys: 1 })),
    );
    expect(useProject.getState().memory.sceneId).toBe('other-home');
    expect(useProject.getState().memory.turns).toEqual([]);
    state.finishChat(id, {
      id,
      at: new Date().toISOString(),
      target,
      message: 'Stale',
      reply: 'Wrong house',
      status: 'clarification',
      baseRevision: 0,
      revisionId: null,
    });
    expect(useProject.getState().memory.turns).toEqual([]);
  });
  it('applies and reverses real edits through the editor slice', () => {
    const original = useProject.getState().compiled.building;
    const wall = original.floors[0]!.walls[0]!;
    expect(
      useProject.getState().edit([
        {
          type: 'set-wall-material',
          wallId: wall.id,
          material: { ...wall.material, color: '#123456' },
        },
      ]),
    ).toBe(true);
    expect(useProject.getState().past).toHaveLength(1);
    useProject.getState().undo();
    expect(fingerprintBuilding(useProject.getState().compiled.building)).toBe(
      fingerprintBuilding(original),
    );
    expect(useProject.getState().future).toHaveLength(1);
    useProject.getState().redo();
    expect(useProject.getState().compiled.building.floors[0]!.walls[0]!.material.color).toBe(
      '#123456',
    );
  });

  it('clears editor selection and history when opening or creating another house', () => {
    const current = useProject.getState();
    current.select({ kind: 'object', id: current.compiled.building.objects[0]!.id });
    current.loadProject(compileBuilding(current.compiled.building));
    expect(useProject.getState()).toMatchObject({
      selection: null,
      past: [],
      future: [],
      remote: null,
      mode: 'entry',
    });
    useProject
      .getState()
      .select({ kind: 'wall', id: current.compiled.building.floors[0]!.walls[0]!.id });
    useProject.getState().createHome(1);
    expect(useProject.getState()).toMatchObject({
      selection: null,
      past: [],
      future: [],
      remote: null,
      mode: 'entry',
    });
    expect(useProject.getState().compiled.building.floors).toHaveLength(1);
  });
});
