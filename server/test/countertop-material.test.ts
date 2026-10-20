import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { finishes, validateBuildingAssets } from '@refloor/catalogue';
import { validatePlacement } from '@refloor/engine';
import { fingerprintBuilding, undoRevision } from '@refloor/scene';
import type { LanguageEditRequest } from '@refloor/scene/chat';
import { createEditMemory, recordTransition } from '@refloor/scene/edit-memory';
import {
  languageCommands,
  languageContext,
  languagePlanSchema,
} from '@refloor/server/shared/planning/language-edit';

function setup(legacy = false) {
  const building = createHouse({ id: 'countertop-home', name: 'Countertop home', storeys: 1 }),
    object = building.objects.find((item) => item.assetId === 'catalogue/kitchen-island')!;
  if (legacy) delete object.materials.top;
  const request: LanguageEditRequest = {
    requestId: crypto.randomUUID(),
    building,
    target: { kind: 'object', id: object.id },
    message: 'Make just the countertop dark marble.',
    view: { x: 0, z: 1 },
    player: null,
    context: createEditMemory(building),
  };
  return { request, object };
}

function plan(id: string, action: 'color' | 'restore' | 'finish', value: string) {
  return languagePlanSchema.parse({
    message: 'Updated the countertop.',
    automations: [],
    actions: [
      {
        action,
        targetId: id,
        surface: 'top',
        value,
        vector: null,
        relative: null,
        space: null,
        amount: null,
        enabled: null,
      },
    ],
  });
}

describe('independent countertop finishes', () => {
  it('uses continuous slab marble for a countertop request without repainting cabinetry', () => {
    const { request, object } = setup(),
      result = validatePlacement(request.building, {
        id: request.requestId,
        at: new Date().toISOString(),
        expectedRevision: 0,
        commands: languageCommands(request, plan(object.id, 'finish', 'marble')),
      }).building.objects.find((item) => item.id === object.id)!;
    expect(result.materials.top).toEqual(finishes.marbleSlab);
    expect(result.materials.body).toEqual(object.materials.body);
  });
  it.each([false, true])('changes only the top and undoes exactly, legacy=%s', (legacy) => {
    const { request, object } = setup(legacy);
    validateBuildingAssets(request.building);
    const context = languageContext(request);
    expect(context.objects.find((item) => item.id === object.id)!.materials.top).toEqual(
      finishes.marbleSlab,
    );
    const commands = languageCommands(request, plan(object.id, 'color', '#353a36')),
      result = validatePlacement(request.building, {
        id: request.requestId,
        at: new Date().toISOString(),
        expectedRevision: 0,
        commands,
      }),
      updated = result.building.objects.find((item) => item.id === object.id)!;
    validateBuildingAssets(result.building);
    expect(updated.materials.body).toEqual(object.materials.body);
    expect(updated.materials.frame).toEqual(object.materials.frame);
    expect(updated.materials.top).toEqual({ ...finishes.marbleSlab, color: '#353a36' });
    const restored = undoRevision(result.building, result.revision, {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
    });
    expect(fingerprintBuilding(restored.building)).toBe(fingerprintBuilding(request.building));
  });

  it('restores the visible original countertop on a legacy item without changing its cabinetry', () => {
    const { request, object } = setup(true),
      result = validatePlacement(request.building, {
        id: request.requestId,
        at: new Date().toISOString(),
        expectedRevision: 0,
        commands: languageCommands(request, plan(object.id, 'color', '#353a36')),
      }),
      memory = recordTransition(request.context!, result.building, {
        revision: result.revision,
        kind: 'edit',
        label: request.message,
        source: 'chat',
      });
    const restore = { ...request, building: result.building, context: memory },
      restored = validatePlacement(result.building, {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        expectedRevision: result.building.revision,
        commands: languageCommands(restore, plan(object.id, 'restore', 'original.appearance')),
      }).building.objects.find((item) => item.id === object.id)!;
    expect(restored.materials.top).toEqual(finishes.marbleSlab);
    expect(restored.materials.body).toEqual(object.materials.body);
  });

  it('does not expose countertop edits on furniture without that surface', () => {
    const { request } = setup(),
      sofa = request.building.objects.find((item) => item.kind === 'sofa')!;
    expect(() =>
      languageCommands(
        { ...request, target: { kind: 'object', id: sofa.id } },
        plan(sofa.id, 'color', '#353a36'),
      ),
    ).toThrow('surface is unavailable');
  });

  it('restores all materials on a legacy item without a new top overwriting earlier restorations', () => {
    const { request, object } = setup(true),
      result = validatePlacement(request.building, {
        id: request.requestId,
        at: new Date().toISOString(),
        expectedRevision: 0,
        commands: [
          {
            type: 'set-object-material',
            objectId: object.id,
            slot: 'body',
            material: finishes.ink,
          },
          {
            type: 'set-object-material',
            objectId: object.id,
            slot: 'frame',
            material: finishes.brass,
          },
        ],
      }),
      memory = recordTransition(request.context!, result.building, {
        revision: result.revision,
        kind: 'edit',
        label: 'Change cabinet',
        source: 'chat',
      }),
      action = plan(object.id, 'restore', 'original.appearance');
    action.actions[0]!.surface = null;
    const restored = validatePlacement(result.building, {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      expectedRevision: result.building.revision,
      commands: languageCommands(
        { ...request, building: result.building, context: memory },
        action,
      ),
    }).building.objects.find((item) => item.id === object.id)!;
    expect(restored.materials).toEqual({ ...object.materials, top: finishes.marbleSlab });
  });
});
