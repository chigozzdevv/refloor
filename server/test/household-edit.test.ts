import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assetFromCatalogue,
  catalogueBehaviourUpgrades,
  getCatalogueEntry,
} from '@refloor/catalogue';
import { createHouse } from '@refloor/catalogue/houses';
import { applyCommands, undoRevision } from '@refloor/scene';
import type { Building, SceneCommand } from '@refloor/scene';
import { createEditMemory, recordTransition } from '@refloor/scene/edit-memory';
import type { LanguageEditRequest } from '@refloor/scene/chat';
import {
  languageCommands,
  languageContext,
  languagePlanSchema,
} from '@refloor/server/shared/planning/language-edit';
import type { LanguagePlan } from '@refloor/server/shared/planning/language-edit';
import { zodTextFormat } from 'openai/helpers/zod';

const initial = () => {
  const building = createHouse({ id: 'household-chat', name: 'Household chat', storeys: 1 });
  return { building, memory: createEditMemory(building) };
};
const fixture = (building: Building, assetId = 'catalogue/kitchen-counter') =>
  building.objects.find((item) => item.assetId === assetId)!;
const action = (
  targetId: string,
  changes: Partial<LanguagePlan['actions'][number]>,
): LanguagePlan['actions'][number] => ({
  action: 'power',
  targetId,
  targetCapability: null,
  surface: null,
  vector: null,
  relative: null,
  space: null,
  amount: null,
  enabled: null,
  value: null,
  ...changes,
});
const request = (state: ReturnType<typeof initial>): LanguageEditRequest => ({
  requestId: randomUUID(),
  building: state.building,
  context: state.memory,
  target: { kind: 'house', id: state.building.id },
  message: 'Change the household fixtures.',
  view: { x: 0, z: 1 },
  player: null,
});
const change = (state: ReturnType<typeof initial>, commands: SceneCommand[]) => {
  const result = applyCommands(state.building, {
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
      label: 'Fixture change',
      source: 'chat',
    }),
    revision: result.revision,
  };
};
const withFixture = (assetId: string) => {
  const state = initial();
  if (fixture(state.building, assetId)) return state;
  const kitchen = fixture(state.building),
    room = state.building.floors
      .find((floor) => floor.id === kitchen.floorId)!
      .rooms.find((item) => item.id === kitchen.roomId)!;
  return change(state, [
    {
      type: 'add-object',
      object: {
        ...assetFromCatalogue(assetId),
        id: randomUUID(),
        floorId: kitchen.floorId,
        roomId: kitchen.roomId,
        position: {
          x: room.footprint.x + room.footprint.width / 2,
          y: 0,
          z: room.footprint.z + room.footprint.depth / 2,
        },
        rotation: 0,
      },
    },
  ]);
};
const plan = (actions: LanguagePlan['actions']): LanguagePlan => ({
  message: 'Changed the fixtures.',
  actions,
  automations: [],
});
const cookerFor = (building: Building) =>
  fixture(building).behaviours.find((item) => item.kind === 'cooker')!.state;
const waterFor = (building: Building) =>
  fixture(building).behaviours.find((item) => item.kind === 'water')!.state;

