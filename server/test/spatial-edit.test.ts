import { describe, expect, it } from 'vitest';
import { zodTextFormat } from 'openai/helpers/zod';
import { createHouse } from '@refloor/catalogue/houses';
import { placementProfile } from '@refloor/catalogue';
import { validateBuilding, validatePlacement } from '@refloor/engine';
import { fingerprintBuilding, undoRevision } from '@refloor/scene';
import type { LanguageEditRequest } from '@refloor/scene/chat';
import {
  languageCommands,
  languagePlanSchema,
} from '@refloor/server/shared/planning/language-edit';
import type { LanguagePlan } from '@refloor/server/shared/planning/language-edit';

const action = (
  changes: Partial<LanguagePlan['actions'][number]>,
): LanguagePlan['actions'][number] => ({
  action: 'place',
  targetId: '',
  surface: null,
  vector: null,
  relative: null,
  space: null,
  amount: null,
  enabled: null,
  value: null,
  ...changes,
});
function input(): LanguageEditRequest {
  const building = createHouse({
    id: 'redesign',
    name: 'Redesign',
    storeys: 1,
    width: 16,
    depth: 14,
  });
  return {
    requestId: crypto.randomUUID(),
    building,
    target: { kind: 'house', id: building.id },
    message:
      'Centre the TV above the sideboard, face the sofa to it, and add two chairs near the table.',
    view: { x: 0, z: 1 },
    player: null,
  };
}
function apply(request: LanguageEditRequest, actions: LanguagePlan['actions']) {
  const commands = languageCommands(request, { message: 'Redesigned.', actions, automations: [] });
  return validatePlacement(
    request.building,
    {
      id: request.requestId,
      at: '2026-10-20T14:00:00Z',
      expectedRevision: request.building.revision,
      commands,
    },
    {},
    request.player ?? undefined,
  );
}
const placement = (
  relation: NonNullable<LanguagePlan['actions'][number]['placement']>['relation'],
  referenceId: string | null,
  facingId: string | null = null,
) => ({ relation, referenceId, facingId, gap: null });

