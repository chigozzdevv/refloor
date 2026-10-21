import { describe, expect, it } from 'vitest';
import { applyCommands } from '@refloor/scene';
import { validateBuilding, isPlayerPositionValid } from '@refloor/engine';
import {
  canSwingAroundPlayers,
  sharedPlayersClear,
} from '@refloor/engine/validation/shared-players';
import { rotate } from '@refloor/engine/math';
import { createBuilding } from '@scene-test/fixtures';

describe('shared walking clearance', () => {
  const building = createBuilding();
  building.objects = [];
  const closed = validateBuilding(building);
  const opened = validateBuilding(
    applyCommands(closed.building, {
      id: 'open',
      at: new Date(0).toISOString(),
      expectedRevision: 0,
      commands: [{ type: 'set-door', doorId: 'entrance', open: true }],
    }).building,
  );
  it('keeps a door open while another person occupies its swept path', () => {
    const door = opened.doors.find((value) => value.id === 'entrance')!;
    const offset = rotate({ x: door.width * 0.6, z: 0 }, door.rotation + door.openingAngle * 0.5);
    const person = {
      floorId: door.floorId,
      position: { x: door.hinge.x + offset.x, y: 0, z: door.hinge.z + offset.z },
    };
    expect(isPlayerPositionValid(opened, person)).toBe(true);
    expect(canSwingAroundPlayers(opened, door.id, false, [person])).toBe(false);
    expect(sharedPlayersClear(opened, closed, [person])).toBe(false);
    expect(canSwingAroundPlayers(opened, door.id, false, [])).toBe(true);
  });
  it('does not let an edit remove another person’s floor support', () => {
    expect(
      sharedPlayersClear(closed, opened, [
        { floorId: 'missing-floor', position: { x: 2, y: 0, z: 2 } },
      ]),
    ).toBe(false);
  });
});
