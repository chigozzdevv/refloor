import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding, isPlayerPositionValid } from '@refloor/engine';
import { fingerprintBuilding } from '@refloor/scene';
import { createEditMemory, editMemorySchema, scopedEditMemory } from '@refloor/scene/edit-memory';
import { editDocument, reverseDocument } from '@/shared/editor/document';
import type { DocumentState } from '@/shared/editor/document';
import { entryPose } from '@/shared/navigation/entry';
import {
  removeDesign,
  returnToWorking,
  saveDesign,
  viewDesign,
} from '@/shared/editor/design-checkpoints';
import { encodeDraft, decodeDraft } from '@/shared/scene/draft-codec';
import { encodeProject, maxProjectBytes, readProjectFile } from '@/shared/scene/files';

const initial = (): DocumentState => {
  const compiled = compileBuilding(
    createHouse({ id: 'design-comparison', name: 'Design comparison', storeys: 1 }),
  );
  return { compiled, past: [], future: [], memory: createEditMemory(compiled.building) };
};

function changeColour(state: ReturnType<typeof initial>, colour: string) {
  const roof = state.compiled.building.roof;
  return editDocument(
    state,
    [{ type: 'set-roof-material', roofId: roof.id, material: { ...roof.material, color: colour } }],
    undefined,
    { source: 'chat', label: `Make the roof ${colour}` },
  );
}

