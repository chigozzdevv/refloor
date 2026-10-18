import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { validatePlacement } from '@refloor/engine';
import type { LanguageEditRequest } from '@refloor/scene/chat';
import { languageCommands, chatTargetExists } from '@refloor/server/shared/planning/language-edit';
import type { LanguagePlan } from '@refloor/server/shared/planning/language-edit';

const building = createHouse({ id: 'chat-home', name: 'Chat home', storeys: 1 });
const television = building.objects.find((object) => object.kind === 'television')!;
const input: LanguageEditRequest = {
  requestId: '99b73231-385b-4734-9962-526d2555b546',
  building,
  target: { kind: 'object', id: television.id },
  message: 'Move left and turn on',
  view: { x: 0, z: 1 },
  player: null,
};
const action = (
  changes: Partial<LanguagePlan['actions'][number]>,
): LanguagePlan['actions'][number] => ({
  action: 'power',
  targetId: television.id,
  surface: null,
  vector: null,
  relative: null,
  space: null,
  amount: null,
  enabled: null,
  value: null,
  ...changes,
});
const edit = (request: LanguageEditRequest, actions: LanguagePlan['actions']) => ({
  id: request.requestId,
  at: '2026-10-18T12:00:00Z',
  expectedRevision: building.revision,
  commands: languageCommands(request, { message: 'Done', actions }),
});

describe('scoped language edits', () => {
  it('translates view-relative movement and television power into actual validated commands', () => {
    const result = validatePlacement(
      building,
      edit(input, [
        action({ action: 'move', vector: { x: -0.1, y: 0, z: 0 }, relative: true, space: 'view' }),
        action({ enabled: true }),
      ]),
    );
    const updated = result.building.objects.find((object) => object.id === television.id)!;
    expect(updated.position.x).toBeCloseTo(television.position.x + 0.1);
    expect(
      updated.behaviours.find((behaviour) => behaviour.kind === 'television')?.state.powered,
    ).toBe(true);
    expect(result.building.objects.filter((object) => object.id !== television.id)).toEqual(
      building.objects.filter((object) => object.id !== television.id),
    );
  });
  it('keeps an item chat inside its selected target and rejects invented capabilities', () => {
    const bed = building.objects.find((object) => object.kind === 'bed')!;
    expect(() => edit(input, [action({ targetId: bed.id, action: 'remove' })])).toThrow(
      'selected item',
    );
    expect(() =>
      edit({ ...input, target: { kind: 'object', id: bed.id } }, [
        action({ targetId: bed.id, enabled: true }),
      ]),
    ).toThrow('does not support');
    expect(chatTargetExists(building, { kind: 'wall', id: television.id })).toBe(false);
  });
  it('expands house-wide finishes without changing furniture or dimensions', () => {
    const request = { ...input, target: { kind: 'house' as const, id: building.id } };
    const result = validatePlacement(
      building,
      edit(request, [
        action({ action: 'color', targetId: building.id, surface: 'walls', value: '#d6dec5' }),
      ]),
    );
    expect(
      result.building.floors
        .flatMap((floor) => floor.walls)
        .every((wall) => wall.material.color === '#d6dec5'),
    ).toBe(true);
    expect(result.building.objects).toEqual(building.objects);
    expect(result.building.floors[0]!.footprint).toEqual(building.floors[0]!.footprint);
  });
  it('rejects unsafe movement and unsupported assets rather than applying a partial request', () => {
    expect(() =>
      validatePlacement(
        building,
        edit(input, [
          action({
            action: 'move',
            vector: { x: 100, y: 0, z: 0 },
            relative: true,
            space: 'world',
          }),
        ]),
      ),
    ).toThrow();
    expect(() => edit(input, [action({ action: 'replace', value: 'catalogue/missing' })])).toThrow(
      'unavailable',
    );
    expect(television.position.x).toBe(
      building.objects.find((object) => object.id === television.id)!.position.x,
    );
  });
});
