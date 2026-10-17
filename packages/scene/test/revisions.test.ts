import { describe, expect, it } from 'vitest';
import { applyCommands, fingerprintBuilding, undoRevision } from '@refloor/scene';
import { createBuilding, edit, finish } from '@scene-test/fixtures';

const metadata = (id: string) => ({ id, at: '2026-10-18T12:01:00Z' });

describe('revision integrity', () => {
  it('undoes several revisions while maintaining a monotonic counter', () => {
    const original = createBuilding();
    const a = applyCommands(original, edit([{ type: 'set-door', doorId: 'entrance', open: true }]));
    const b = applyCommands(
      a.building,
      edit([{ type: 'set-television', objectId: 'tv', state: { powered: true } }], 1, 'edit-2'),
    );
    const undoB = undoRevision(b.building, b.revision, metadata('undo-b'));
    const undoA = undoRevision(undoB.building, a.revision, metadata('undo-a'));
    expect(undoA.building).toEqual({ ...original, revision: 4 });
  });

  it('can redo by reversing an undo revision', () => {
    const a = applyCommands(createBuilding(), edit([{ type: 'remove-object', objectId: 'sofa' }]));
    const undone = undoRevision(a.building, a.revision, metadata('undo-a'));
    const redone = undoRevision(undone.building, undone.revision, metadata('redo-a'));
    expect(redone.building).toEqual({ ...a.building, revision: 3 });
  });

  it('rejects undoing a revision before a later edit has been undone', () => {
    const a = applyCommands(
      createBuilding(),
      edit([{ type: 'set-door', doorId: 'entrance', open: true }]),
    );
    const b = applyCommands(
      a.building,
      edit([{ type: 'remove-object', objectId: 'sofa' }], 1, 'edit-2'),
    );
    expect(() => undoRevision(b.building, a.revision, metadata('undo-a'))).toThrowError(
      expect.objectContaining({ code: 'REVISION_MISMATCH' }),
    );
  });

  it('rejects a different building and out-of-band content changes', () => {
    const a = applyCommands(
      createBuilding(),
      edit([{ type: 'set-door', doorId: 'entrance', open: true }]),
    );
    expect(() =>
      undoRevision({ ...a.building, id: 'other-house' }, a.revision, metadata('undo-a')),
    ).toThrow();
    expect(() =>
      undoRevision(
        { ...a.building, name: 'Changed outside revision' },
        a.revision,
        metadata('undo-a'),
      ),
    ).toThrow();
  });

  it('rejects forged inverse commands and forged forward history', () => {
    const a = applyCommands(
      createBuilding(),
      edit([{ type: 'set-door', doorId: 'entrance', open: true }]),
    );
    const inverse = {
      ...a.revision,
      inverseCommands: [{ type: 'set-door', doorId: 'entrance', open: true }],
    };
    const forward = {
      ...a.revision,
      commands: [{ type: 'set-door', doorId: 'entrance', open: false }],
    };
    expect(() => undoRevision(a.building, inverse, metadata('undo-a'))).toThrow();
    expect(() => undoRevision(a.building, forward, metadata('undo-a'))).toThrow();
  });

  it('hashes material records independently of key insertion order', () => {
    const a = createBuilding(),
      b = createBuilding();
    const objectA = a.objects.find((object) => object.id === 'sofa'),
      objectB = b.objects.find((object) => object.id === 'sofa');
    if (!objectA || !objectB) throw new Error('Sofa missing');
    objectA.materials = { body: finish, legs: { ...finish, color: '#000000' } };
    objectB.materials = { legs: { ...finish, color: '#000000' }, body: finish };
    expect(fingerprintBuilding(a)).toBe(fingerprintBuilding(b));
  });

  it('reverses a chain of edits after serialization', () => {
    const original = createBuilding(),
      history = [];
    let building = original;
    for (let i = 0; i < 20; i++) {
      const result = applyCommands(
        building,
        edit(
          [
            {
              type: 'move-object',
              objectId: 'sofa',
              roomId: 'living',
              position: { x: 1.5 + (i % 4) * 0.5, y: 0, z: 2 },
              rotation: i % 2 ? Math.PI / 2 : 0,
            },
          ],
          building.revision,
          `edit-${i}`,
        ),
      );
      building = JSON.parse(JSON.stringify(result.building));
      history.push(JSON.parse(JSON.stringify(result.revision)) as typeof result.revision);
    }
    for (const record of history.toReversed())
      building = undoRevision(building, record, metadata(`undo-${record.id}`)).building;
    expect(building).toEqual({ ...original, revision: 40 });
  });
});
