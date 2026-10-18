import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { createTwoStorey } from '@engine-test/fixtures';

it('uses the built engine and scene packages in Node without a loader or alias resolver', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { validateBuilding, buildNavigation, entrancePoints, findPath, validatePlacement } from '@refloor/engine';
    const building = JSON.parse(readFileSync(0, 'utf8'));
    const compiled = validateBuilding(building), navigation = buildNavigation(compiled);
    const path = findPath(navigation, entrancePoints(navigation)[0], { floorId: 'upper', position: { x: 8, y: 3, z: 3 } });
    assert.deepEqual(path.stairIds, ['stairs']);
    const result = validatePlacement(building, { id: 'runtime-edit', at: '2026-10-18T12:00:00Z', expectedRevision: 0,
      commands: [{ type: 'set-television', objectId: 'tv', state: { powered: true } }] });
    assert.equal(result.building.objects.find(object => object.id === 'tv').behaviours[0].state.powered, true);
    process.stdout.write(JSON.stringify({ floors: compiled.building.floors.length, revision: result.building.revision }));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    input: JSON.stringify(createTwoStorey()),
    encoding: 'utf8',
  });
  const result: unknown = JSON.parse(output);
  expect(result).toEqual({ floors: 2, revision: 1 });
});
