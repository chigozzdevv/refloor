import { describe, expect, it } from 'vitest';
import { applyCommands, undoRevision } from '@refloor/scene';
import { createBuilding, createTwoStorey, edit, first } from '@scene-test/fixtures';

const metadata = { id: 'undo-structure', at: '2026-10-20T12:00:00Z' };

describe('bounded structural commands', () => {
  it('relocates and resizes a door while retaining its identity, finish, hinge, swing and state', () => {
    const original = createBuilding(),
      wall = first(original.floors).walls.find((value) => value.id === 'partition')!,
      door = first(wall.openings);
    if (door.kind !== 'door') throw new Error('Door fixture missing');
    door.state.open = true;
    original.rules = [
      {
        id: 'entrance-light',
        label: 'Door powers light',
        enabled: true,
        trigger: { kind: 'door', doorId: door.id, open: true },
        conditions: [],
        actions: [{ type: 'set-light', objectId: 'lamp', state: { powered: true } }],
      },
    ];
    const result = applyCommands(
      original,
      edit([
        {
          type: 'set-opening',
          wallId: wall.id,
          openingId: door.id,
          offset: 3.1,
          width: 1.1,
          height: 2.2,
          sill: null,
        },
      ]),
    );
    const moved = first(result.building.floors).walls.find((value) => value.id === wall.id)!
      .openings[0]!;
    expect(moved).toEqual({ ...door, offset: 3.1, width: 1.1, height: 2.2 });
    expect(result.building.rules).toEqual(original.rules);
    expect(undoRevision(result.building, result.revision, metadata).building).toEqual({
      ...original,
      revision: 2,
    });
  });

  it('changes a window opening and restores its exact sill and geometry after JSON round trips', () => {
    const original = createBuilding(),
      result = applyCommands(
        original,
        edit([
          {
            type: 'set-opening',
            wallId: 'south',
            openingId: 'window',
            offset: 7.2,
            width: 1.8,
            height: 1.2,
            sill: 0.9,
          },
        ]),
      );
    expect(first(result.building.floors).walls[0]!.openings[1]).toMatchObject({
      id: 'window',
      kind: 'window',
      offset: 7.2,
      width: 1.8,
      height: 1.2,
      sill: 0.9,
    });
    expect(
      undoRevision(
        JSON.parse(JSON.stringify(result.building)),
        JSON.parse(JSON.stringify(result.revision)),
        metadata,
      ).building,
    ).toEqual({ ...original, revision: 2 });
  });

  it('moves a shared wall, resizes both rooms and preserves exact fractional bounds when undone', () => {
    const original = createBuilding(),
      floor = first(original.floors);
    floor.rooms[0]!.footprint.width = 6.1;
    floor.rooms[1]!.footprint.x = 6.1;
    floor.rooms[1]!.footprint.width = 3.9;
    const partition = floor.walls.find((value) => value.id === 'partition')!;
    partition.start.x = partition.end.x = 6.1;
    const result = applyCommands(
        original,
        edit([{ type: 'move-partition', wallId: partition.id, position: 6.3 }]),
      ),
      next = first(result.building.floors);
    expect(next.rooms[0]!.footprint.width).toBe(6.3);
    expect(next.rooms[1]!.footprint).toMatchObject({ x: 6.3, width: 3.7 });
    expect(next.walls.find((value) => value.id === partition.id)).toEqual({
      ...partition,
      start: { x: 6.3, z: 0 },
      end: { x: 6.3, z: 6 },
    });
    expect(result.building.objects).toEqual(original.objects);
    expect(next.rooms.map((room) => room.id)).toEqual(floor.rooms.map((room) => room.id));
    expect(
      undoRevision(
        JSON.parse(JSON.stringify(result.building)),
        JSON.parse(JSON.stringify(result.revision)),
        metadata,
      ).building,
    ).toEqual({ ...original, revision: 2 });
  });

  it('supports horizontal shared partitions with the same bounded room geometry rules', () => {
    const original = createBuilding();
    original.objects = [];
    const floor = first(original.floors);
    floor.footprint = { x: 0, z: 0, width: 6, depth: 10 };
    for (const room of floor.rooms)
      room.footprint = {
        x: room.footprint.z,
        z: room.footprint.x,
        width: room.footprint.depth,
        depth: room.footprint.width,
      };
    for (const wall of floor.walls) {
      wall.start = { x: wall.start.z, z: wall.start.x };
      wall.end = { x: wall.end.z, z: wall.end.x };
    }
    const result = applyCommands(
      original,
      edit([{ type: 'move-partition', wallId: 'partition', position: 6.4 }]),
    );
    expect(first(result.building.floors).rooms[0]!.footprint.depth).toBe(6.4);
    expect(first(result.building.floors).rooms[1]!.footprint.z).toBe(6.4);
    expect(undoRevision(result.building, result.revision, metadata).building).toEqual({
      ...original,
      revision: 2,
    });
  });

  it('rejects exterior walls, circulation changes and partitions containing a stairwell', () => {
    expect(() =>
      applyCommands(
        createBuilding(),
        edit([{ type: 'move-partition', wallId: 'south', position: 1 }]),
      ),
    ).toThrow('Exterior');
    const original = createBuilding();
    first(original.floors).rooms[0]!.kind = 'corridor';
    expect(() =>
      applyCommands(
        original,
        edit([{ type: 'move-partition', wallId: 'partition', position: 6.4 }]),
      ),
    ).toThrow('circulation');
    expect(() =>
      applyCommands(
        createTwoStorey(),
        edit([{ type: 'move-partition', wallId: 'partition', position: 6.4 }]),
      ),
    ).toThrow('staircase');
  });

  it('rejects intersecting facade openings, segmented joins and unrelated inverse bounds without mutating input', () => {
    const original = createBuilding(),
      before = structuredClone(original);
    expect(() =>
      applyCommands(
        original,
        edit([{ type: 'move-partition', wallId: 'partition', position: 7.3 }]),
      ),
    ).toThrow('intersect a door or window');
    expect(original).toEqual(before);
    expect(() =>
      applyCommands(
        original,
        edit([
          {
            type: 'move-partition',
            wallId: 'partition',
            position: 6.4,
            roomBounds: [
              { roomId: 'living', footprint: { x: 0, z: 0, width: 6.8, depth: 6 } },
              { roomId: 'bedroom', footprint: { x: 6.4, z: 0, width: 3.6, depth: 6 } },
            ],
          },
        ]),
      ),
    ).toThrow('must match');
    const segmented = createBuilding(),
      floor = first(segmented.floors);
    floor.walls.find((value) => value.id === 'north')!.end.x = 6;
    expect(() =>
      applyCommands(
        segmented,
        edit([{ type: 'move-partition', wallId: 'partition', position: 6.4 }]),
      ),
    ).toThrow('segmented joins');
  });

  it('rejects wrong opening kinds, unknown IDs and overlapping openings', () => {
    const opening = {
      type: 'set-opening' as const,
      wallId: 'south',
      openingId: 'entrance',
      offset: 1.2,
      width: 0.9,
      height: 2.1,
      sill: 0.8,
    };
    expect(() => applyCommands(createBuilding(), edit([opening]))).toThrow('Only windows');
    expect(() =>
      applyCommands(createBuilding(), edit([{ ...opening, openingId: 'missing', sill: null }])),
    ).toThrow('does not exist');
    expect(() =>
      applyCommands(createBuilding(), edit([{ ...opening, offset: 7.1, sill: null }])),
    ).toThrow('overlaps');
  });
});