describe('spatial room redesign', () => {
  it('centres a wall-mounted TV, faces the sofa and adds distinct chairs as one reversible edit', () => {
    const request = input(),
      tv = request.building.objects.find((object) => object.kind === 'television')!,
      sofa = request.building.objects.find((object) => object.kind === 'sofa')!,
      sideboard = request.building.objects.find(
        (object) => object.assetId === 'catalogue/cabinet',
      )!,
      table = request.building.objects.find(
        (object) => object.assetId === 'catalogue/coffee-table',
      )!;
    tv.position.x += 0.4;
    sofa.rotation = 0.12;
    validateBuilding(request.building);
    const result = apply(request, [
      action({
        action: 'add',
        targetId: table.roomId,
        value: 'catalogue/chair',
        amount: 2,
        placement: placement('near', table.id, tv.id),
      }),
      action({ targetId: tv.id, placement: placement('above', sideboard.id) }),
      action({ targetId: sofa.id, placement: placement('facing', tv.id) }),
    ]);
    const updatedTv = result.building.objects.find((object) => object.id === tv.id)!,
      updatedSofa = result.building.objects.find((object) => object.id === sofa.id)!,
      added = result.building.objects.filter(
        (object) => !request.building.objects.some((before) => before.id === object.id),
      );
    expect(updatedTv.position.x).toBeCloseTo(sideboard.position.x);
    expect(updatedTv.position.y).toBeCloseTo(
      sideboard.position.y + sideboard.dimensions.height + 0.18,
    );
    expect(updatedTv.position.z).toBeGreaterThan(sideboard.position.z);
    expect(updatedSofa.rotation).toBeCloseTo(
      Math.atan2(updatedTv.position.x - sofa.position.x, updatedTv.position.z - sofa.position.z),
    );
    expect(added).toHaveLength(2);
    expect(new Set(added.map((object) => object.id)).size).toBe(2);
    expect(
      added.every((object) => object.assetId === 'catalogue/chair' && object.position.y === 0),
    ).toBe(true);
    for (const chair of added)
      expect(chair.rotation).toBeCloseTo(
        Math.atan2(
          updatedTv.position.x - chair.position.x,
          updatedTv.position.z - chair.position.z,
        ),
        2,
      );
    expect(result.revision.commands.map((command) => command.type)).toEqual([
      'move-object',
      'move-object',
      'add-object',
      'add-object',
    ]);
    const restored = undoRevision(result.building, result.revision, {
      id: 'undo-redesign',
      at: '2026-10-20T14:01:00Z',
    });
    expect(fingerprintBuilding(restored.building)).toBe(fingerprintBuilding(request.building));
  });

  it('mounts inserted televisions and pendants on their actual supporting surfaces', () => {
    const request = input(),
      room = request.building.floors[0]!.rooms.find((room) => room.kind === 'bedroom')!;
    const result = apply(request, [
      action({ action: 'add', targetId: room.id, value: 'catalogue/television' }),
      action({ action: 'add', targetId: room.id, value: 'catalogue/pendant' }),
    ]);
    const added = result.building.objects.filter(
      (object) => !request.building.objects.some((before) => before.id === object.id),
    );
    expect(added.find((object) => object.kind === 'television')!.position.y).toBeGreaterThan(0.25);
    const pendant = added.find((object) => object.assetId === 'catalogue/pendant')!;
    expect(pendant.position.y + pendant.dimensions.height).toBeCloseTo(2.78);
    expect(placementProfile('catalogue/television').supports).toEqual(['wall']);
  });

  it('mounts a pendant over an existing table and an exterior floodlight above the entrance door', () => {
    const request = input(),
      table = request.building.objects.find(
        (object) => object.assetId === 'catalogue/coffee-table',
      )!,
      floor = request.building.floors[0]!;
    const result = apply(request, [
      action({
        action: 'add',
        targetId: table.roomId,
        value: 'catalogue/pendant',
        placement: placement('above', table.id),
      }),
      action({
        action: 'add',
        targetId: floor.rooms[0]!.id,
        value: 'catalogue/floodlight',
        placement: placement('above', 'ground/entrance'),
      }),
    ]);
    const added = result.building.objects.filter(
      (object) => !request.building.objects.some((before) => before.id === object.id),
    );
    const pendant = added.find((object) => object.assetId === 'catalogue/pendant')!,
      floodlight = added.find((object) => object.assetId === 'catalogue/floodlight')!;
    expect(pendant.position.x).toBe(table.position.x);
    expect(pendant.position.z).toBe(table.position.z);
    expect(pendant.position.y + pendant.dimensions.height).toBeCloseTo(floor.height - 0.02);
    expect(floodlight.placement).toBe('exterior');
    expect(floodlight.position.z).toBeLessThan(floor.footprint.z);
    expect(floodlight.position.y).toBeCloseTo(2.43);
  });

  it('preserves strict item scope and refuses invented references or unsupported mounts', () => {
    const request = input(),
      sofa = request.building.objects.find((object) => object.kind === 'sofa')!,
      table = request.building.objects.find(
        (object) => object.assetId === 'catalogue/coffee-table',
      )!;
    expect(() =>
      apply({ ...request, target: { kind: 'object', id: sofa.id } }, [
        action({ action: 'add', targetId: sofa.roomId, value: 'catalogue/chair' }),
      ]),
    ).toThrow('selected item');
    expect(() =>
      apply(request, [action({ targetId: sofa.id, placement: placement('above', table.id) })]),
    ).toThrow('support');
    expect(() =>
      apply(request, [action({ targetId: sofa.id, placement: placement('near', 'invented') })]),
    ).toThrow('existing item');
    expect(() =>
      apply(request, [
        action({ action: 'add', targetId: sofa.roomId, value: 'catalogue/invented' }),
      ]),
    ).toThrow('unavailable');
    expect(() =>
      apply(request, [
        action({ action: 'add', targetId: sofa.roomId, value: 'catalogue/chair', amount: 5 }),
      ]),
    ).toThrow('one and four');
  });

  it('supports suitable tabletop decor and keeps item-scoped relational edits on the selected item', () => {
    const request = input(),
      table = request.building.objects.find(
        (object) => object.assetId === 'catalogue/kitchen-island',
      )!,
      sofa = request.building.objects.find((object) => object.kind === 'sofa')!,
      tv = request.building.objects.find((object) => object.kind === 'television')!;
    const decorated = apply(request, [
      action({
        action: 'add',
        targetId: table.roomId,
        value: 'catalogue/plant',
        placement: placement('on', table.id),
      }),
    ]);
    const plant = decorated.building.objects.find(
      (object) => !request.building.objects.some((before) => before.id === object.id),
    )!;
    expect(plant.position).toEqual({
      x: table.position.x,
      y: table.position.y + table.dimensions.height + 0.01,
      z: table.position.z,
    });
    const faced = apply({ ...request, target: { kind: 'object', id: sofa.id } }, [
      action({ targetId: sofa.id, placement: placement('facing', tv.id) }),
    ]);
    expect(faced.building.objects.filter((object) => object.id !== sofa.id)).toEqual(
      request.building.objects.filter((object) => object.id !== sofa.id),
    );
  });

  it('rejects the complete redesign when a requested relation has no safe placement', () => {
    const request = input(),
      sofa = request.building.objects.find((object) => object.kind === 'sofa')!,
      before = fingerprintBuilding(request.building);
    expect(() =>
      apply(request, [
        action({ action: 'color', targetId: sofa.id, value: '#aabbcc', surface: 'body' }),
        action({
          action: 'add',
          targetId: sofa.roomId,
          value: 'catalogue/sofa',
          placement: placement('on', sofa.id),
        }),
      ]),
    ).toThrow('support');
    expect(fingerprintBuilding(request.building)).toBe(before);
  });

  it('accepts legacy plans without placement and emits a strict model schema', () => {
    const request = input(),
      tv = request.building.objects.find((object) => object.kind === 'television')!;
    const plan = {
      message: 'Done.',
      actions: [action({ action: 'power', targetId: tv.id, enabled: true })],
      automations: [],
    };
    expect(languagePlanSchema.parse(plan).actions[0]!.placement).toBeNull();
    expect(() => zodTextFormat(languagePlanSchema, 'house_edit')).not.toThrow();
  });
});
