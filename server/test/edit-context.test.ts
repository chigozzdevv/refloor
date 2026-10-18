import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { applyCommands, undoRevision } from '@refloor/scene';
import type { Building, SceneCommand } from '@refloor/scene';
import {
  createEditMemory,
  recordChatTurn,
  recordTransition,
  scopedEditMemory,
} from '@refloor/scene/edit-memory';
import type { EditMemory } from '@refloor/scene/edit-memory';
import type { LanguageEditRequest } from '@refloor/scene/chat';
import { validatePlacement } from '@refloor/engine';
import { languageCommands, languageContext } from '@refloor/server/shared/planning/language-edit';
import type { LanguagePlan } from '@refloor/server/shared/planning/language-edit';

const initial = () => {
  const building = createHouse({ id: 'context-home', name: 'Context home', storeys: 1 });
  return { building, memory: createEditMemory(building) };
};
const televisionFor = (building: Building) =>
  building.objects.find((item) => item.kind === 'television')!;
const change = (
  state: { building: Building; memory: EditMemory },
  commands: SceneCommand[],
  label = 'Change item',
) => {
  const result = validatePlacement(state.building, {
    id: randomUUID(),
    at: new Date().toISOString(),
    expectedRevision: state.building.revision,
    commands,
  });
  return {
    building: result.building,
    memory: recordTransition(state.memory, result.building, {
      revision: result.revision,
      kind: 'edit',
      label,
      source: 'chat',
    }),
  };
};
const request = (state: { building: Building; memory: EditMemory }): LanguageEditRequest => ({
  requestId: randomUUID(),
  building: state.building,
  context: scopedEditMemory(state.memory, { kind: 'object', id: televisionFor(state.building).id }),
  target: { kind: 'object', id: televisionFor(state.building).id },
  message: 'Put it back in its original position',
  view: { x: 0, z: 1 },
  player: null,
});
const action = (
  id: string,
  changes: Partial<LanguagePlan['actions'][number]>,
): LanguagePlan['actions'][number] => ({
  action: 'restore',
  targetId: id,
  value: 'original.position',
  surface: null,
  vector: null,
  relative: null,
  space: null,
  amount: null,
  enabled: null,
  ...changes,
});
const restore = (input: LanguageEditRequest, value: string) =>
  languageCommands(input, {
    message: 'Restored.',
    automations: [],
    actions: [action(input.target.id, { value })],
  });

