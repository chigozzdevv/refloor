import { expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { validatePlacement } from '@refloor/engine';
import { undoRevision } from '@refloor/scene';
import { languageCommands } from '@refloor/server/shared/planning/language-edit';
import type { LanguagePlan } from '@refloor/server/shared/planning/language-edit';
import type { LanguageEditRequest } from '@refloor/scene/chat';

it('saves TV-on cinema lighting, scopes it to the parlor and restores the full transaction with undo', () => {
  const building = createHouse({ id: 'cinema', name: 'Cinema', storeys: 2 }),
    tv = building.objects.find((object) => object.kind === 'television')!;
  const request: LanguageEditRequest = {
    building,
    requestId: crypto.randomUUID(),
    message: 'Whenever I turn on this TV, activate cinema mode in the parlor.',
    target: { kind: 'object', id: tv.id },
    view: { x: 0, z: 1 },
    player: null,
  };
  const action: LanguagePlan['actions'][number] = {
    action: 'cinema',
    targetId: tv.id,
    surface: null,
    vector: null,
    relative: null,
    space: null,
    amount: null,
    enabled: null,
    value: null,
  };
  const commands = languageCommands(request, {
    message: 'Saved.',
    actions: [],
    automations: [
      {
        operation: 'save',
        id: null,
        label: 'Parlor cinema',
        enabled: true,
        trigger: { kind: 'power', behaviour: 'television', objectId: tv.id, powered: true },
        conditions: [],
        actions: [action],
      },
    ],
  });
  const configured = validatePlacement(building, {
    id: 'configure',
    at: new Date().toISOString(),
    expectedRevision: building.revision,
    commands,
  });
  expect(configured.building.objects).toEqual(building.objects);
  const powered = validatePlacement(configured.building, {
    id: 'on',
    at: new Date().toISOString(),
    expectedRevision: configured.building.revision,
    commands: [{ type: 'set-television', objectId: tv.id, state: { powered: true } }],
  });
  for (const object of powered.building.objects) {
    const light = object.behaviours.find((value) => value.kind === 'light');
    if (!light) continue;
    if (object.roomId === tv.roomId && object.placement !== 'exterior')
      expect(light.state.powered).toBe(false);
    else
      expect(object.behaviours).toEqual(
        building.objects.find((value) => value.id === object.id)!.behaviours,
      );
  }
  const restored = undoRevision(powered.building, powered.revision, {
    id: 'undo',
    at: new Date().toISOString(),
  });
  expect(restored.building.objects).toEqual(configured.building.objects);
  const again = validatePlacement(restored.building, {
    id: 'on-again',
    at: new Date().toISOString(),
    expectedRevision: restored.building.revision,
    commands: [{ type: 'set-television', objectId: tv.id, state: { powered: true } }],
  });
  expect(
    again.revision.commands.filter((command) => command.type === 'set-light'),
  ).not.toHaveLength(0);
});
