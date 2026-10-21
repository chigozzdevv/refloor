import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { createEditGuards } from '@refloor/scene/edit-guards';
import type { SharedEdit } from '@refloor/scene/collaboration';
import { SharedOutbox } from '@/shared/collaboration/outbox';

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  };
}
const building = createHouse({ id: 'outbox-house', name: 'Outbox house', storeys: 1 });
function edit(): SharedEdit {
  const commands = [
    {
      type: 'set-roof-material' as const,
      roofId: building.roof.id,
      material: building.roof.material,
    },
  ];
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    commands,
    guards: createEditGuards(building, commands),
    label: 'Change roof',
    source: 'manual',
    player: null,
  };
}

describe('shared command recovery', () => {
  it('keeps another tab’s pending commands when this tab is empty or accepts its own command', () => {
    const saved = storage(),
      first = new SharedOutbox('house', 'owner', saved),
      second = new SharedOutbox('house', 'owner', saved);
    expect(first.load()).toEqual([]);
    expect(second.load()).toEqual([]);
    const a = edit(),
      b = edit();
    first.add(a);
    second.remove([]);
    expect(new SharedOutbox('house', 'owner', saved).load()).toEqual([a]);
    second.add(b);
    second.remove([b.id]);
    expect(first.load()).toEqual([a]);
    first.remove([a.id]);
    expect(second.load()).toEqual([]);
  });
  it('retains command order across reloads even when request timestamps match', () => {
    const saved = storage(),
      box = new SharedOutbox('house', 'owner', saved),
      a = edit(),
      b = { ...edit(), at: edit().at };
    b.at = a.at;
    box.add(a);
    box.add(b);
    expect(new SharedOutbox('house', 'owner', saved).load().map((item) => item.id)).toEqual([
      a.id,
      b.id,
    ]);
  });
  it('migrates the old queue without overwriting a newer tab’s entries', () => {
    const saved = storage(),
      a = edit(),
      b = edit(),
      box = new SharedOutbox('house', 'owner', saved);
    box.add(a);
    saved.setItem('refloor.outbox.house.owner', JSON.stringify([b]));
    expect(box.load()).toEqual([a, b]);
    expect(saved.getItem('refloor.outbox.house.owner')).toBeNull();
    expect(new SharedOutbox('another', 'owner', saved).load()).toEqual([]);
    expect(new SharedOutbox('house', 'other', saved).load()).toEqual([]);
  });
  it('does not silently overwrite a different request or discard unreadable recovery data', () => {
    const saved = storage(),
      box = new SharedOutbox('house', 'owner', saved),
      a = edit();
    box.add(a);
    expect(() => box.add({ ...a, label: 'Different' })).toThrow('another request');
    const key = saved.key(0)!;
    saved.setItem(key, 'broken');
    expect(() => box.load()).toThrow();
    expect(saved.getItem(key)).toBe('broken');
  });
});
