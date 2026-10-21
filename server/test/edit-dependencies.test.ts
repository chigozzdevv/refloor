import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { propertiesMatch } from '@refloor/scene/properties';
import type { LanguageEditRequest } from '@refloor/scene/chat';
import { languageReadGuards } from '@refloor/server/shared/planning/edit-dependencies';
import type { LanguagePlan } from '@refloor/server/shared/planning/language-edit';
import { siteSurfaceId } from '@refloor/scene/site-material';

const building = createHouse({ id: 'dependencies-house', name: 'Dependencies house', storeys: 1 });
const wall = building.floors[0]!.walls[0]!;
const input: LanguageEditRequest = {
  requestId: crypto.randomUUID(),
  building,
  target: { kind: 'wall', id: wall.id },
  message: 'Make this wall cream',
  view: { x: 0, z: 1 },
  player: null,
};
const commands = [
  {
    type: 'set-wall-material' as const,
    wallId: wall.id,
    material: { ...wall.material, color: '#efe1c5' },
  },
];

describe('language edit dependencies', () => {
  it('keeps clarifications valid without constructing an empty scene edit', () => {
    expect(
      languageReadGuards(input, { message: 'Which finish?', actions: [], automations: [] }, []),
    ).toEqual([]);
    const guards = languageReadGuards(
      input,
      {
        message: 'Done',
        references: [siteSurfaceId(building, 'paving')],
        actions: [],
        automations: [],
      },
      commands,
    );
    expect(propertiesMatch(building, guards)).toBe(true);
  });
  it('ignores unrelated roof edits and door animation but detects a changed requested surface', () => {
    const guards = languageReadGuards(
      input,
      { message: 'Done', actions: [], automations: [] },
      commands,
    );
    const latest = structuredClone(building);
    latest.roof.material.color = '#112233';
    for (const floor of latest.floors)
      for (const wall of floor.walls)
        for (const opening of wall.openings)
          if (opening.kind === 'door') opening.state.open = !opening.state.open;
    expect(propertiesMatch(latest, guards)).toBe(true);
    latest.floors[0]!.walls[0]!.material.color = '#334455';
    expect(propertiesMatch(latest, guards)).toBe(false);
  });
  it('guards a colour or style reference used by the model', () => {
    const reference = building.objects[0]!;
    const guards = languageReadGuards(
      input,
      { message: 'Done', references: [reference.id], actions: [], automations: [] },
      commands,
    );
    const latest = structuredClone(building);
    latest.objects[0]!.rotation += 0.2;
    expect(propertiesMatch(latest, guards)).toBe(false);
    expect(() =>
      languageReadGuards(
        input,
        { message: 'Done', references: ['missing'], actions: [], automations: [] },
        commands,
      ),
    ).toThrow('unavailable');
  });
  it('guards the geometry of relational furniture references', () => {
    const reference = building.objects[0]!;
    const action: LanguagePlan['actions'][number] = {
      action: 'place',
      targetId: building.objects[1]!.id,
      surface: null,
      vector: null,
      relative: null,
      space: null,
      amount: null,
      enabled: null,
      value: null,
      placement: { relation: 'near', referenceId: reference.id, facingId: null, gap: null },
    };
    const guards = languageReadGuards(
      input,
      { message: 'Done', actions: [action], automations: [] },
      commands,
    );
    const latest = structuredClone(building);
    latest.objects[0]!.position.x += 0.5;
    expect(propertiesMatch(latest, guards)).toBe(false);
    latest.objects[0] = structuredClone(reference);
    latest.objects[0]!.dimensions.width += 0.2;
    expect(propertiesMatch(latest, guards)).toBe(false);
  });
});