describe('capability-based household language changes', () => {
  it('exposes device states, allowed operations and bounds without assuming capabilities from labels', () => {
    const state = initial(),
      context = languageContext(request(state));
    const kitchen = context.objects.find((item) => item.id === fixture(state.building).id)!;
    expect(kitchen.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'cooker',
          component: 'cooker burners',
          names: expect.arrayContaining(['stove', 'hob', 'burners']),
          heat: { min: 0, max: 1 },
          burners: ['front-left', 'front-right', 'back-left', 'back-right'],
        }),
        expect.objectContaining({
          kind: 'water',
          component: 'basin tap',
          names: expect.arrayContaining(['tap', 'faucet', 'sink']),
          openMeans: 'power',
          flow: { min: 0, max: 1 },
          temperature: { min: 10, max: 60, unit: 'Celsius' },
        }),
        expect.objectContaining({
          kind: 'openable',
          component: 'oven door',
          actions: ['open', 'restore'],
        }),
      ]),
    );
    expect(
      context.catalogue.find((item) => item.assetId === 'catalogue/kitchen-counter')?.behaviours,
    ).toHaveLength(3);
    expect(() => zodTextFormat(languagePlanSchema, 'house_edit')).not.toThrow();
  });

  it('identifies actual taps and showers separately from storage fronts', () => {
    const context = languageContext(request(initial()));
    expect(
      context.catalogue.find((item) => item.assetId === 'catalogue/shower')?.capabilities,
    ).toEqual([
      expect.objectContaining({
        kind: 'water',
        component: 'shower',
        names: ['shower', 'showerhead', 'water'],
      }),
    ]);
    expect(
      context.catalogue.find((item) => item.assetId === 'catalogue/vanity')?.capabilities,
    ).toEqual([
      expect.objectContaining({ kind: 'water', component: 'basin tap' }),
      expect.objectContaining({ kind: 'openable', component: 'drawers' }),
    ]);
  });

  it.each(['catalogue/kitchen-counter', 'catalogue/vanity'])(
    'opens and closes the tap on %s without opening its other fittings',
    (assetId) => {
      const state = withFixture(assetId),
        object = fixture(state.building, assetId),
        input = {
          ...request(state),
          target: { kind: 'object' as const, id: object.id },
          message: 'Open the tap.',
        };
      const commands = languageCommands(
        input,
        plan([action(object.id, { action: 'open', targetCapability: 'water', enabled: true })]),
      );
      expect(commands).toEqual([{ type: 'start-water', objectId: object.id }]);
      const started = change(state, commands),
        running = started.building.objects.find((item) => item.id === object.id)!;
      expect(running.behaviours).toContainEqual(
        expect.objectContaining({
          kind: 'water',
          state: expect.objectContaining({ powered: true }),
        }),
      );
      expect(running.behaviours.filter((item) => item.kind !== 'water')).toEqual(
        object.behaviours.filter((item) => item.kind !== 'water'),
      );
      const closed = languageCommands(
        { ...input, building: started.building, message: 'Close the tap.' },
        plan([action(object.id, { action: 'open', targetCapability: 'water', enabled: false })]),
      );
      expect(closed).toEqual([
        { type: 'set-water', objectId: object.id, state: { powered: false } },
      ]);
      expect(
        undoRevision(started.building, started.revision, {
          id: randomUUID(),
          at: new Date().toISOString(),
        }).building.objects,
      ).toEqual(state.building.objects);
    },
  );

  it('opens a shower as water without fabricating a door capability', () => {
    const state = withFixture('catalogue/shower'),
      shower = fixture(state.building, 'catalogue/shower');
    expect(
      languageCommands(
        request(state),
        plan([action(shower.id, { action: 'open', enabled: true })]),
      ),
    ).toEqual([{ type: 'start-water', objectId: shower.id }]);
    const fridge = fixture(state.building, 'catalogue/fridge');
    expect(() =>
      languageCommands(
        request(state),
        plan([action(fridge.id, { action: 'open', targetCapability: 'water', enabled: true })]),
      ),
    ).toThrow('does not support');
  });

  it('controls cooker and tap independently and rejects ambiguous compound power', () => {
    const state = initial(),
      id = fixture(state.building).id;
    expect(() => languageCommands(request(state), plan([action(id, { enabled: true })]))).toThrow(
      'Choose which device',
    );
    const commands = languageCommands(
      request(state),
      plan([
        action(id, { enabled: true, targetCapability: 'cooker' }),
        action(id, { action: 'cooker-heat', amount: 0.75 }),
        action(id, { enabled: true, targetCapability: 'water' }),
        action(id, { action: 'water-flow', amount: 0.35 }),
        action(id, { action: 'water-temperature', amount: 34 }),
      ]),
    );
    const changed = change(state, commands);
    expect(cookerFor(changed.building)).toMatchObject({ powered: true, heat: 0.75 });
    expect(waterFor(changed.building)).toEqual({ powered: true, flow: 0.35, temperature: 34 });
    const off = change(
      changed,
      languageCommands(
        request(changed),
        plan([action(id, { targetCapability: 'cooker', enabled: false })]),
      ),
    );
    expect(cookerFor(off.building)).toMatchObject({ powered: false, heat: 0.75 });
    expect(waterFor(off.building)).toEqual(waterFor(changed.building));
    expect(
      undoRevision(changed.building, changed.revision, {
        id: randomUUID(),
        at: new Date().toISOString(),
      }).building.objects,
    ).toEqual(state.building.objects);
  });

  it('lights one named burner and preserves the other mask and water state', () => {
    const state = initial(),
      id = fixture(state.building).id;
    const changed = change(
      state,
      languageCommands(
        request(state),
        plan([
          action(id, { action: 'cooker-burner', value: 'back-right', enabled: true }),
          action(id, { action: 'cooker-burner', value: 'front-left', enabled: false }),
        ]),
      ),
    );
    expect(cookerFor(changed.building)).toMatchObject({
      powered: true,
      burners: [false, false, false, true],
    });
    expect(waterFor(changed.building)).toEqual(waterFor(state.building));
    const off = change(
      changed,
      languageCommands(
        request(changed),
        plan([action(id, { action: 'cooker-burner', value: 'all', enabled: false })]),
      ),
    );
    expect(cookerFor(off.building)).toMatchObject({
      powered: false,
      burners: [false, false, false, false],
    });
  });

  it('opens appliance doors and refuses unsupported or mismatched actions atomically', () => {
    const state = initial(),
      fridge = fixture(state.building, 'catalogue/fridge');
    const commands = languageCommands(
      request(state),
      plan([action(fridge.id, { action: 'open', enabled: true, targetCapability: 'openable' })]),
    );
    expect(
      change(state, commands).building.objects.find((item) => item.id === fridge.id)?.behaviours,
    ).toContainEqual({ kind: 'openable', state: { open: true } });
    expect(() =>
      languageCommands(
        request(state),
        plan([action(fridge.id, { enabled: true, targetCapability: 'water' })]),
      ),
    ).toThrow('does not support');
    const id = fixture(state.building).id;
    expect(() =>
      languageCommands(
        request(state),
        plan([action(id, { action: 'cooker-heat', amount: 0.5, targetCapability: 'water' })]),
      ),
    ).toThrow('does not match');
    expect(() =>
      languageCommands(
        request(state),
        plan([action(id, { action: 'water-temperature', amount: 100 })]),
      ),
    ).toThrow();
    expect(waterFor(state.building).powered).toBe(false);
  });

  it('restores original and previous properties without resetting unrelated fixture settings', () => {
    const state = initial(),
      id = fixture(state.building).id;
    const first = change(state, [
      { type: 'set-cooker', objectId: id, state: { powered: true, heat: 0.8 } },
      { type: 'set-water', objectId: id, state: { powered: true, flow: 0.75, temperature: 40 } },
      { type: 'set-openable', objectId: id, state: { open: true } },
    ]);
    const second = change(first, [
      { type: 'set-cooker', objectId: id, state: { heat: 0.4 } },
      { type: 'set-water', objectId: id, state: { flow: 0.3 } },
    ]);
    const restored = change(
      second,
      languageCommands(
        request(second),
        plan([
          action(id, { action: 'restore', value: 'previous.heat' }),
          action(id, { action: 'restore', value: 'original.flow' }),
          action(id, { action: 'restore', value: 'original.open' }),
          action(id, { action: 'restore', value: 'original.power', targetCapability: 'water' }),
        ]),
      ),
    );
    expect(cookerFor(restored.building)).toMatchObject({ powered: true, heat: 0.8 });
    expect(waterFor(restored.building)).toMatchObject({
      powered: false,
      flow: waterFor(state.building).flow,
      temperature: 40,
    });
    expect(
      fixture(restored.building).behaviours.find((item) => item.kind === 'openable')?.state.open,
    ).toBe(false);
    expect(() =>
      languageCommands(
        request(second),
        plan([action(id, { action: 'restore', value: 'original.power' })]),
      ),
    ).toThrow('Choose which device');
  });

  it('retains optional functionality when restoring a legacy original and keeps that recorded baseline intact', () => {
    const state = initial(),
      originalKitchen = fixture(state.building);
    originalKitchen.behaviours = [];
    state.memory = createEditMemory(state.building);
    const recordedOriginal = structuredClone(state.memory.originals),
      migrated = change(state, catalogueBehaviourUpgrades(state.building)),
      id = fixture(migrated.building).id;
    const changed = change(migrated, [
      { type: 'set-cooker', objectId: id, state: { powered: true, heat: 0.9 } },
      { type: 'set-water', objectId: id, state: { powered: true, flow: 0.8, temperature: 42 } },
    ]);
    const baseline = change(
      changed,
      languageCommands(
        request(changed),
        plan([action(id, { action: 'restore', value: 'original.all' })]),
      ),
    );
    expect(fixture(baseline.building).behaviours).toEqual(
      getCatalogueEntry(originalKitchen.assetId).behaviours,
    );
    expect(baseline.memory.originals).toEqual(recordedOriginal);
    expect(
      undoRevision(baseline.building, baseline.revision, {
        id: randomUUID(),
        at: new Date().toISOString(),
      }).building.objects,
    ).toEqual(changed.building.objects);
    expect(() =>
      languageCommands(
        request(migrated),
        plan([action(id, { action: 'restore', value: 'previous.flow' })]),
      ),
    ).toThrow('No earlier recorded');
  });

  it('ignites against current burner settings after a complete shutdown', () => {
    const state = initial(),
      id = fixture(state.building).id;
    const off = change(state, [
      {
        type: 'set-cooker',
        objectId: id,
        state: { powered: false, heat: 0, burners: [false, false, false, false] },
      },
    ]);
    const on = change(
      off,
      languageCommands(
        request(off),
        plan([action(id, { enabled: true, targetCapability: 'cooker' })]),
      ),
    );
    expect(cookerFor(on.building)).toEqual({
      powered: true,
      heat: 0.6,
      burners: [true, false, false, false],
    });
    const configured = change(
      state,
      languageCommands(request(state), {
        message: 'Saved ignition.',
        actions: [],
        automations: [
          {
            operation: 'save',
            id: null,
            label: 'Ignite cooker',
            enabled: true,
            trigger: { kind: 'object-click', objectId: id },
            conditions: [],
            actions: [action(id, { enabled: true, targetCapability: 'cooker' })],
          },
        ],
      }),
    );
    const updated = change(configured, [
      {
        type: 'set-cooker',
        objectId: id,
        state: { powered: false, heat: 0.8, burners: [false, false, false, true] },
      },
    ]);
    const fired = change(updated, [
      { type: 'emit-event', event: { kind: 'object-click', objectId: id } },
    ]);
    expect(cookerFor(fired.building)).toEqual({
      powered: true,
      heat: 0.8,
      burners: [false, false, false, true],
    });
  });

  it('starts water at a useful flow after zero and resolves saved starts against current settings', () => {
    const state = initial(),
      id = fixture(state.building).id;
    const stopped = change(state, [
      { type: 'set-water', objectId: id, state: { powered: false, flow: 0, temperature: 34 } },
    ]);
    const commands = languageCommands(
      request(stopped),
      plan([action(id, { enabled: true, targetCapability: 'water' })]),
    );
    expect(commands).toEqual([{ type: 'start-water', objectId: id }]);
    const running = change(stopped, commands);
    expect(waterFor(running.building)).toEqual({ powered: true, flow: 0.55, temperature: 34 });
    const configured = change(
      stopped,
      languageCommands(request(stopped), {
        message: 'Saved tap start.',
        actions: [],
        automations: [
          {
            operation: 'save',
            id: null,
            label: 'Run tap',
            enabled: true,
            trigger: { kind: 'object-click', objectId: id },
            conditions: [],
            actions: [action(id, { enabled: true, targetCapability: 'water' })],
          },
        ],
      }),
    );
    expect(configured.building.rules![0]!.actions).toEqual([{ type: 'start-water', objectId: id }]);
    const updated = change(configured, [
      { type: 'set-water', objectId: id, state: { powered: false, flow: 0.8, temperature: 42 } },
    ]);
    const started = change(updated, [
      { type: 'emit-event', event: { kind: 'object-click', objectId: id } },
    ]);
    expect(waterFor(started.building)).toEqual({ powered: true, flow: 0.8, temperature: 42 });
    const off = change(
      started,
      languageCommands(
        request(started),
        plan([action(id, { enabled: false, targetCapability: 'water' })]),
      ),
    );
    expect(waterFor(off.building)).toEqual({ powered: false, flow: 0.8, temperature: 42 });
  });

  it('keeps cooker and tap power triggers separate on a compound fixture', () => {
    const state = initial(),
      id = fixture(state.building).id,
      light = state.building.objects.find((item) => item.kind === 'light')!;
    const configured = change(
      state,
      languageCommands(request(state), {
        message: 'Saved cooker lighting.',
        actions: [],
        automations: [
          {
            operation: 'save',
            id: null,
            label: 'Cooker lighting',
            enabled: true,
            trigger: { kind: 'power', objectId: id, powered: true, behaviour: 'cooker' },
            conditions: [{ kind: 'power', objectId: id, powered: true, behaviour: 'water' }],
            actions: [action(light.id, { enabled: true, targetCapability: 'light' })],
          },
        ],
      }),
    );
    const dark = change(configured, [
      { type: 'set-light', objectId: light.id, state: { powered: false } },
    ]);
    const tap = change(dark, [{ type: 'set-water', objectId: id, state: { powered: true } }]);
    expect(
      tap.building.objects
        .find((item) => item.id === light.id)!
        .behaviours.find((item) => item.kind === 'light')!.state.powered,
    ).toBe(false);
    const cooker = change(tap, [{ type: 'set-cooker', objectId: id, state: { powered: true } }]);
    expect(
      cooker.building.objects
        .find((item) => item.id === light.id)!
        .behaviours.find((item) => item.kind === 'light')!.state.powered,
    ).toBe(true);
    const ambiguous: LanguagePlan = {
      message: '',
      actions: [],
      automations: [
        {
          operation: 'save',
          id: null,
          label: 'Ambiguous',
          enabled: true,
          trigger: { kind: 'power', objectId: id, powered: true, behaviour: null },
          conditions: [],
          actions: [action(light.id, { enabled: true })],
        },
      ],
    };
    expect(() => languageCommands(request(state), ambiguous)).toThrow('capability');
  });

  it('evaluates repeated relative changes against live state and keeps named burner actions narrow', () => {
    const state = initial(),
      id = fixture(state.building).id;
    const configured = change(
      state,
      languageCommands(request(state), {
        message: 'Saved fixture adjustments.',
        actions: [],
        automations: [
          {
            operation: 'save',
            id: null,
            label: 'Raise the heat and tap flow',
            enabled: true,
            trigger: { kind: 'object-click', objectId: id },
            conditions: [],
            actions: [
              action(id, { action: 'cooker-heat', amount: 0.1, relative: true }),
              action(id, { action: 'water-flow', amount: 0.1, relative: true }),
              action(id, { action: 'water-temperature', amount: 2, relative: true }),
              action(id, { action: 'cooker-burner', value: 'back-left', enabled: true }),
            ],
          },
        ],
      }),
    );
    expect(configured.building.rules![0]!.actions.map((item) => item.type)).toEqual([
      'adjust-cooker-heat',
      'adjust-water-flow',
      'adjust-water-temperature',
      'set-cooker-burner',
    ]);
    const edited = change(configured, [
      {
        type: 'set-cooker',
        objectId: id,
        state: { powered: true, burners: [false, true, false, true] },
      },
    ]);
    const trigger: SceneCommand[] = [
      { type: 'emit-event', event: { kind: 'object-click', objectId: id } },
    ];
    const first = change(edited, trigger),
      second = change(first, trigger);
    expect(cookerFor(second.building).heat).toBeCloseTo(cookerFor(state.building).heat + 0.2);
    expect(cookerFor(second.building).burners).toEqual([false, true, true, true]);
    expect(waterFor(second.building).flow).toBeCloseTo(waterFor(state.building).flow + 0.2);
    expect(waterFor(second.building).temperature).toBe(waterFor(state.building).temperature + 4);
  });
});
