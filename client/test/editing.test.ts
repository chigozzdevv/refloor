import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/blueprints';
import { compileBuilding } from '@refloor/engine';
import { finishes } from '@refloor/catalogue';
import { fingerprintBuilding } from '@refloor/scene';
import type { DocumentState } from '@/runtime/editing/document';
import { editDocument, reverseDocument } from '@/runtime/editing/document';
import { findFurniturePlacement, replacementCommand } from '@/runtime/editing/placement';

const initial = (): DocumentState => ({
  compiled: compileBuilding(createHouse({ id: 'editable', name: 'Editable home', storeys: 1 })),
  past: [],
  future: [],
});

describe('validated browser editing', () => {
  it('restores complete content through multiple undo and redo operations', () => {
    const original = initial(),
      object = original.compiled.building.objects[0]!;
    const tinted = editDocument(original, [
      { type: 'set-object-material', objectId: object.id, slot: 'body', material: finishes.olive },
    ]);
    const removed = editDocument(tinted, [{ type: 'remove-object', objectId: object.id }]);
    const undoRemoval = reverseDocument(removed, 'undo'),
      undone = reverseDocument(undoRemoval, 'undo');
    expect(fingerprintBuilding(undone.compiled.building)).toBe(
      fingerprintBuilding(original.compiled.building),
    );
    const redone = reverseDocument(reverseDocument(undone, 'redo'), 'redo');
    expect(fingerprintBuilding(redone.compiled.building)).toBe(
      fingerprintBuilding(removed.compiled.building),
    );
    expect(redone.compiled.building.revision).toBe(6);
    expect(
      editDocument(undoRemoval, [
        {
          type: 'set-object-material',
          objectId: object.id,
          slot: 'body',
          material: finishes.tobacco,
        },
      ]).future,
    ).toEqual([]);
  });

  it('rejects a blocked move without altering the scene or history', () => {
    const state = initial(),
      object = state.compiled.building.objects.find((value) => value.kind === 'sofa')!,
      before = fingerprintBuilding(state.compiled.building);
    expect(() =>
      editDocument(state, [
        {
          type: 'move-object',
          objectId: object.id,
          roomId: object.roomId,
          position: { x: 0.1, y: 0, z: 0.1 },
          rotation: 0,
        },
      ]),
    ).toThrow();
    expect(fingerprintBuilding(state.compiled.building)).toBe(before);
    expect(state.past).toEqual([]);
  });

  it('adds furniture in a valid location and preserves identity on replacement', () => {
    const state = initial(),
      roomId = state.compiled.building.floors[0]!.rooms.find((room) => room.kind === 'living')!.id;
    const object = findFurniturePlacement(state.compiled, 'catalogue/chair', roomId);
    const added = editDocument(state, [{ type: 'add-object', object }]);
    const replaced = editDocument(added, [replacementCommand(object.id, 'catalogue/plant')]);
    expect(
      replaced.compiled.building.objects.find((value) => value.id === object.id),
    ).toMatchObject({ id: object.id, assetId: 'catalogue/plant', position: object.position });
  });
});
