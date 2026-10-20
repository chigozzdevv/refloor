import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { validateBuildingAssets } from '@refloor/catalogue';
import { validatePlacement } from '@refloor/engine';
import { fingerprintBuilding } from '@refloor/scene';
import { createEditMemory, recordTransition } from '@refloor/scene/edit-memory';
import type { LanguageEditRequest } from '@refloor/scene/chat';
import { siteSurfaceId, siteSurfaceMaterial } from '@refloor/scene/site-material';
import {
  chatTargetExists,
  languageCommands,
  languageContext,
} from '@refloor/server/shared/planning/language-edit';
import type { LanguagePlan } from '@refloor/server/shared/planning/language-edit';
import { validateMemory } from '@refloor/server/features/houses/house.validation';

function input(): LanguageEditRequest {
  const building = createHouse({ id: 'site-edits', name: 'Site edits', storeys: 1 });
  return {
    requestId: crypto.randomUUID(),
    building,
    target: { kind: 'surface', id: siteSurfaceId(building, 'paving') },
    message: 'Make the paving marble',
    view: { x: 0, z: 1 },
    player: null,
    context: createEditMemory(building),
  };
}
const action = (
  request: LanguageEditRequest,
  changes: Partial<LanguagePlan['actions'][number]>,
): LanguagePlan['actions'][number] => ({
  action: 'finish',
  targetId: request.target.id,
  surface: null,
  vector: null,
  relative: null,
  space: null,
  amount: null,
  enabled: null,
  value: 'marble',
  ...changes,
});
function apply(request: LanguageEditRequest, actions: LanguagePlan['actions']) {
  const result = validatePlacement(request.building, {
    id: crypto.randomUUID(),
    at: '2026-10-20T16:00:00Z',
    expectedRevision: request.building.revision,
    commands: languageCommands(request, { message: 'Updated.', actions, automations: [] }),
  });
  return {
    ...request,
    building: result.building,
    context: recordTransition(request.context!, result.building, {
      revision: result.revision,
      kind: 'edit',
      label: 'Exterior finish',
      source: 'chat',
    }),
  };
}
describe('contextual exterior material editing', () => {
  it('applies a real textured finish, preserves its maps on colour edits, then restores original exactly', () => {
    const request = input(),
      before = fingerprintBuilding(request.building);
    expect(chatTargetExists(request.building, request.target)).toBe(true);
    expect(
      languageContext(request).siteSurfaces.find((surface) => surface.id === request.target.id)
        ?.label,
    ).toBe('Compound paving');
    const marble = apply(request, [action(request, {})]);
    expect(siteSurfaceMaterial(marble.building, 'paving').textureId).toBe('marble');
    const painted = apply(marble, [action(marble, { action: 'color', value: '#345678' })]);
    expect(siteSurfaceMaterial(painted.building, 'paving')).toMatchObject({
      color: '#345678',
      textureId: 'marble',
    });
    const previous = apply(painted, [
      action(painted, { action: 'restore', value: 'previous.color' }),
    ]);
    expect(siteSurfaceMaterial(previous.building, 'paving')).toEqual(
      siteSurfaceMaterial(marble.building, 'paving'),
    );
    const restored = apply(previous, [
      action(previous, { action: 'restore', value: 'original.appearance' }),
    ]);
    expect(restored.building.siteMaterials).toBeUndefined();
    expect(fingerprintBuilding(restored.building)).toBe(before);
    validateBuildingAssets(painted.building);
  });

  it('keeps a selected surface scoped while house chat can edit multiple exterior finishes', () => {
    const request = input(),
      trim = siteSurfaceId(request.building, 'window-trim');
    expect(() =>
      apply(request, [action(request, { targetId: trim, action: 'color', value: '#ffffff' })]),
    ).toThrow('selected item');
    const wholeHouse = { ...request, target: { kind: 'house' as const, id: request.building.id } };
    const result = apply(wholeHouse, [
      action(request, {}),
      action(request, { targetId: trim, action: 'color', value: '#ffffff' }),
    ]);
    expect(result.building.siteMaterials?.['window-trim']?.color).toBe('#ffffff');
    expect(result.building.roof).toEqual(request.building.roof);
    expect(result.building.floors).toEqual(request.building.floors);
  });

  it('migrates legacy memory with default original surface properties in the server', () => {
    const request = input(),
      legacy = {
        ...request.context!,
        originals: request.context!.originals.filter((snapshot) => snapshot.kind !== 'surface'),
      };
    expect(
      validateMemory(request.building, legacy).originals.filter(
        (snapshot) => snapshot.kind === 'surface',
      ),
    ).toHaveLength(12);
  });
});
