import { beforeAll, describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { applyCommands } from '@refloor/scene';
import { createEditMemory, recordTransition } from '@refloor/scene/edit-memory';
import { compileBuilding } from '@refloor/engine';
import { contains } from '@refloor/engine/math';
import { destinations, navigationFor } from '@/shared/navigation/destinations';
import { CharacterWorld, initializePhysics } from '@/shared/navigation/physics-world';
import { TourDoors } from '@/shared/navigation/tour-doors';
import { planDoor } from '@/shared/navigation/floor-plan';

beforeAll(initializePhysics);

describe('navigation details', () => {
  it('closes a tour-opened door only after crossing and clearing its real swing', () => {
    const before = compileBuilding(
      createHouse({ id: 'close-tour-door', name: 'Tour doors', storeys: 2 }),
    );
    const room = before.building.floors[1]!.rooms.find((value) => value.kind === 'workspace')!;
    const stop = destinations(before).find(
      (value) => value.kind === 'door' && contains(room.footprint, value.target.position),
    )!;
    const commands = [{ type: 'set-door' as const, doorId: stop.doorId!, open: true }];
    const result = applyCommands(before.building, {
      id: 'open',
      at: new Date().toISOString(),
      expectedRevision: 0,
      commands,
    });
    const compiled = compileBuilding(result.building),
      doors = new TourDoors();
    doors.record(before, stop.approach!, commands);
    const world = new CharacterWorld(compiled, stop.approach!.position);
    try {
      expect(doors.closures(world, true)).toEqual([]);
      const door = compiled.doors.find((value) => value.id === stop.doorId)!;
      world.teleport({ ...door.hinge, y: stop.target.position.y });
      expect(doors.closures(world, false)).toEqual([]);
      const graph = navigationFor(compiled, 'current');
      const safe = graph.nodes.find(
        (node) =>
          node.floorId === stop.floorId &&
          contains(room.footprint, node.position) &&
          Math.hypot(node.position.x - door.hinge.x, node.position.z - door.hinge.z) > 2,
      )!;
      expect(safe).toBeDefined();
      world.teleport(safe.position);
      expect(doors.closures(world, true)).toEqual([
        { type: 'set-door', doorId: door.id, open: false },
      ]);
      const memory = recordTransition(createEditMemory(before.building), compiled.building, {
        revision: result.revision,
        kind: 'edit',
        label: 'Open door',
        source: 'navigation',
      });
      const recovered = new TourDoors();
      recovered.recover(compiled, memory);
      expect(recovered.closures(world, false)).toHaveLength(1);
      const manual = new TourDoors();
      manual.recover(compiled, {
        ...memory,
        transitions: memory.transitions.map((value) => ({ ...value, source: 'manual' })),
      });
      expect(manual.closures(world, false)).toEqual([]);
      const keepOpen = applyCommands(compiled.building, {
        id: 'keep-open',
        at: new Date().toISOString(),
        expectedRevision: compiled.building.revision,
        commands,
      });
      const manualMemory = recordTransition(memory, keepOpen.building, {
        revision: keepOpen.revision,
        kind: 'edit',
        label: 'Keep this door open',
        source: 'chat',
      });
      const overridden = new TourDoors();
      overridden.record(before, stop.approach!, commands);
      expect(overridden.closures(world, false, manualMemory)).toEqual([]);
      expect(planDoor(compiled.doors.find((value) => value.id === door.id)!).leafTip).toEqual(
        planDoor(door).openTip,
      );
      const closed = before.doors.find((value) => value.id === door.id)!;
      expect(planDoor(closed).leafTip).not.toEqual(planDoor(closed).openTip);
    } finally {
      world.dispose();
    }
  });
});
