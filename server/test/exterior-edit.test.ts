import { describe, expect, it } from 'vitest';
import { createBuilding, edit, finish } from '@scene-test/fixtures';
import { applyCommands, undoRevision } from '@refloor/scene';
import { createEditMemory, recordTransition, scopedEditMemory } from '@refloor/scene/edit-memory';
import type { LanguageEditRequest } from '@refloor/scene/chat';
import {
  languageCommands,
  languageContext,
  chatTargetExists,
} from '@refloor/server/shared/planning/language-edit';
import type { LanguagePlan } from '@refloor/server/shared/planning/language-edit';
import { finishes } from '@refloor/catalogue';
import { createHouse } from '@refloor/catalogue/houses';

const action = (
  targetId: string,
  changes: Partial<LanguagePlan['actions'][number]>,
): LanguagePlan['actions'][number] => ({
  action: 'finish',
  targetId,
  surface: null,
  vector: null,
  relative: null,
  space: null,
  amount: null,
  enabled: null,
  value: 'oak',
  ...changes,
});
const request = (): LanguageEditRequest => {
  const building = createBuilding();
  return {
    requestId: '99b73231-385b-4734-9962-526d2555b546',
    building,
    context: createEditMemory(building),
    target: { kind: 'wall', id: 'south', side: 'exterior' },
    message: 'Make it brick',
    view: { x: 0, z: 1 },
    player: null,
  };
};
const commands = (input: LanguageEditRequest, actions: LanguagePlan['actions']) =>
  languageCommands(input, { message: 'Updated', actions, automations: [] });