describe('recorded item context', () => {
  it('restores the exact original position while retaining later appearance and device settings', () => {
    const original = initial(),
      tv = televisionFor(original.building),
      moved = change(
        original,
        [
          {
            type: 'move-object',
            objectId: tv.id,
            roomId: tv.roomId,
            position: { ...tv.position, x: tv.position.x + 0.1 },
            rotation: tv.rotation,
          },
        ],
        'Move left 10 cm',
      ),
      powered = change(moved, [
        { type: 'set-television', objectId: tv.id, state: { powered: true, volume: 0.6 } },
        {
          type: 'set-object-material',
          objectId: tv.id,
          slot: 'body',
          material: { ...tv.materials.body!, color: '#335577' },
        },
      ]),
      commands = restore(request(powered), 'original.position'),
      restored = change(powered, commands),
      updated = televisionFor(restored.building);
    expect(updated.position).toEqual(tv.position);
    expect(updated.behaviours).toEqual(televisionFor(powered.building).behaviours);
    expect(updated.materials).toEqual(televisionFor(powered.building).materials);
    expect(updated.id).toBe(tv.id);
    expect(original.memory.originals.find((item) => item.id === tv.id)).toEqual(
      restored.memory.originals.find((item) => item.id === tv.id),
    );
  });

  it('distinguishes the previous position from the original and evaluates compound requests in order', () => {
    const original = initial(),
      tv = televisionFor(original.building),
      first = change(original, [
        {
          type: 'move-object',
          objectId: tv.id,
          roomId: tv.roomId,
          position: { ...tv.position, x: tv.position.x + 0.1 },
          rotation: tv.rotation,
        },
      ]),
      second = change(first, [
        {
          type: 'move-object',
          objectId: tv.id,
          roomId: tv.roomId,
          position: { ...tv.position, x: tv.position.x + 0.2 },
          rotation: tv.rotation,
        },
      ]),
      input = request(second);
    expect(
      televisionFor(change(second, restore(input, 'previous.position')).building).position,
    ).toEqual(televisionFor(first.building).position);
    const commands = languageCommands(input, {
      message: 'Moved.',
      automations: [],
      actions: [
        action(tv.id, {}),
        action(tv.id, {
          action: 'move',
          value: null,
          relative: true,
          space: 'world',
          vector: { x: 0.05, y: 0, z: 0 },
        }),
      ],
    });
    expect(televisionFor(change(second, commands).building).position.x).toBeCloseTo(
      tv.position.x + 0.05,
    );
  });

  it('restores all properties before a compound change and tracks undo as a real transition', () => {
    const original = initial(),
      tv = televisionFor(original.building),
      changed = change(original, [
        {
          type: 'move-object',
          objectId: tv.id,
          roomId: tv.roomId,
          position: { ...tv.position, x: tv.position.x + 0.1 },
          rotation: tv.rotation,
        },
        {
          type: 'set-object-material',
          objectId: tv.id,
          slot: 'body',
          material: { ...tv.materials.body!, color: '#334455' },
        },
      ]);
    expect(
      televisionFor(change(changed, restore(request(changed), 'previous.all')).building),
    ).toEqual(tv);
    const undone = undoRevision(changed.building, changed.memory.transitions[0]!.revision, {
        id: randomUUID(),
        at: new Date().toISOString(),
      }),
      state = {
        building: undone.building,
        memory: recordTransition(changed.memory, undone.building, {
          revision: undone.revision,
          kind: 'undo',
          label: 'Undo move',
          source: 'manual',
        }),
      };
    expect(
      televisionFor(change(state, restore(request(state), 'previous.position')).building).position,
    ).toEqual(televisionFor(changed.building).position);
  });

  it('keeps clarification turns scoped to their item and sends recorded property transitions to the model', () => {
    const state = initial(),
      tv = televisionFor(state.building),
      other = state.building.objects.find((item) => item.kind === 'bed')!;
    for (const target of [
      { kind: 'object' as const, id: tv.id },
      { kind: 'object' as const, id: other.id },
    ])
      state.memory = recordChatTurn(state.memory, {
        id: randomUUID(),
        at: new Date().toISOString(),
        target,
        message: 'Move it',
        reply: `Which direction for ${target.id}?`,
        status: 'clarification',
        baseRevision: 0,
        revisionId: null,
      });
    const context = languageContext(request(state)).context!;
    expect(context.turns).toHaveLength(1);
    expect(context.turns[0]?.target.id).toBe(tv.id);
    expect(context.originals).toHaveLength(1);
    expect(context.originals[0]).toMatchObject({
      kind: 'object',
      id: tv.id,
      value: {
        position: tv.position,
        dimensions: tv.dimensions,
        materials: tv.materials,
        behaviours: tv.behaviours,
      },
    });
  });

  it('retains original properties when recent transition history reaches its limit', () => {
    let state = initial();
    const tv = televisionFor(state.building);
    for (let index = 0; index < 55; index++) {
      const result = applyCommands(state.building, {
        id: randomUUID(),
        at: new Date().toISOString(),
        expectedRevision: state.building.revision,
        commands: [
          { type: 'set-television', objectId: tv.id, state: { powered: index % 2 === 0 } },
        ],
      });
      state = {
        building: result.building,
        memory: recordTransition(state.memory, result.building, {
          revision: result.revision,
          kind: 'edit',
          label: 'Power',
          source: 'manual',
        }),
      };
    }
    expect(state.memory.transitions).toHaveLength(50);
    expect(state.memory.originals.find((item) => item.id === tv.id)).toMatchObject({ value: tv });
  });

  it('validates restoration against the current player and rejects missing or cross-house context', () => {
    const original = initial(),
      sofa = original.building.objects.find((item) => item.kind === 'sofa')!,
      removed = change(original, [{ type: 'remove-object', objectId: sofa.id }]),
      input = {
        ...request(removed),
        target: { kind: 'house' as const, id: removed.building.id },
        context: removed.memory,
      },
      commands = languageCommands(input, {
        message: 'Restored sofa.',
        automations: [],
        actions: [action(sofa.id, { value: 'original.all' })],
      });
    expect(() =>
      validatePlacement(
        removed.building,
        {
          id: randomUUID(),
          at: new Date().toISOString(),
          expectedRevision: removed.building.revision,
          commands,
        },
        {},
        { floorId: sofa.floorId, position: sofa.position },
      ),
    ).toThrow();
    expect(removed.building.objects.some((item) => item.id === sofa.id)).toBe(false);
    expect(() =>
      restore({ ...request(original), context: undefined }, 'original.position'),
    ).toThrow('No recorded context');
    expect(() =>
      restore(
        { ...request(original), context: { ...original.memory, sceneId: 'wrong-house' } },
        'original.position',
      ),
    ).toThrow('No recorded context');
  });
});
