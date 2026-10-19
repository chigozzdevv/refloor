import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { fingerprintBuilding } from '@refloor/scene';
import { createEditMemory } from '@refloor/scene/edit-memory';
import { restoreEditMemory } from '@/shared/editor/memory';

describe('legacy exterior edit context', () => {
  it('adds a roof original when loading old memory without changing house or existing history', () => {
    const building = createHouse({ id: 'roof-memory', name: 'Roof memory', storeys: 1 }),
      fingerprint = fingerprintBuilding(building);
    const memory = createEditMemory(building);
    memory.originals = memory.originals.filter((item) => item.kind !== 'roof');
    const restored = restoreEditMemory(building, memory);
    expect(restored.originals).toContainEqual({
      kind: 'roof',
      id: building.roof.id,
      value: building.roof,
    });
    expect(restored.originals.filter((item) => item.kind !== 'roof')).toEqual(memory.originals);
    expect(restored.transitions).toEqual(memory.transitions);
    expect(fingerprintBuilding(building)).toBe(fingerprint);
    expect(restoreEditMemory(building, restored)).toEqual(restored);
  });
});
