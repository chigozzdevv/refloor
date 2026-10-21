import { describe, expect, it } from 'vitest';
import { applyCommands } from '@refloor/scene';
import {
  diffProperties,
  restorationChanges,
  propertiesMatch,
  writeProperty,
} from '@refloor/scene/properties';
import { createEditGuards } from '@refloor/scene/edit-guards';
import { createBuilding } from '@scene-test/fixtures';
const metadata = { id: 'change', at: new Date(0).toISOString() };
describe('selective shared properties', () => {
  it('restores changed fields while preserving later changes to other fields', () => {
    const before = { objects: [{ id: 'tv', position: { x: 1, z: 2 }, color: 'black' }] };
    const after = structuredClone(before);
    after.objects[0]!.position.x = 3;
    const current = structuredClone(after);
    current.objects[0]!.color = 'white';
    const patches = diffProperties(before, after);
    for (const change of restorationChanges(current, patches)) writeProperty(current, change);
    expect(current.objects[0]).toEqual({ id: 'tv', position: { x: 1, z: 2 }, color: 'white' });
    for (const change of restorationChanges(current, patches, true)) writeProperty(current, change);
    expect(current.objects[0]!.position.x).toBe(3);
  });
  it('rejects rollback when a later edit changed the same property', () => {
    const before = { roof: { color: 'black' } },
      after = { roof: { color: 'white' } };
    expect(() =>
      restorationChanges({ roof: { color: 'red' } }, diffProperties(before, after)),
    ).toThrow('later edit');
  });
  it('uses stable entity identity after another entity is inserted', () => {
    const before = { objects: [{ id: 'a', color: 'black' }] },
      after = { objects: [{ id: 'a', color: 'white' }] };
    const current = { objects: [{ id: 'b', color: 'blue' }, ...structuredClone(after.objects)] };
    for (const change of restorationChanges(current, diffProperties(before, after)))
      writeProperty(current, change);
    expect(current.objects.map((item) => item.color)).toEqual(['blue', 'black']);
  });
  it('protects identity and prototype properties', () => {
    expect(() =>
      writeProperty({}, { path: ['id'], value: { exists: true, value: 'bad' } }),
    ).toThrow();
    expect(() =>
      writeProperty({}, { path: ['objects', '__proto__'], value: { exists: true, value: {} } }),
    ).toThrow();
  });
  it('guards no-op commands and permits unrelated edits', () => {
    const building = createBuilding(),
      commands = [{ type: 'set-door' as const, doorId: 'entrance', open: false }];
    const guards = createEditGuards(building, commands);
    const opened = applyCommands(building, {
      ...metadata,
      expectedRevision: 0,
      commands: [{ ...commands[0]!, open: true }],
    }).building;
    expect(propertiesMatch(opened, guards)).toBe(false);
    const renamed = { ...building, name: 'Different name' };
    expect(propertiesMatch(renamed, guards)).toBe(true);
  });
  it('records truthful reversible property restoration revisions', () => {
    const before = createBuilding(),
      changed = structuredClone(before);
    changed.roof.material.color = '#ffffff';
    const result = applyCommands(
      changed,
      {
        ...metadata,
        expectedRevision: changed.revision,
        commands: [
          {
            type: 'restore-properties',
            changes: restorationChanges(changed, diffProperties(before, changed)),
          },
        ],
      },
      { evaluateRules: false },
    );
    expect(result.building.roof.material.color).toBe(before.roof.material.color);
    const replay = applyCommands(
      result.building,
      {
        ...metadata,
        expectedRevision: result.building.revision,
        commands: result.revision.inverseCommands,
      },
      { evaluateRules: false },
    );
    expect(replay.building.roof.material.color).toBe('#ffffff');
  });
});
