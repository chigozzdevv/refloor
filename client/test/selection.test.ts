import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { targetIdentity } from '@/shared/editor/identity';
import { selectedContext } from '@/shared/editor/chat-context';

describe('selected element identity', () => {
  it('keeps identical fixture names tied to their actual rooms and floors', () => {
    const building = createHouse({ id: 'labelled', name: 'Labelled', storeys: 2 });
    for (const object of building.objects.filter((item) => item.assetId === 'catalogue/pendant')) {
      const context = selectedContext(building, { kind: 'object', id: object.id }),
        floor = building.floors.find((item) => item.id === object.floorId)!,
        room = floor.rooms.find((item) => item.id === object.roomId)!;
      expect(context?.object?.id).toBe(object.id);
      expect(context?.label).toBe('Opal pendant');
      expect(context?.location).toBe(`${room.name} · ${floor.name}`);
      expect(context?.position.y).toBeCloseTo(
        floor.elevation + object.position.y + object.dimensions.height / 2,
      );
    }
    expect(selectedContext(building, { kind: 'object', id: 'missing' })).toBeNull();
  });

  it('distinguishes duplicate items in the same room independently of array ordering', () => {
    const building = createHouse({ id: 'duplicates', name: 'Duplicates', storeys: 1 }),
      object = building.objects.find((item) => item.kind === 'light')!,
      duplicate = { ...structuredClone(object), id: `${object.id}-extra` };
    building.objects.push(duplicate);
    const first = targetIdentity(building, { kind: 'object', id: object.id }),
      second = targetIdentity(building, { kind: 'object', id: duplicate.id });
    expect(first?.label).not.toBe(second?.label);
    building.objects.reverse();
    expect(targetIdentity(building, { kind: 'object', id: object.id })).toEqual(first);
    expect(targetIdentity(building, { kind: 'object', id: duplicate.id })).toEqual(second);
  });

  it('labels a selected room floor and door with their location', () => {
    const building = createHouse({ id: 'surfaces', name: 'Surfaces', storeys: 1 }),
      floor = building.floors[0]!,
      room = floor.rooms[0]!;
    expect(targetIdentity(building, { kind: 'floor', id: room.id })).toEqual({
      label: `${room.name} floor`,
      location: floor.name,
    });
    const door = floor.walls.flatMap((wall) => wall.openings).find((item) => item.kind === 'door')!;
    expect(targetIdentity(building, { kind: 'door', id: door.id })).toMatchObject({
      location: floor.name,
    });
    expect(targetIdentity(building, { kind: 'door', id: door.id })?.label).toContain('door');
  });
});
