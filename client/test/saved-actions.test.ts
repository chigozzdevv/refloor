import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { finishes } from '@refloor/catalogue';
import { compileBuilding } from '@refloor/engine';
import { applyCommands, fingerprintBuilding, parseBuilding } from '@refloor/scene';
import type { SceneRule, SceneCommand } from '@refloor/scene';
import { createEditMemory } from '@refloor/scene/edit-memory';
import { editDocument, reverseDocument } from '@/shared/editor/document';
import { encodeProject, readProjectFile } from '@/shared/scene/files';

const initial = () => {
  const compiled = compileBuilding(
    createHouse({ id: 'actions-home', name: 'Actions home', storeys: 2 }),
  );
  return { compiled, memory: createEditMemory(compiled.building), past: [], future: [] };
};
const edit = (building: unknown, commands: SceneCommand[]) =>
  applyCommands(building, {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    expectedRevision: parseBuilding(building).revision,
    commands,
  });
const power = (building: ReturnType<typeof parseBuilding>, id: string) =>
  building.objects.find((object) => object.id === id)!.behaviours[0]!.state.powered;

describe('universal saved scene actions', () => {
  it('runs a multi-device door rule atomically, and round-trips through undo, redo and export', () => {
    const state = initial(),
      building = state.compiled.building;
    const lights = building.objects.filter(
      (object) =>
        object.placement === 'exterior' &&
        object.behaviours.some((value) => value.kind === 'light'),
    );
    const unpowered = editDocument(
      state,
      lights.map((light) => ({ type: 'set-light', objectId: light.id, state: { powered: false } })),
    );
    const tv = building.objects.find((object) => object.kind === 'television')!;
    const rule: SceneRule = {
      id: 'welcome',
      label: 'Welcome home',
      enabled: true,
      trigger: { kind: 'door', doorId: 'ground/entrance', open: true },
      conditions: [],
      actions: [
        ...lights.map((light): SceneCommand => ({
          type: 'set-light',
          objectId: light.id,
          state: { powered: true },
        })),
        { type: 'set-television', objectId: tv.id, state: { powered: true, volume: 0.2 } },
      ] as SceneRule['actions'],
    };
    const configured = editDocument(unpowered, [{ type: 'set-rules', rules: [rule] }]);
    expect(lights.every((light) => !power(configured.compiled.building, light.id))).toBe(true);
    const opened = editDocument(configured, [
      { type: 'set-door', doorId: 'ground/entrance', open: true },
    ]);
    expect(lights.every((light) => power(opened.compiled.building, light.id))).toBe(true);
    expect(power(opened.compiled.building, tv.id)).toBe(true);
    expect(opened.past.at(-1)!.revision.commands).toHaveLength(lights.length + 2);
    const undo = reverseDocument(opened, 'undo');
    expect(fingerprintBuilding(undo.compiled.building)).toBe(
      fingerprintBuilding(configured.compiled.building),
    );
    const redo = reverseDocument(undo, 'redo');
    expect(fingerprintBuilding(redo.compiled.building)).toBe(
      fingerprintBuilding(opened.compiled.building),
    );
    const portable = readProjectFile(encodeProject(redo.compiled.building, redo.memory));
    expect(portable.compiled.building.rules).toEqual([rule]);
    expect(portable.memory.transitions.at(-1)!.kind).toBe('redo');
    expect(reverseDocument(configured, 'undo').compiled.building.rules).toBeUndefined();
  });

  it('supports room entry and object clicks with state conditions and material changes', () => {
    const building = initial().compiled.building;
    const tv = building.objects.find((object) => object.kind === 'television')!;
    const chair = building.objects.find((object) => object.kind === 'chair')!;
    const light = building.objects.find((object) => object.kind === 'light' && !object.placement)!;
    const rules: SceneRule[] = [
      {
        id: 'arrival',
        label: 'Room lighting',
        enabled: true,
        trigger: { kind: 'room-enter', roomId: light.roomId },
        conditions: [{ kind: 'power', objectId: tv.id, powered: false }],
        actions: [{ type: 'set-light', objectId: light.id, state: { intensity: 1 } }],
      },
      {
        id: 'chair-finish',
        label: 'Chair finish',
        enabled: true,
        trigger: { kind: 'object-click', objectId: chair.id },
        conditions: [],
        actions: [
          {
            type: 'set-object-material',
            objectId: chair.id,
            slot: 'body',
            material: finishes.olive,
          },
        ],
      },
    ];
    const configured = edit(building, [{ type: 'set-rules', rules }]).building;
    const arrived = edit(configured, [{ type: 'emit-event', event: rules[0]!.trigger }]);
    expect(arrived.revision.commands).toHaveLength(2);
    const tvOn = edit(configured, [
      { type: 'set-television', objectId: tv.id, state: { powered: true } },
    ]).building;
    expect(
      edit(tvOn, [{ type: 'emit-event', event: rules[0]!.trigger }]).revision.commands,
    ).toHaveLength(1);
    const clicked = edit(configured, [{ type: 'emit-event', event: rules[1]!.trigger }]);
    expect(
      clicked.building.objects.find((object) => object.id === chair.id)!.materials.body,
    ).toEqual(finishes.olive);
  });

  it('runs chains once per rule, ignores no-op power changes and bounds cycles', () => {
    const building = initial().compiled.building;
    const tv = building.objects.find((object) => object.kind === 'television')!;
    const light = building.objects.find(
      (object) =>
        object.placement === 'exterior' &&
        object.behaviours.some((value) => value.kind === 'light'),
    )!;
    const rules: SceneRule[] = [
      {
        id: 'tv-lights',
        label: 'TV lights',
        enabled: true,
        trigger: { kind: 'power', objectId: tv.id, powered: true },
        conditions: [],
        actions: [{ type: 'set-light', objectId: light.id, state: { powered: true } }],
      },
      {
        id: 'light-door',
        label: 'Light door',
        enabled: true,
        trigger: { kind: 'power', objectId: light.id, powered: true },
        conditions: [],
        actions: [{ type: 'set-door', doorId: 'ground/entrance', open: true }],
      },
      {
        id: 'door-tv',
        label: 'Door TV',
        enabled: true,
        trigger: { kind: 'door', doorId: 'ground/entrance', open: true },
        conditions: [],
        actions: [
          { type: 'set-television', objectId: tv.id, state: { powered: false } },
          { type: 'set-television', objectId: tv.id, state: { powered: true } },
        ],
      },
    ];
    const configured = edit(building, [{ type: 'set-rules', rules }]).building;
    const fired = edit(configured, [
      { type: 'set-television', objectId: tv.id, state: { powered: true } },
    ]);
    expect(fired.revision.commands).toHaveLength(5);
    expect(
      edit(fired.building, [{ type: 'set-television', objectId: tv.id, state: { powered: true } }])
        .revision.commands,
    ).toHaveLength(1);
    expect(power(fired.building, light.id)).toBe(true);
  });

  it('rejects missing targets, excessive brightness and invalid triggered geometry', () => {
    const state = initial(),
      building = state.compiled.building;
    const light = building.objects.find((object) => object.kind === 'light' && !object.placement)!;
    const rule: SceneRule = {
      id: 'invalid',
      label: 'Invalid action',
      enabled: true,
      trigger: { kind: 'room-enter', roomId: light.roomId },
      conditions: [],
      actions: [{ type: 'set-light', objectId: light.id, state: { intensity: 100 } }],
    };
    expect(() => editDocument(state, [{ type: 'set-rules', rules: [rule] }])).toThrow('200%');
    expect(() =>
      edit(building, [
        {
          type: 'set-rules',
          rules: [{ ...rule, trigger: { kind: 'power', objectId: 'missing', powered: true } }],
        },
      ]),
    ).toThrow();
    const object = building.objects.find((value) => value.kind === 'chair')!;
    const blocked: SceneRule = {
      ...rule,
      actions: [
        {
          type: 'move-object',
          objectId: object.id,
          roomId: object.roomId,
          position: { x: -50, y: 0, z: 0 },
          rotation: 0,
        },
      ],
    };
    const configured = editDocument(state, [{ type: 'set-rules', rules: [blocked] }]);
    expect(() =>
      editDocument(configured, [{ type: 'emit-event', event: blocked.trigger }]),
    ).toThrow();
    expect(
      configured.compiled.building.objects.find((value) => value.id === object.id)!.position,
    ).toEqual(object.position);
    const disabled = editDocument(configured, [
      { type: 'set-rules', rules: [{ ...blocked, enabled: false }] },
    ]);
    expect(
      editDocument(disabled, [
        { type: 'emit-event', event: blocked.trigger },
      ]).compiled.building.objects.find((value) => value.id === object.id)!.position,
    ).toEqual(object.position);
  });

  it('removes dependent rules with an object and restores both through undo', () => {
    const state = initial(),
      object = state.compiled.building.objects.find((value) => value.kind === 'chair')!;
    const rule: SceneRule = {
      id: 'chair-action',
      label: 'Chair colour',
      enabled: true,
      trigger: { kind: 'object-click', objectId: object.id },
      conditions: [],
      actions: [
        {
          type: 'set-object-material',
          objectId: object.id,
          slot: 'body',
          material: finishes.olive,
        },
      ],
    };
    const configured = editDocument(state, [{ type: 'set-rules', rules: [rule] }]);
    const removed = editDocument(configured, [{ type: 'remove-object', objectId: object.id }]);
    expect(removed.compiled.building.rules).toEqual([]);
    expect(fingerprintBuilding(reverseDocument(removed, 'undo').compiled.building)).toBe(
      fingerprintBuilding(configured.compiled.building),
    );
  });
});
