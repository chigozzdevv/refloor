import { describe, expect, it } from 'vitest';
import { zodTextFormat } from 'openai/helpers/zod';
import { createHouse } from '@refloor/catalogue/houses';
import { validatePlacement } from '@refloor/engine';
import { fingerprintBuilding, undoRevision } from '@refloor/scene';
import { createEditMemory, recordTransition } from '@refloor/scene/edit-memory';
import type { LanguageEditRequest } from '@refloor/scene/chat';
import {
  languageCommands,
  languageContext,
  languagePlanSchema,
} from '@refloor/server/shared/planning/language-edit';
import type { LanguagePlan } from '@refloor/server/shared/planning/language-edit';

function input(): LanguageEditRequest {
  const building = createHouse({ id: 'structure-chat', name: 'Structure chat', storeys: 1 });
  return {
    requestId: crypto.randomUUID(),
    building,
    target: { kind: 'house', id: building.id },
    message: 'Move the partition and adjust the door',
    view: { x: 0, z: 1 },
    player: null,
    context: createEditMemory(building),
  };
}
const action = (
  changes: Partial<LanguagePlan['actions'][number]>,
): LanguagePlan['actions'][number] => ({
  action: 'opening',
  targetId: 'ground/entrance',
  surface: null,
  vector: null,
  relative: null,
  space: null,
  amount: null,
  enabled: null,
  value: null,
  ...changes,
});
const opening = (id: string) => ({ id, offset: null, width: null, height: null, sill: null });
function apply(request: LanguageEditRequest, actions: LanguagePlan['actions']) {
  const result = validatePlacement(
    request.building,
    {
      id: crypto.randomUUID(),
      at: '2026-10-20T17:00:00Z',
      expectedRevision: request.building.revision,
      commands: languageCommands(request, { message: 'Adjusted.', actions, automations: [] }),
    },
    {},
    request.player ?? undefined,
  );
  return {
    ...request,
    building: result.building,
    context: recordTransition(request.context!, result.building, {
      revision: result.revision,
      kind: 'edit',
      label: 'Structural edit',
      source: 'chat',
    }),
    result,
  };
}

describe('bounded structural language edits', () => {
  it('moves a selected door along its wall in view space and restores recorded position and dimensions', () => {
    const request = { ...input(), target: { kind: 'door' as const, id: 'ground/entrance' } },
      original = request.building.floors[0]!.walls.flatMap((wall) => wall.openings).find(
        (opening) => opening.id === request.target.id,
      )!;
    const moved = apply(request, [
      action({
        opening: { ...opening(original.id), width: original.width + 0.1 },
        vector: { x: -0.2, y: 0, z: 0 },
        relative: true,
        space: 'view',
      }),
    ]);
    const updated = moved.building.floors[0]!.walls.flatMap((wall) => wall.openings).find(
      (opening) => opening.id === original.id,
    )!;
    expect(updated.offset).toBeCloseTo(original.offset + 0.2);
    expect(updated.width).toBeCloseTo(original.width + 0.1);
    expect(updated.kind === 'door' && updated.state.open).toBe(false);
    const resizedBack = apply(moved, [action({ action: 'restore', value: 'original.size' })]);
    expect(
      resizedBack.building.floors[0]!.walls.flatMap((wall) => wall.openings).find(
        (opening) => opening.id === original.id,
      )!.width,
    ).toBe(original.width);
    const restored = apply(resizedBack, [
      action({ action: 'restore', value: 'original.position' }),
    ]);
    expect(fingerprintBuilding(restored.building)).toBe(fingerprintBuilding(request.building));
    expect(
      fingerprintBuilding(
        undoRevision(moved.building, moved.result.revision, {
          id: 'undo-door-geometry',
          at: '2026-10-20T17:01:00Z',
        }).building,
      ),
    ).toBe(fingerprintBuilding(request.building));
  });

  it('slides an eligible divider, updates both rooms, and restores previous partition position', () => {
    const request = { ...input(), target: { kind: 'wall' as const, id: 'ground/divider' } },
      context = languageContext(request),
      wall = context.floors[0]!.walls.find((wall) => wall.id === request.target.id)!;
    expect(wall.movablePartition).toEqual({ axis: 'z', position: 5 });
    const moved = apply(request, [
      action({
        action: 'move',
        targetId: request.target.id,
        vector: { x: 0, y: 0, z: 0.2 },
        relative: true,
        space: 'world',
      }),
    ]);
    expect(
      moved.building.floors[0]!.rooms.find((room) => room.id === 'ground/front-room')!.footprint
        .depth,
    ).toBeCloseTo(5.2);
    expect(
      moved.building.floors[0]!.rooms.find((room) => room.id === 'ground/rear-room')!.footprint.z,
    ).toBeCloseTo(5.2);
    const restored = apply(moved, [
      action({ action: 'restore', targetId: request.target.id, value: 'previous.position' }),
    ]);
    expect(fingerprintBuilding(restored.building)).toBe(fingerprintBuilding(request.building));
  });

  it('adjusts an actual window within selected-wall scope and exposes its real geometry', () => {
    const request = { ...input(), target: { kind: 'wall' as const, id: 'ground/east' } },
      window = request.building.floors[0]!.walls.find((wall) => wall.id === request.target.id)!
        .openings[0]!;
    expect(
      languageContext(request).floors[0]!.walls.find((wall) => wall.id === request.target.id)!
        .openings[0],
    ).toMatchObject({ id: window.id, kind: 'window', offset: window.offset });
    const changed = apply(request, [
      action({
        targetId: request.target.id,
        opening: { ...opening(window.id), width: window.width - 0.1, sill: 0.8 },
      }),
    ]);
    expect(
      changed.building.floors[0]!.walls.find((wall) => wall.id === request.target.id)!.openings[0],
    ).toMatchObject({ id: window.id, width: window.width - 0.1, sill: 0.8 });
  });

  it('rejects unsupported exterior moves, cross-target openings and blocked geometry atomically', () => {
    const request = input(),
      before = fingerprintBuilding(request.building);
    expect(() =>
      apply(request, [
        action({
          action: 'move',
          targetId: 'ground/south',
          vector: { x: 0, y: 0, z: 0.2 },
          relative: true,
          space: 'world',
        }),
      ]),
    ).toThrow('Exterior walls');
    expect(() =>
      apply({ ...request, target: { kind: 'wall', id: 'ground/east' } }, [
        action({ targetId: 'ground/east', opening: opening('ground/entrance') }),
      ]),
    ).toThrow('selected wall');
    expect(() =>
      apply(request, [action({ opening: { ...opening('ground/entrance'), width: 0.1 } })]),
    ).toThrow();
    expect(() =>
      apply(request, [
        action({
          action: 'move',
          targetId: 'ground/divider',
          vector: { x: 0.1, y: 0, z: 0 },
          relative: true,
          space: 'world',
        }),
      ]),
    ).toThrow('perpendicular');
    expect(fingerprintBuilding(request.building)).toBe(before);
    expect(() => zodTextFormat(languagePlanSchema, 'house_edit')).not.toThrow();
  });
});