describe('named design checkpoints', () => {
  it('compares two versions without losing the working arrangement, original properties or undo', () => {
    const before = saveDesign(initial(), 'Before'),
      working = saveDesign(changeColour(before, '#334455'), 'After'),
      beforeId = working.memory.designs!.items[0]!.id,
      afterId = working.memory.designs!.items[1]!.id,
      viewed = viewDesign(working, beforeId).document;
    expect(fingerprintBuilding(viewed.compiled.building)).toBe(
      fingerprintBuilding(before.compiled.building),
    );
    expect(viewed.compiled.building.revision).toBeGreaterThan(working.compiled.building.revision);
    expect(viewed.memory.originals).toEqual(working.memory.originals);
    expect(viewed.past).toEqual([]);
    expect(viewed.memory.transitions).toEqual([]);
    expect(viewed.memory.turns).toEqual([]);
    const other = viewDesign(viewed, afterId).document;
    expect(other.memory.designs!.comparison!.working).toEqual(working.compiled.building);
    const restored = returnToWorking(other).document;
    expect(fingerprintBuilding(restored.compiled.building)).toBe(
      fingerprintBuilding(working.compiled.building),
    );
    expect(restored.past).toEqual(working.past);
    expect(restored.future).toEqual(working.future);
    expect(restored.memory.transitions).toEqual(working.memory.transitions);
    expect(restored.memory.turns).toEqual(working.memory.turns);
    expect(restored.memory.designs!.comparison).toBeUndefined();
    expect(other.memory.designs!.comparison).toBeDefined();
    expect(fingerprintBuilding(reverseDocument(restored, 'undo').compiled.building)).toBe(
      fingerprintBuilding(before.compiled.building),
    );
  });

  it('retains edits made to a viewed version before switching or returning', () => {
    const before = saveDesign(initial(), 'Original'),
      working = saveDesign(changeColour(before, '#334455'), 'Dark roof'),
      viewed = viewDesign(working, before.memory.designs!.items[0]!.id).document,
      edited = changeColour(viewed, '#ae7755'),
      result = returnToWorking(edited);
    expect(result.preserved).toBe('Changes to Original');
    expect(result.document.memory.designs!.items.at(-1)!.building.roof.material.color).toBe(
      '#ae7755',
    );
    expect(result.document.compiled.building.roof.material.color).toBe('#334455');
    expect(edited.memory.designs!.comparison).toBeDefined();
  });

  it('requires room to preserve an edited preview and leaves a refused switch untouched', () => {
    let state = initial();
    for (let index = 0; index < 6; index++) state = saveDesign(state, `Version ${index}`);
    const viewed = viewDesign(state, state.memory.designs!.items[0]!.id).document,
      edited = changeColour(viewed, '#123456'),
      before = JSON.stringify(edited);
    expect(() => viewDesign(edited, state.memory.designs!.items[1]!.id)).toThrow('Six designs');
    expect(JSON.stringify(edited)).toBe(before);
    expect(() => returnToWorking(edited)).toThrow('Six designs');
    expect(JSON.stringify(edited)).toBe(before);
  });

  it('rejects a version that would put the visitor inside restored furniture', () => {
    const saved = saveDesign(initial(), 'Furnished'),
      table = saved.compiled.building.objects.find(
        (object) => object.assetId === 'catalogue/coffee-table',
      )!,
      current = editDocument(saved, [{ type: 'remove-object', objectId: table.id }]),
      player = {
        floorId: table.floorId,
        position: { ...table.position, y: saved.compiled.building.floors[0]!.elevation },
      },
      before = JSON.stringify(current);
    expect(isPlayerPositionValid(current.compiled, player)).toBe(true);
    expect(() => viewDesign(current, saved.memory.designs!.items[0]!.id, player)).toThrow(
      'would block you',
    );
    expect(JSON.stringify(current)).toBe(before);
  });

  it('preserves valid player positions and the exact saved entity identities', () => {
    const saved = saveDesign(initial(), 'Original'),
      state = changeColour(saved, '#334455'),
      entry = entryPose(state.compiled),
      player = { floorId: entry.floorId, position: entry.inside };
    const viewed = viewDesign(state, saved.memory.designs!.items[0]!.id, player).document;
    expect(isPlayerPositionValid(viewed.compiled, player)).toBe(true);
    expect(viewed.compiled.building.objects.map((object) => object.id)).toEqual(
      saved.compiled.building.objects.map((object) => object.id),
    );
  });

  it('persists checkpoints and an in-progress comparison through draft and export round-trips', () => {
    const saved = saveDesign(initial(), 'Original'),
      working = changeColour(saved, '#334455'),
      compared = viewDesign(working, saved.memory.designs!.items[0]!.id).document,
      local = decodeDraft(encodeDraft(compared)),
      exported = encodeProject(compared.compiled.building, compared.memory),
      portable = readProjectFile(exported);
    expect(new TextEncoder().encode(exported).length).toBeLessThan(maxProjectBytes);
    expect(local.memory.designs).toEqual(compared.memory.designs);
    expect(portable.memory.designs).toEqual(compared.memory.designs);
    const resumed = returnToWorking(local).document;
    expect(resumed.past).toEqual(working.past);
    expect(fingerprintBuilding(resumed.compiled.building)).toBe(
      fingerprintBuilding(working.compiled.building),
    );
    expect(reverseDocument(resumed, 'undo').compiled.building.roof.material).toEqual(
      saved.compiled.building.roof.material,
    );
  });

  it('keeps saved buildings out of AI context and never recursively snapshots edit memory', () => {
    const saved = saveDesign(initial(), 'Original'),
      viewed = viewDesign(saved, saved.memory.designs!.items[0]!.id).document,
      context = scopedEditMemory(viewed.memory, {
        kind: 'house',
        id: viewed.compiled.building.id,
      });
    expect(context.designs).toBeUndefined();
    expect(saved.memory.designs!.items[0]).not.toHaveProperty('memory');
    expect(viewed.memory.designs!.comparison).not.toHaveProperty('memory');
    expect(viewed.memory.designs!.comparison).not.toHaveProperty('designs');
  });

  it('rejects duplicate names, invalid names, foreign buildings and deleting the viewed version', () => {
    const state = saveDesign(initial(), 'Original'),
      id = state.memory.designs!.items[0]!.id;
    expect(() => saveDesign(state, ' original ')).toThrow('already has this name');
    expect(() => saveDesign(state, ' ')).toThrow('Give this design a name');
    expect(() => saveDesign(state, 'x'.repeat(65))).toThrow('Give this design a name');
    expect(() => removeDesign(viewDesign(state, id).document, id)).toThrow('working design');
    const foreign = structuredClone(state);
    foreign.memory.designs!.items[0]!.building.id = 'another-house';
    expect(() => viewDesign(foreign, id)).toThrow('another house');
    expect(removeDesign(state, id).memory.designs!.items).toEqual([]);
  });

  it('rejects recursive snapshot payloads and oversized saved design collections', () => {
    const saved = saveDesign(initial(), 'Original'),
      recursive = JSON.parse(JSON.stringify(saved.memory));
    recursive.designs.items[0].memory = { originals: [], designs: { items: [] } };
    expect(editMemorySchema.safeParse(recursive).success).toBe(false);
    const large = structuredClone(saved.memory),
      version = large.designs!.items[0]!.building,
      object = version.objects[0]!;
    version.objects = Array.from({ length: 1800 }, (_, index) => ({
      ...structuredClone(object),
      id: `oversized-${index}`,
      label: 'x'.repeat(160),
    }));
    const parsed = editMemorySchema.safeParse(large);
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.error.issues.some((issue) => issue.message.includes('too large'))).toBe(true);
  });
});
