import { describe, expect, it } from 'vitest';
import { zodTextFormat } from 'openai/helpers/zod';
import { createHouse } from '@refloor/catalogue/houses';
import { validatePlacement } from '@refloor/engine';
import type { LanguageEditRequest } from '@refloor/scene/chat';
import {
  languageCommands,
  languagePlanSchema,
} from '@refloor/server/shared/planning/language-edit';
import type { LanguagePlan } from '@refloor/server/shared/planning/language-edit';

const action = (
  targetId: string,
  changes: Partial<LanguagePlan['actions'][number]> = {},
): LanguagePlan['actions'][number] => ({
  action: 'power',
  targetId,
  surface: null,
  vector: null,
  relative: null,
  space: null,
  amount: null,
  enabled: true,
  value: null,
  ...changes,
});
const input = (): LanguageEditRequest => {
  const building = createHouse({ id: 'language-actions', name: 'Language actions', storeys: 1 });
  return {
    requestId: crypto.randomUUID(),
    building,
    target: { kind: 'house', id: building.id },
    message: 'When I turn on the TV, dim the lights and close the bedroom door.',
    view: { x: 0, z: 1 },
    player: null,
  };
};

describe('language-defined universal actions', () => {
  it('compiles device triggers and multiple actions without applying them during configuration', () => {
    const request = input(),
      building = request.building;
    const tv = building.objects.find((object) => object.kind === 'television')!;
    const light = building.objects.find((object) => object.kind === 'light' && !object.placement)!;
    const plan: LanguagePlan = {
      message: 'Saved your TV scene.',
      actions: [],
      automations: [
        {
          operation: 'save',
          id: null,
          label: 'TV scene',
          enabled: true,
          trigger: { kind: 'power', objectId: tv.id, powered: true },
          conditions: [],
          actions: [
            action(light.id, { action: 'intensity', enabled: null, amount: 1 }),
            action('ground/room-door-0', { action: 'open', enabled: false }),
          ],
        },
      ],
    };
    const commands = languageCommands(request, plan);
    expect(commands.map((command) => command.type)).toEqual(['set-rules']);
    const result = validatePlacement(building, {
      id: request.requestId,
      at: new Date().toISOString(),
      expectedRevision: building.revision,
      commands,
    });
    expect(result.building.rules![0]!.actions).toHaveLength(2);
    expect(result.building.objects.find((object) => object.id === light.id)!.behaviours).toEqual(
      light.behaviours,
    );
    const disable = languageCommands(
      { ...request, building: result.building },
      {
        message: 'Disabled.',
        actions: [],
        automations: [
          {
            operation: 'enable',
            id: result.building.rules![0]!.id,
            label: '',
            enabled: false,
            trigger: null,
            conditions: [],
            actions: [],
          },
        ],
      },
    );
    expect(disable[0]).toMatchObject({ type: 'set-rules', rules: [{ enabled: false }] });
    expect(() => zodTextFormat(languagePlanSchema, 'house_edit')).not.toThrow();
  });
  it('rejects cross-item configuration from unrelated item chat and invalid device actions', () => {
    const request = input();
    const tv = request.building.objects.find((object) => object.kind === 'television')!;
    const chair = request.building.objects.find((object) => object.kind === 'chair')!;
    const plan: LanguagePlan = {
      message: '',
      actions: [],
      automations: [
        {
          operation: 'save',
          id: null,
          label: 'On entry',
          enabled: true,
          trigger: { kind: 'door', doorId: 'ground/entrance', open: true },
          conditions: [],
          actions: [action(tv.id)],
        },
      ],
    };
    expect(() =>
      languageCommands({ ...request, target: { kind: 'object', id: chair.id } }, plan),
    ).toThrow('house chat');
    plan.automations[0]!.actions = [action(chair.id)];
    expect(() => languageCommands(request, plan)).toThrow('does not support');
  });
});
