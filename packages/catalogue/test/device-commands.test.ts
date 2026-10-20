import { expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { deviceCommands } from '@refloor/catalogue/device-commands';
import { createFurniture } from '@refloor/catalogue/furniture';
import { applyCommands } from '@refloor/scene';
const building = createHouse({ id: 'direct-controls', name: 'Direct controls', storeys: 1 });
const tv = building.objects.find((object) => object.kind === 'television')!;
const target = { kind: 'object' as const, id: tv.id };
it.each(['Turn on', 'Please switch on the TV.', 'turn it on', 'on the television'])(
  'resolves %s directly for the selected TV',
  (text) => {
    expect(deviceCommands(building, target, text)?.commands).toEqual([
      { type: 'set-television', objectId: tv.id, state: { powered: true } },
    ]);
  },
);
it('supports text mute and bounded volume without changing power', () => {
  expect(deviceCommands(building, target, 'unmute the TV')?.commands).toEqual([
    { type: 'set-television', objectId: tv.id, state: { muted: false } },
  ]);
  expect(deviceCommands(building, target, 'set volume to 35%')?.commands).toEqual([
    { type: 'set-television', objectId: tv.id, state: { volume: 0.35 } },
  ]);
  expect(deviceCommands(building, target, 'set volume to 135%')).toBeNull();
});
it.each([
  'turn on the shower',
  'turn on whenever I enter',
  'turn on and move left',
  'do not turn on',
  'if I turn on the TV dim the lights',
  'mute the bedroom TV',
])('leaves ambiguous or compound requests to language interpretation: %s', (text) => {
  expect(deviceCommands(building, target, text)).toBeNull();
});
it('distinguishes a compound kitchen tap, cooker and oven', () => {
  const kitchen = createFurniture('catalogue/kitchen-counter', {
    id: 'kitchen',
    floorId: building.floors[0]!.id,
    roomId: building.floors[0]!.rooms[0]!.id,
    position: { x: 2, y: 0, z: 2 },
    rotation: 0,
  });
  const house = { ...building, objects: [...building.objects, kitchen] },
    at = { kind: 'object' as const, id: kitchen.id };
  expect(deviceCommands(house, at, 'turn on')).toBeNull();
  expect(deviceCommands(house, at, 'open the tap')?.commands[0]?.type).toBe('start-water');
  expect(deviceCommands(house, at, 'open the oven door')?.commands[0]?.type).toBe('set-openable');
  expect(deviceCommands(house, at, 'turn on the cooker')?.commands[0]?.type).toBe('ignite-cooker');
});
it('keeps the rule transaction intact when a direct TV command fires', () => {
  const light = building.objects.find((object) =>
    object.behaviours.some((behaviour) => behaviour.kind === 'light'),
  )!;
  const house = {
    ...building,
    rules: [
      {
        id: 'tv-light',
        label: 'TV light',
        enabled: true,
        trigger: {
          kind: 'power' as const,
          objectId: tv.id,
          powered: true,
          behaviour: 'television' as const,
        },
        conditions: [],
        actions: [{ type: 'set-light' as const, objectId: light.id, state: { powered: false } }],
      },
    ],
  };
  const command = deviceCommands(house, target, 'turn on')!;
  const applied = applyCommands(house, {
    id: 'direct',
    at: new Date().toISOString(),
    expectedRevision: house.revision,
    commands: command.commands,
  });
  expect(
    applied.building.objects
      .find((object) => object.id === light.id)!
      .behaviours.find((behaviour) => behaviour.kind === 'light')!.state.powered,
  ).toBe(false);
});