describe('exterior language edits', () => {
  it('defaults a selected exterior face to independent cladding and preserves it on recolour', () => {
    const input = request();
    const first = commands(input, [action('south', { value: 'brick' })]);
    expect(first).toEqual([
      { type: 'set-wall-exterior-material', wallId: 'south', material: finishes.brick },
    ]);
    const result = applyCommands(input.building, edit(first));
    const next = commands({ ...input, building: result.building }, [
      action('south', { action: 'color', value: '#444444' }),
    ]);
    expect(next).toEqual([
      {
        type: 'set-wall-exterior-material',
        wallId: 'south',
        material: { ...finishes.brick, color: '#444444' },
      },
    ]);
    expect(result.building.floors[0]!.walls[0]!.material).toEqual(finish);
    expect(chatTargetExists(input.building, input.target)).toBe(true);
    expect(
      chatTargetExists(input.building, { kind: 'wall', id: 'partition', side: 'exterior' }),
    ).toBe(false);
  });
  it('preserves an untouched outside finish when repainting a selected inside face', () => {
    const input = request();
    input.target = { kind: 'wall', id: 'south' };
    const changes = commands(input, [action('south', { action: 'color', value: '#ffbbcc' })]);
    const result = applyCommands(input.building, edit(changes));
    const wall = result.building.floors[0]!.walls.find((item) => item.id === 'south')!;
    expect(wall.material.color).toBe('#ffbbcc');
    expect(wall.exteriorMaterial).toEqual(finish);
    const undone = undoRevision(result.building, result.revision, {
      id: 'undo-interior',
      at: '2026-10-19T14:00:00Z',
    });
    expect(undone.building.floors[0]!.walls.find((item) => item.id === 'south')).not.toHaveProperty(
      'exteriorMaterial',
    );
  });
  it('preserves the current inherited outside colour when restoring a legacy inside paint', () => {
    const input = request();
    input.target = { kind: 'wall', id: 'south' };
    const legacy = applyCommands(
      input.building,
      edit([
        { type: 'set-wall-material', wallId: 'south', material: { ...finish, color: '#ffbbcc' } },
      ]),
    );
    const restored = commands({ ...input, building: legacy.building }, [
      action('south', { action: 'restore', value: 'original.appearance' }),
    ]);
    const result = applyCommands(legacy.building, {
      ...edit(restored),
      expectedRevision: legacy.building.revision,
    });
    const wall = result.building.floors[0]!.walls.find((item) => item.id === 'south')!;
    expect(wall.material).toEqual(finish);
    expect(wall.exteriorMaterial?.color).toBe('#ffbbcc');
  });
  it('does not invent a previous outside finish from an inside repaint', () => {
    const input = request(),
      inside = { ...input, target: { kind: 'wall' as const, id: 'south' } };
    const result = applyCommands(
      input.building,
      edit(commands(inside, [action('south', { action: 'color', value: '#ffbbcc' })])),
    );
    const memory = recordTransition(input.context!, result.building, {
      revision: result.revision,
      kind: 'edit',
      label: 'Paint inside',
      source: 'chat',
    });
    expect(() =>
      commands(
        { ...input, building: result.building, context: scopedEditMemory(memory, input.target) },
        [action('south', { action: 'restore', value: 'previous.appearance' })],
      ),
    ).toThrow('no earlier recorded value');
  });
  it('preserves all outside finishes during a global interior repaint', () => {
    const input = request();
    input.target = { kind: 'house', id: input.building.id };
    input.building.floors[0]!.walls.find((item) => item.id === 'north')!.exteriorMaterial =
      finishes.brick;
    const result = applyCommands(
      input.building,
      edit(
        commands(input, [
          action(input.target.id, { action: 'color', surface: 'walls', value: '#ffbbcc' }),
        ]),
      ),
    );
    const walls = result.building.floors[0]!.walls;
    expect(walls.every((item) => item.material.color === '#ffbbcc')).toBe(true);
    expect(walls.find((item) => item.id === 'south')!.exteriorMaterial).toEqual(finish);
    expect(walls.find((item) => item.id === 'north')!.exteriorMaterial).toEqual(finishes.brick);
    expect(walls.find((item) => item.id === 'partition')).not.toHaveProperty('exteriorMaterial');
  });
  it('edits only perimeter faces for a global exterior request and exposes roof context', () => {
    const input = request(),
      global = { ...input, target: { kind: 'house' as const, id: input.building.id } };
    const result = commands(global, [
      action(input.building.id, { surface: 'exterior', value: 'marble' }),
    ]);
    expect(result.length).toBe(4);
    expect(
      result.every(
        (command) =>
          command.type === 'set-wall-exterior-material' && command.wallId !== 'partition',
      ),
    ).toBe(true);
    const realHouse = createHouse({ id: 'exterior-context', name: 'Exterior context', storeys: 1 });
    expect(
      languageContext({
        ...input,
        building: realHouse,
        target: { kind: 'roof', id: realHouse.roof.id },
      }).roof,
    ).toEqual(realHouse.roof);
    const roof = { ...input, target: { kind: 'roof' as const, id: input.building.roof.id } };
    expect(commands(roof, [action(roof.target.id, { value: 'asphalt' })])).toEqual([
      { type: 'set-roof-material', roofId: roof.target.id, material: finishes.asphalt },
    ]);
  });
  it('restores original and previous exterior finishes exactly without changing interior paint', () => {
    const input = request(),
      first = applyCommands(
        input.building,
        edit(commands(input, [action('south', { value: 'brick' })])),
      );
    const memory = recordTransition(input.context!, first.building, {
      revision: first.revision,
      kind: 'edit',
      label: 'Brick',
      source: 'chat',
    });
    const changed = {
      ...input,
      building: first.building,
      context: scopedEditMemory(memory, input.target),
    };
    expect(
      commands(changed, [action('south', { action: 'restore', value: 'original.appearance' })]),
    ).toEqual([{ type: 'set-wall-exterior-material', wallId: 'south', material: null }]);
    expect(
      commands(changed, [action('south', { action: 'restore', value: 'previous.appearance' })]),
    ).toEqual([{ type: 'set-wall-exterior-material', wallId: 'south', material: null }]);
  });
  it('keeps saved inside-paint rules from overwriting later outside changes', () => {
    const input = request();
    input.target = { kind: 'house', id: input.building.id };
    const planned = languageCommands(input, {
      message: 'Saved',
      actions: [],
      automations: [
        {
          operation: 'save',
          id: null,
          label: 'Paint inside on opening',
          enabled: true,
          trigger: { kind: 'door', doorId: 'entrance', open: true },
          conditions: [],
          actions: [action('south', { action: 'color', surface: 'walls', value: '#ffbbcc' })],
        },
      ],
    });
    const saved = applyCommands(input.building, edit(planned));
    expect(saved.building.floors[0]!.walls.find((item) => item.id === 'south')).not.toHaveProperty(
      'exteriorMaterial',
    );
    expect(saved.building.rules![0]!.actions).toEqual([
      {
        type: 'set-wall-material',
        wallId: 'south',
        material: { ...finish, color: '#ffbbcc' },
        preserveExterior: true,
      },
    ]);
    const outside = applyCommands(saved.building, {
      ...edit([{ type: 'set-wall-exterior-material', wallId: 'south', material: finishes.marble }]),
      expectedRevision: saved.building.revision,
    });
    const fired = applyCommands(outside.building, {
      ...edit([{ type: 'set-door', doorId: 'entrance', open: true }]),
      expectedRevision: outside.building.revision,
    });
    const wall = fired.building.floors[0]!.walls.find((item) => item.id === 'south')!;
    expect(wall.material.color).toBe('#ffbbcc');
    expect(wall.exteriorMaterial).toEqual(finishes.marble);
    const undone = undoRevision(fired.building, fired.revision, {
      id: 'undo-rule',
      at: '2026-10-19T14:00:00Z',
    });
    const restored = undone.building.floors[0]!.walls.find((item) => item.id === 'south')!;
    expect(restored.material).toEqual(finish);
    expect(restored.exteriorMaterial).toEqual(finishes.marble);
  });
  it('preserves the roof original finish through material and colour edits', () => {
    const input = request();
    input.target = { kind: 'roof', id: input.building.roof.id };
    const first = applyCommands(
      input.building,
      edit(commands(input, [action(input.target.id, { value: 'asphalt' })])),
    );
    const memory = recordTransition(input.context!, first.building, {
      revision: first.revision,
      kind: 'edit',
      label: 'Asphalt',
      source: 'chat',
    });
    const restored = commands(
      { ...input, building: first.building, context: scopedEditMemory(memory, input.target) },
      [action(input.target.id, { action: 'restore', value: 'original.appearance' })],
    );
    expect(restored).toEqual([
      {
        type: 'set-roof-material',
        roofId: input.target.id,
        material: input.building.roof.material,
      },
    ]);
  });
});
