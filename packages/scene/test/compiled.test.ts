import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { createBuilding } from '@scene-test/fixtures';

it('runs the compiled public package in Node without a TypeScript loader or alias resolver', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { applyCommands, undoRevision } from '@refloor/scene';
    const original = JSON.parse(readFileSync(0, 'utf8'));
    const result = applyCommands(original, {
      id: 'runtime-edit', at: '2026-10-18T12:00:00Z', expectedRevision: 0,
      commands: [{ type: 'set-television', objectId: 'tv', state: { powered: true } }],
    });
    assert.equal(result.building.objects.find(object => object.id === 'tv').behaviours[0].state.powered, true);
    const restored = undoRevision(JSON.parse(JSON.stringify(result.building)), JSON.parse(JSON.stringify(result.revision)), {
      id: 'runtime-undo', at: '2026-10-18T12:01:00Z',
    });
    assert.deepEqual(restored.building, { ...original, revision: 2 });
    process.stdout.write(JSON.stringify({ edited: result.building.revision, restored: restored.building.revision }));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    input: JSON.stringify(createBuilding()),
    encoding: 'utf8',
  });
  const result: unknown = JSON.parse(output);
  expect(result).toEqual({ edited: 1, restored: 2 });
});
