import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import { applyCommands } from '@refloor/scene';
import type { SceneCommand } from '@refloor/scene';
import type { LanguageEditRequest, LanguageEditResponse } from '@refloor/scene/chat';
import { createEditGuards } from '@refloor/scene/edit-guards';
import { useProject } from '@/shared/scene/scene-store';
import { editApi } from '@/shared/refloor/edits';
import { sendLanguageEdit } from '@/shared/editor/use-language-edit';
import { collaborationBridge } from '@/shared/collaboration/bridge';
import { scenePresentation } from '@/shared/scene/presentation';

const initial = useProject.getState();
const originalBridge = collaborationBridge.current;
let responses: ((value: LanguageEditResponse) => void)[];
let requests: LanguageEditRequest[];
beforeEach(() => {
  responses = [];
  requests = [];
  useProject
    .getState()
    .loadProject(
      compileBuilding(
        createHouse({ id: 'concurrent-house', name: 'Concurrent house', storeys: 1 }),
      ),
    );
  useProject.setState({
    remote: {
      id: crypto.randomUUID(),
      buildingId: 'concurrent-house',
      version: 1,
      shared: true,
      savedFingerprint: '0'.repeat(64),
      updatedAt: new Date().toISOString(),
    },
  });
  collaborationBridge.current = {
    assertEdit: () => {},
    enqueue: vi.fn(),
    wait: async () => {},
    flush: async () => true,
    rollback: () => {},
    canSwing: () => true,
  };
  vi.spyOn(editApi, 'interpret').mockImplementation((input) => {
    requests.push(input);
    return new Promise((resolve) => responses.push(resolve));
  });
});
afterEach(() => {
  scenePresentation.fail(new Error('Test ended'));
  collaborationBridge.current = originalBridge;
  useProject.setState(initial, true);
  vi.restoreAllMocks();
});
function incoming(command: (building: ReturnType<typeof createHouse>) => SceneCommand) {
  const building = useProject.getState().compiled.building;
  const result = applyCommands(building, {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    expectedRevision: building.revision,
    commands: [command(building)],
  });
  useProject.setState({ compiled: compileBuilding(result.building) });
}
const roof = (color: string) =>
  incoming((building) => ({
    type: 'set-roof-material',
    roofId: building.roof.id,
    material: { ...building.roof.material, color },
  }));
const wall = (color: string) =>
  incoming((building) => ({
    type: 'set-wall-material',
    wallId: building.floors[0]!.walls[0]!.id,
    material: { ...building.floors[0]!.walls[0]!.material, color },
  }));
function answer(index: number) {
  const input = requests[index]!,
    surface = input.building.floors[0]!.walls[0]!;
  const commands: SceneCommand[] = [
    {
      type: 'set-wall-material',
      wallId: surface.id,
      material: { ...surface.material, color: '#efe1c5' },
    },
  ];
  responses[index]!({
    requestId: input.requestId,
    baseRevision: input.building.revision,
    message: 'Painted the wall cream',
    commands,
    guards: createEditGuards(input.building, commands),
    usage: {
      model: 'test',
      responseId: 'test',
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      durationMs: 0,
    },
  });
}
const send = () =>
  sendLanguageEdit(
    { kind: 'wall', id: useProject.getState().compiled.building.floors[0]!.walls[0]!.id },
    'Paint this wall cream',
  );
async function finish(pending: Promise<boolean>) {
  await vi.waitFor(() =>
    expect(useProject.getState().compiled.building.floors[0]!.walls[0]!.material.color).toBe(
      '#efe1c5',
    ),
  );
  const compiled = useProject.getState().compiled;
  scenePresentation.commit(compiled);
  scenePresentation.frame(compiled);
  expect(await pending).toBe(true);
}
describe('concurrent language edits', () => {
  it('applies the original wall request without another model call after multiple unrelated edits', async () => {
    const pending = send();
    roof('#112233');
    roof('#334455');
    answer(0);
    await finish(pending);
    expect(editApi.interpret).toHaveBeenCalledTimes(1);
    expect(useProject.getState().compiled.building.roof.material.color).toBe('#334455');
    expect(collaborationBridge.current!.enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      undefined,
      expect.objectContaining({ guards: expect.any(Array) }),
    );
  });
  it('replans a relevant change once and still accepts unrelated activity during that retry', async () => {
    const pending = send();
    wall('#112233');
    answer(0);
    await vi.waitFor(() => expect(responses).toHaveLength(2));
    roof('#334455');
    answer(1);
    await finish(pending);
    expect(editApi.interpret).toHaveBeenCalledTimes(2);
    expect(useProject.getState().compiled.building.roof.material.color).toBe('#334455');
  });
  it('preserves a later edit when the same surface changes again during the retry', async () => {
    const pending = send();
    wall('#112233');
    answer(0);
    await vi.waitFor(() => expect(responses).toHaveLength(2));
    wall('#334455');
    answer(1);
    expect(await pending).toBe(false);
    expect(useProject.getState().compiled.building.floors[0]!.walls[0]!.material.color).toBe(
      '#334455',
    );
    expect(collaborationBridge.current!.enqueue).not.toHaveBeenCalled();
  });
});
