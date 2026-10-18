import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import { finishes, lightTuning, lightOutput } from '@refloor/catalogue';
import { fingerprintBuilding } from '@refloor/scene';
import { createEditMemory } from '@refloor/scene/edit-memory';
import type { DocumentState } from '@/shared/editor/document';
import { editDocument, reverseDocument, restoreBefore, redoChange } from '@/shared/editor/document';
import { findFurniturePlacement, replacementCommand } from '@/shared/editor/placement';

const initial = (): DocumentState => {
  const compiled = compileBuilding(
    createHouse({ id: 'editable', name: 'Editable home', storeys: 1 }),
  );
  return { compiled, past: [], future: [], memory: createEditMemory(compiled.building) };
};

describe('validated browser editing', () => {
  it('resets a legacy overbright light and retains a reversible, bounded history', () => {
    const original = initial(),
      light = original.compiled.building.objects.find((object) => object.kind === 'light')!,
      state = light.behaviours.find((item) => item.kind === 'light')!.state;
    state.intensity = 100;
    state.color = '#ffffff';
    const reset = editDocument(
      original,
      [{ type: 'set-light', objectId: light.id, state: lightTuning(light)!.defaults }],
      undefined,
      { label: 'Reset light' },
    );
    const restored = reset.compiled.building.objects.find((item) => item.id === light.id)!;
    expect(restored.behaviours.find((item) => item.kind === 'light')!.state).toEqual(
      lightTuning(light)!.defaults,
    );
    expect(lightOutput(restored)).toBe(3);
    const undone = reverseDocument(reset, 'undo');
    expect(
      lightOutput(undone.compiled.building.objects.find((item) => item.id === light.id)!),
    ).toBe(6);
    expect(fingerprintBuilding(reverseDocument(undone, 'redo').compiled.building)).toBe(
      fingerprintBuilding(reset.compiled.building),
    );
    expect(() =>
      editDocument(reset, [{ type: 'set-light', objectId: light.id, state: { intensity: 6.01 } }]),
    ).toThrow('200%');
  });
  it('undoes a chat and later edits atomically and retains labels across redo', () => {
    const original = initial(),
      object = original.compiled.building.objects[0]!;
    const painted = editDocument(
        original,
        [
          {
            type: 'set-object-material',
            objectId: object.id,
            slot: 'body',
            material: finishes.olive,
          },
        ],
        undefined,
        { source: 'chat', label: 'Make the sofa green' },
      ),
      removed = editDocument(painted, [{ type: 'remove-object', objectId: object.id }], undefined, {
        source: 'chat',
        label: 'Remove the sofa',
      }),
      door = removed.compiled.doors.find((value) => !value.open)!,
      travelled = editDocument(
        removed,
        [{ type: 'set-door', doorId: door.id, open: true }],
        undefined,
        { source: 'navigation' },
      ),
      undone = restoreBefore(travelled, painted.past[0]!.revision.id);
    expect(fingerprintBuilding(undone.compiled.building)).toBe(
      fingerprintBuilding(original.compiled.building),
    );
    const redone = redoChange(redoChange(undone));
    expect(fingerprintBuilding(redone.compiled.building)).toBe(
      fingerprintBuilding(travelled.compiled.building),
    );
    expect(
      redone.past.filter((record) => record.source === 'chat').map((record) => record.label),
    ).toEqual(['Make the sofa green', 'Remove the sofa']);
  });

  it('keeps the whole history unchanged if restoring an item would trap the player', () => {
    const original = initial(),
      sofa = original.compiled.building.objects.find((object) => object.kind === 'sofa')!,
      removed = editDocument(original, [{ type: 'remove-object', objectId: sofa.id }], undefined, {
        source: 'chat',
        label: 'Remove the sofa',
      }),
      fingerprint = fingerprintBuilding(removed.compiled.building);
    expect(() =>
      restoreBefore(removed, removed.past[0]!.revision.id, {
        floorId: sofa.floorId,
        position: sofa.position,
      }),
    ).toThrow(/Move clear/);
    expect(fingerprintBuilding(removed.compiled.building)).toBe(fingerprint);
    expect(removed.past).toHaveLength(1);
  });
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
