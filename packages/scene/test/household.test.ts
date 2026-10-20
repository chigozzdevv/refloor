import { describe, expect, it } from 'vitest';
import {
  applyCommands,
  conditionMatches,
  eventMatches,
  getObjectCapabilities,
  parseBuilding,
  undoRevision,
} from '@refloor/scene';
import type { Behaviour, SceneCommand, SceneRule } from '@refloor/scene';
import { createBuilding, edit, getObject } from '@scene-test/fixtures';

const states: Behaviour[] = [
  { kind: 'cooker', state: { powered: false, heat: 0.6, burners: [true, false, false, false] } },
  { kind: 'water', state: { powered: false, flow: 0.5, temperature: 22 } },
  { kind: 'openable', state: { open: false } },
];
const metadata = { id: 'undo-household', at: '2026-10-20T12:01:00Z' };
const household = () => {
  const building = createBuilding();
  getObject(building, 'sofa').behaviours = structuredClone(states);
  return building;
};
const change = (building: ReturnType<typeof household>, commands: SceneCommand[]) =>
  applyCommands(building, edit(commands, building.revision));

describe('composable household capabilities', () => {
  it.each<SceneCommand>([
    {
      type: 'set-cooker',
      objectId: 'sofa',
      state: { powered: true, heat: 0.8, burners: [false, true, true, false] },
    },
    { type: 'set-water', objectId: 'sofa', state: { powered: true, flow: 0.8, temperature: 38 } },
    { type: 'set-openable', objectId: 'sofa', state: { open: true } },
    { type: 'set-cooker-burner', objectId: 'sofa', burner: 2, enabled: true },
    { type: 'adjust-cooker-heat', objectId: 'sofa', delta: 0.2 },
    { type: 'adjust-water-flow', objectId: 'sofa', delta: 0.2 },
    { type: 'adjust-water-temperature', objectId: 'sofa', delta: 5 },
    { type: 'ignite-cooker', objectId: 'sofa' },
    { type: 'start-water', objectId: 'sofa' },
  ])('persists and exactly undoes $type without changing another capability', (command) => {
    const original = household();
    const result = change(original, [command]);
    expect(JSON.parse(JSON.stringify(result.building))).toEqual(result.building);
    expect(undoRevision(result.building, result.revision, metadata).building).toEqual({
      ...original,
      revision: 2,
    });
    expect(original).toEqual(household());
    expect(getObjectCapabilities(getObject(result.building, 'sofa'))).toEqual(
      expect.arrayContaining(['cooker', 'water', 'openable']),
    );
  });

  it('keeps configured heat and burner mask while switching power off and back on', () => {
    const powered = change(household(), [
      {
        type: 'set-cooker',
        objectId: 'sofa',
        state: { powered: true, heat: 0.8, burners: [false, true, false, true] },
      },
    ]).building;
    const off = change(powered, [
      { type: 'set-cooker', objectId: 'sofa', state: { powered: false } },
    ]).building;
    const on = change(off, [
      { type: 'set-cooker', objectId: 'sofa', state: { powered: true } },
    ]).building;
    expect(getObject(off, 'sofa').behaviours[0]!.state).toEqual({
      powered: false,
      heat: 0.8,
      burners: [false, true, false, true],
    });
    expect(getObject(on, 'sofa').behaviours).toEqual(getObject(powered, 'sofa').behaviours);
  });

  it('ignites only the requested burner from an off cooker and merges individual changes while on', () => {
    const original = household();
    const selected = change(original, [
      { type: 'set-cooker-burner', objectId: 'sofa', burner: 3, enabled: true },
    ]);
    expect(getObject(selected.building, 'sofa').behaviours[0]!.state).toEqual({
      powered: true,
      heat: 0.6,
      burners: [false, false, false, true],
    });
    const merged = change(selected.building, [
      { type: 'set-cooker-burner', objectId: 'sofa', burner: 1, enabled: true },
    ]);
    expect(getObject(merged.building, 'sofa').behaviours[0]!.state).toMatchObject({
      burners: [false, true, false, true],
    });
    const off = change(merged.building, [
      { type: 'set-cooker', objectId: 'sofa', state: { powered: false } },
    ]).building;
    const disabled = change(off, [
      { type: 'set-cooker-burner', objectId: 'sofa', burner: 1, enabled: false },
    ]).building;
    expect(getObject(disabled, 'sofa').behaviours[0]!.state).toMatchObject({
      powered: false,
      burners: [false, false, false, true],
    });
    const resumed = change(off, [{ type: 'ignite-cooker', objectId: 'sofa' }]).building;
    expect(getObject(resumed, 'sofa').behaviours[0]!.state).toMatchObject({
      powered: true,
      burners: [false, true, false, true],
    });
    expect(undoRevision(selected.building, selected.revision, metadata).building).toEqual({
      ...original,
      revision: 2,
    });
  });

  it('ignites after all burners or heat are disabled and preserves a later configured burner mask in saved actions', () => {
    const building = household();
    const cooker = getObject(building, 'sofa').behaviours.find(
      (behaviour) => behaviour.kind === 'cooker',
    )!;
    cooker.state = { powered: false, heat: 0, burners: [false, false, false, false] };
    building.rules = [
      {
        id: 'ignite',
        label: 'Ignite when clicked',
        enabled: true,
        trigger: { kind: 'object-click', objectId: 'sofa' },
        conditions: [],
        actions: [{ type: 'ignite-cooker', objectId: 'sofa' }],
      },
    ];
    const first = change(building, [
      { type: 'emit-event', event: { kind: 'object-click', objectId: 'sofa' } },
    ]);
    expect(getObject(first.building, 'sofa').behaviours[0]!.state).toEqual({
      powered: true,
      heat: 0.6,
      burners: [true, false, false, false],
    });
    const burner = change(building, [
      { type: 'set-cooker-burner', objectId: 'sofa', burner: 3, enabled: true },
    ]);
    expect(getObject(burner.building, 'sofa').behaviours[0]!.state).toEqual({
      powered: true,
      heat: 0.6,
      burners: [false, false, false, true],
    });
    const changed = change(first.building, [
      {
        type: 'set-cooker',
        objectId: 'sofa',
        state: { powered: false, heat: 0.3, burners: [false, false, false, true] },
      },
    ]).building;
    const later = change(changed, [
      { type: 'emit-event', event: { kind: 'object-click', objectId: 'sofa' } },
    ]);
    expect(getObject(later.building, 'sofa').behaviours[0]!.state).toEqual({
      powered: true,
      heat: 0.3,
      burners: [false, false, false, true],
    });
    expect(undoRevision(later.building, later.revision, metadata).building).toEqual({
      ...changed,
      revision: changed.revision + 2,
    });
  });

  it('adds only missing capabilities and restores exact ordering when undoing removal', () => {
    const original = household();
    const removed = change(original, [
      { type: 'remove-object-behaviours', objectId: 'sofa', kinds: ['cooker', 'openable'] },
    ]);
    expect(getObject(removed.building, 'sofa').behaviours.map((value) => value.kind)).toEqual([
      'water',
    ]);
    expect(undoRevision(removed.building, removed.revision, metadata).building).toEqual({
      ...original,
      revision: 2,
    });
    expect(() =>
      change(original, [
        { type: 'add-object-behaviours', objectId: 'sofa', behaviours: [states[0]!] },
      ]),
    ).toThrow(/new and unique/);
  });

  it('starts zero-flow water and resolves saved starts against later flow and temperature settings', () => {
    const building = household();
    const water = getObject(building, 'sofa').behaviours.find(
      (behaviour) => behaviour.kind === 'water',
    )!;
    water.state = { powered: false, flow: 0, temperature: 39 };
    building.rules = [
      {
        id: 'start-tap',
        label: 'Start tap when clicked',
        enabled: true,
        trigger: { kind: 'object-click', objectId: 'sofa' },
        conditions: [],
        actions: [{ type: 'start-water', objectId: 'sofa' }],
      },
    ];
    const started = change(building, [
      { type: 'emit-event', event: { kind: 'object-click', objectId: 'sofa' } },
    ]);
    expect(
      getObject(started.building, 'sofa').behaviours.find(
        (behaviour) => behaviour.kind === 'water',
      )!.state,
    ).toEqual({ powered: true, flow: 0.55, temperature: 39 });
    expect(undoRevision(started.building, started.revision, metadata).building).toEqual({
      ...building,
      revision: 2,
    });
    const configured = change(started.building, [
      {
        type: 'set-water',
        objectId: 'sofa',
        state: { powered: false, flow: 0.2, temperature: 24 },
      },
    ]).building;
    const later = change(configured, [
      { type: 'emit-event', event: { kind: 'object-click', objectId: 'sofa' } },
    ]);
    expect(
      getObject(later.building, 'sofa').behaviours.find((behaviour) => behaviour.kind === 'water')!
        .state,
    ).toEqual({ powered: true, flow: 0.2, temperature: 24 });
  });

  it.each([
    { type: 'set-cooker', objectId: 'sofa', state: { heat: 1.01 } },
    { type: 'set-cooker', objectId: 'sofa', state: { burners: [true, false] } },
    { type: 'set-water', objectId: 'sofa', state: { flow: -0.1 } },
    { type: 'set-water', objectId: 'sofa', state: { temperature: 60.1 } },
    { type: 'set-water', objectId: 'sofa', state: { temperature: 9.9 } },
    { type: 'set-cooker', objectId: 'sofa', state: {} },
    { type: 'set-water', objectId: 'sofa', state: {} },
    { type: 'set-openable', objectId: 'sofa', state: {} },
    { type: 'set-cooker-burner', objectId: 'sofa', burner: 4, enabled: true },
  ])('rejects invalid state atomically: $type', (command) => {
    const original = household();
    expect(() => applyCommands(original, { ...edit([]), commands: [command] })).toThrow();
    expect(original).toEqual(household());
  });

  it.each<SceneCommand>([
    { type: 'set-cooker', objectId: 'sofa', state: { powered: true } },
    { type: 'set-water', objectId: 'sofa', state: { powered: true } },
    { type: 'start-water', objectId: 'sofa' },
    { type: 'set-openable', objectId: 'sofa', state: { open: true } },
  ])('requires the declared $type capability', (command) => {
    expect(() => change(createBuilding(), [command])).toThrow(/has no/);
  });

  it('keeps power rules independent across capabilities while supporting legacy any-power rules', () => {
    const building = household();
    const base: Omit<SceneRule, 'id' | 'trigger' | 'actions'> = {
      label: 'Household action',
      enabled: true,
      conditions: [],
    };
    building.rules = [
      {
        ...base,
        id: 'cooker-opens',
        trigger: { kind: 'power', objectId: 'sofa', powered: true, behaviour: 'cooker' },
        actions: [{ type: 'set-openable', objectId: 'sofa', state: { open: true } }],
      },
      {
        ...base,
        id: 'any-power',
        trigger: { kind: 'power', objectId: 'sofa', powered: true },
        actions: [{ type: 'set-light', objectId: 'lamp', state: { powered: false } }],
      },
    ];
    const water = change(building, [
      { type: 'set-water', objectId: 'sofa', state: { powered: true } },
    ]).building;
    expect(conditionMatches(water, { kind: 'openable', objectId: 'sofa', open: false })).toBe(true);
    expect(
      conditionMatches(water, {
        kind: 'power',
        objectId: 'sofa',
        powered: true,
        behaviour: 'cooker',
      }),
    ).toBe(false);
    expect(conditionMatches(water, { kind: 'power', objectId: 'lamp', powered: false })).toBe(true);
    const cooker = change(water, [
      { type: 'set-cooker', objectId: 'sofa', state: { powered: true } },
    ]);
    expect(
      conditionMatches(cooker.building, { kind: 'openable', objectId: 'sofa', open: true }),
    ).toBe(true);
    expect(undoRevision(cooker.building, cooker.revision, metadata).building).toEqual({
      ...water,
      revision: water.revision + 2,
    });
  });

  it('fires openable rules and evaluates capability-specific conditions', () => {
    const building = household();
    building.rules = [
      {
        id: 'open-with-water',
        label: 'Open with tap',
        enabled: true,
        trigger: { kind: 'openable', objectId: 'sofa', open: true },
        conditions: [{ kind: 'power', objectId: 'sofa', behaviour: 'water', powered: true }],
        actions: [{ type: 'set-light', objectId: 'lamp', state: { powered: false } }],
      },
    ];
    const result = change(building, [
      { type: 'set-water', objectId: 'sofa', state: { powered: true } },
      { type: 'set-openable', objectId: 'sofa', state: { open: true } },
    ]);
    expect(
      conditionMatches(result.building, { kind: 'power', objectId: 'lamp', powered: false }),
    ).toBe(true);
    expect(
      eventMatches(
        { kind: 'openable', objectId: 'sofa', open: true },
        { kind: 'openable', objectId: 'sofa', open: false },
      ),
    ).toBe(false);
  });

  it('resolves repeated heat, flow, temperature and burner changes against current state', () => {
    const original = household();
    original.rules = [
      {
        id: 'turn-knobs',
        label: 'Adjust each time',
        enabled: true,
        trigger: { kind: 'object-click', objectId: 'sofa' },
        conditions: [],
        actions: [
          { type: 'adjust-cooker-heat', objectId: 'sofa', delta: 0.2 },
          { type: 'adjust-water-flow', objectId: 'sofa', delta: -0.2 },
          { type: 'adjust-water-temperature', objectId: 'sofa', delta: 20 },
          { type: 'set-cooker-burner', objectId: 'sofa', burner: 2, enabled: true },
        ],
      },
    ];
    const once = change(original, [
      { type: 'emit-event', event: { kind: 'object-click', objectId: 'sofa' } },
    ]).building;
    const modified = change(once, [
      { type: 'set-cooker-burner', objectId: 'sofa', burner: 1, enabled: true },
    ]).building;
    const twice = change(modified, [
      { type: 'emit-event', event: { kind: 'object-click', objectId: 'sofa' } },
    ]);
    expect(getObject(twice.building, 'sofa').behaviours).toEqual([
      { kind: 'cooker', state: { powered: true, heat: 1, burners: [false, true, true, false] } },
      { kind: 'water', state: { powered: false, flow: expect.closeTo(0.1), temperature: 60 } },
      { kind: 'openable', state: { open: false } },
    ]);
    expect(undoRevision(twice.building, twice.revision, metadata).building).toEqual({
      ...modified,
      revision: modified.revision + 2,
    });
  });

  it('rejects rules referring to unavailable household capabilities', () => {
    const building = createBuilding();
    building.rules = [
      {
        id: 'invalid',
        label: 'Invalid action',
        enabled: true,
        trigger: { kind: 'object-click', objectId: 'sofa' },
        conditions: [],
        actions: [{ type: 'set-cooker', objectId: 'sofa', state: { powered: true } }],
      },
    ];
    expect(() => parseBuilding(building)).toThrow(/capability/);
    building.rules[0]!.actions = [
      { type: 'set-light', objectId: 'lamp', state: { powered: false } },
    ];
    building.rules[0]!.trigger = { kind: 'openable', objectId: 'sofa', open: true };
    expect(() => parseBuilding(building)).toThrow(/capability/);
  });
});

describe('open-plan room uses', () => {
  it('preserves legacy rooms and validates explicitly combined residential uses', () => {
    const original = createBuilding();
    expect(parseBuilding(original)).toEqual(original);
    original.floors[0]!.rooms[0]!.uses = ['living', 'dining', 'kitchen'];
    expect(parseBuilding(original).floors[0]!.rooms[0]!.uses).toEqual([
      'living',
      'dining',
      'kitchen',
    ]);
    original.floors[0]!.rooms[0]!.uses = ['kitchen', 'living'];
    expect(() => parseBuilding(original)).toThrow(/primary room use/);
    original.floors[0]!.rooms[0]!.uses = ['living', 'bedroom'];
    expect(() => parseBuilding(original)).toThrow(/open-plan/);
    original.floors[0]!.rooms[0]!.uses = ['living', 'living'];
    expect(() => parseBuilding(original)).toThrow(/unique/);
  });
});
