import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileBuilding } from '@refloor/engine';
import { createHouse } from '@refloor/catalogue/houses';
import { useProject } from '@/shared/scene/scene-store';
import { editApi } from '@/shared/refloor/edits';
import { changedMechanisms, sendLanguageEdit } from '@/shared/editor/use-language-edit';
import { scenePresentation } from '@/shared/scene/presentation';

const initial = useProject.getState();
const usage = {
  model: 'test',
  responseId: 'response',
  inputTokens: 1,
  outputTokens: 1,
  reasoningTokens: 0,
  durationMs: 0,
};
beforeEach(() => {
  useProject
    .getState()
    .loadProject(
      compileBuilding(createHouse({ id: 'chat-completion', name: 'Chat completion', storeys: 1 })),
    );
});
afterEach(() => {
  scenePresentation.fail(new Error('Test ended.'));
  useProject.setState(initial, true);
  vi.restoreAllMocks();
});

function response(openDoor = false) {
  const state = useProject.getState(),
    wall = state.compiled.building.floors[0]!.walls[0]!;
  vi.spyOn(editApi, 'interpret').mockResolvedValue({
    requestId: 'response',
    baseRevision: state.compiled.building.revision,
    message: 'Changed the wall colour.',
    usage,
    commands: [
      {
        type: 'set-wall-material',
        wallId: wall.id,
        material: { ...wall.material, color: '#d7cfc0' },
      },
      ...(openDoor
        ? [{ type: 'set-door' as const, doorId: state.compiled.doors[0]!.id, open: true }]
        : []),
    ],
  });
  return { kind: 'wall' as const, id: wall.id };
}

describe('chat action completion', () => {
  it('keeps the spinner active after the response and state edit until the scene is drawn', async () => {
    const before = useProject.getState().compiled,
      target = response(true),
      moving = Symbol('fixture'),
      pending = sendLanguageEdit(target, 'Make this wall warm grey.');
    await vi.waitFor(() => expect(useProject.getState().past).toHaveLength(1));
    const state = useProject.getState();
    expect(state.chatPending).not.toBeNull();
    expect(state.memory.turns).toHaveLength(0);
    expect(state.compiled.building.floors[0]!.walls[0]!.material.color).toBe('#d7cfc0');
    expect(await sendLanguageEdit(target, 'Make it blue.')).toBe(false);
    scenePresentation.commit(state.compiled);
    expect(changedMechanisms(before, state.compiled)).toEqual(
      new Set([state.compiled.doors[0]!.id]),
    );
    scenePresentation.motion(moving, state.compiled.building.id, true, state.compiled.doors[0]!.id);
    scenePresentation.frame(state.compiled);
    await Promise.resolve();
    expect(useProject.getState().chatPending).not.toBeNull();
    scenePresentation.release(moving);
    scenePresentation.frame(state.compiled);
    expect(await pending).toBe(true);
    expect(useProject.getState().chatPending).toBeNull();
    expect(useProject.getState().memory.turns.at(-1)?.status).toBe('applied');
    useProject.getState().undo();
    expect(useProject.getState().compiled.building.floors[0]!.walls[0]!.material.color).not.toBe(
      '#d7cfc0',
    );
  });

  it('does not let an unrelated held or blocked door delay a colour change', async () => {
    const owner = Symbol('held door'),
      target = response(),
      pending = sendLanguageEdit(target, 'Make this wall warm grey.');
    await vi.waitFor(() => expect(useProject.getState().past).toHaveLength(1));
    const state = useProject.getState(),
      doorId = state.compiled.doors[0]!.id;
    scenePresentation.motion(owner, state.compiled.building.id, true, doorId);
    scenePresentation.fail(
      new Error('An unrelated door is blocked.'),
      state.compiled.building.id,
      doorId,
    );
    expect(useProject.getState().chatPending).not.toBeNull();
    scenePresentation.commit(state.compiled);
    scenePresentation.frame(state.compiled);
    try {
      expect(await pending).toBe(true);
      expect(useProject.getState().chatPending).toBeNull();
      expect(useProject.getState().memory.turns.at(-1)?.reply).toBe('Changed the wall colour.');
    } finally {
      scenePresentation.release(owner);
    }
  });

  it('finishes clarifications without waiting for a scene change', async () => {
    const target = response();
    vi.mocked(editApi.interpret).mockResolvedValue({
      requestId: 'clarification',
      baseRevision: useProject.getState().compiled.building.revision,
      message: 'Which wall?',
      usage,
      commands: [],
    });
    expect(await sendLanguageEdit(target, 'Change a wall.')).toBe(true);
    expect(useProject.getState().chatPending).toBeNull();
    expect(useProject.getState().memory.turns.at(-1)?.status).toBe('clarification');
  });

  it('does not carry a late completion into a newly opened project', async () => {
    const pending = sendLanguageEdit(response(), 'Make this wall warm grey.');
    await vi.waitFor(() => expect(useProject.getState().past).toHaveLength(1));
    useProject.getState().createHome(2);
    expect(await pending).toBe(false);
    expect(useProject.getState().chatPending).toBeNull();
    expect(useProject.getState().memory.turns).toHaveLength(0);
  });

  it('preserves the actual applied transition when a renderer cannot finish displaying it', async () => {
    const pending = sendLanguageEdit(response(), 'Make this wall warm grey.');
    await vi.waitFor(() => expect(useProject.getState().past).toHaveLength(1));
    scenePresentation.fail(new Error('The change was saved, but its appearance could not load.'));
    expect(await pending).toBe(true);
    const state = useProject.getState(),
      turn = state.memory.turns.at(-1)!;
    expect(state.chatPending).toBeNull();
    expect(turn.status).toBe('applied');
    expect(turn.revisionId).toBe(state.past.at(-1)!.revision.id);
    expect(turn.reply).toMatch(/^Applied the change, but /);
    expect(turn.reply).toContain('could not load');
  });
});
