import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import { planDoor, planRoomName, planWall } from '@/shared/navigation/floor-plan';

const compiled = compileBuilding(createHouse({ id: 'floor-plan', name: 'Floor plan', storeys: 2 }));

describe('floor plan geometry', () => {
  it('cuts actual doors and windows out of each wall instead of drawing room boxes', () => {
    for (const wall of compiled.building.floors.flatMap((floor) => floor.walls)) {
      const plan = planWall(wall),
        length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
      expect(
        plan.segments.reduce((sum, segment) => sum + segment.length, 0) +
          wall.openings.reduce((sum, opening) => sum + opening.width, 0),
      ).toBeCloseTo(length);
      for (const segment of plan.segments)
        for (const opening of wall.openings)
          expect(
            segment.offset >= opening.offset + opening.width - 1e-6 ||
              segment.offset + segment.length <= opening.offset + 1e-6,
          ).toBe(true);
      expect(wall.start.x + Math.cos((plan.rotation * Math.PI) / 180) * length).toBeCloseTo(
        wall.end.x,
      );
      expect(wall.start.z + Math.sin((plan.rotation * Math.PI) / 180) * length).toBeCloseTo(
        wall.end.z,
      );
    }
  });

  it('keeps door swings on their real hinges and at the correct leaf width', () => {
    for (const door of compiled.doors) {
      const leaf = compiled.parts.find(
        (part) => part.role === 'door' && part.entityId === door.id,
      )!;
      if (leaf.collider.shape !== 'box') throw new Error('Door must have a box collider');
      const width = leaf.collider.size.x,
        { openTip, radius } = planDoor(door),
        dx = openTip.x - door.hinge.x,
        dz = openTip.z - door.hinge.z;
      expect(Math.hypot(dx, dz)).toBeCloseTo(width);
      expect(radius).toBeCloseTo(width);
      expect(
        dx * (door.centre.x - door.hinge.x) * 2 + dz * (door.centre.z - door.hinge.z) * 2,
      ).toBeCloseTo(width ** 2 * Math.cos(door.openingAngle));
    }
  });

  it('uses short room names inside an already labelled floor', () => {
    expect(planRoomName('Ground-Floor Bathroom')).toBe('Bathroom');
    expect(planRoomName('Upstairs Bathroom')).toBe('Bathroom');
    expect(planRoomName('Living and Dining Room')).toBe('Living & Dining Room');
  });
});
