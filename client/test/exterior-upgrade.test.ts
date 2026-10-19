import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { finishes } from '@refloor/catalogue';
import { compileBuilding } from '@refloor/engine';
import { createEditMemory } from '@refloor/scene/edit-memory';
import { fingerprintBuilding } from '@refloor/scene';
import { editDocument, reverseDocument } from '@/shared/editor/document';
import { exteriorUpgradeCommands } from '@/shared/editor/exterior-upgrade';
import { decodeDraft, encodeDraft } from '@/shared/scene/draft-codec';

function oldHouse() {
  const building = structuredClone(
    createHouse({ id: 'old-exterior', name: 'Old exterior', storeys: 2 }),
  );
  building.roof.material = structuredClone(finishes.chalk);
  building.objects = building.objects.filter(
    (object) => !['catalogue/wall-light', 'catalogue/outdoor-planter'].includes(object.assetId),
  );
  return building;
}

describe('saved exterior upgrade', () => {
  it('adds editable fixtures and roofing as one reversible revision without changing the rooms', () => {
    const building = oldHouse(),
      state = {
        compiled: compileBuilding(building),
        memory: createEditMemory(building),
        past: [],
        future: [],
      },
      commands = exteriorUpgradeCommands(building, state.memory),
      changed = editDocument(state, commands, undefined, {
        label: 'Add editable exterior fixtures',
      });
    expect(commands.filter((command) => command.type === 'add-object')).toHaveLength(4);
    expect(changed.compiled.building.floors).toEqual(building.floors);
    expect(changed.compiled.building.roof.material.textureId).toBe('roof-asphalt');
    expect(changed.past).toHaveLength(1);
    const restored = reverseDocument(changed, 'undo');
    expect(fingerprintBuilding(restored.compiled.building)).toBe(fingerprintBuilding(building));
    expect(exteriorUpgradeCommands(restored.compiled.building, restored.memory)).toEqual([]);
    const saved = decodeDraft(encodeDraft(restored));
    expect(exteriorUpgradeCommands(saved.compiled.building, saved.memory)).toEqual([]);
  });

  it('preserves a custom roof and does not reinstall a deliberately removed planter', () => {
    const building = oldHouse();
    building.roof.material = { ...finishes.chalk, color: '#912b2b' };
    const memory = createEditMemory(building),
      commands = exteriorUpgradeCommands(building, memory);
    expect(commands.every((command) => command.type === 'add-object')).toBe(true);
    const changed = editDocument(
      { compiled: compileBuilding(building), memory, past: [], future: [] },
      commands,
    );
    const removed = editDocument(changed, [
      { type: 'remove-object', objectId: 'site/planter-left' },
    ]);
    expect(exteriorUpgradeCommands(removed.compiled.building, removed.memory)).toEqual([]);
  });

  it('leaves new houses unchanged', () => {
    const building = createHouse({ id: 'new-exterior', name: 'New exterior', storeys: 2 });
    expect(exteriorUpgradeCommands(building, createEditMemory(building))).toEqual([]);
  });
});
