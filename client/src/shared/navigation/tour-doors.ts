import type { CompiledBuilding, DoorPortal, NavigationPoint, Point3 } from '@refloor/engine';
import { rotate } from '@refloor/engine/math';
import type { SceneCommand } from '@refloor/scene';
import type { EditMemory } from '@refloor/scene/edit-memory';
import type { CharacterWorld } from '@/shared/navigation/physics-world';

const side = (door: DoorPortal, point: Point3) => {
  const normal = rotate({ x: 0, z: 1 }, door.rotation);
  return (point.x - door.centre.x) * normal.x + (point.z - door.centre.z) * normal.z;
};

export class TourDoors {
  private readonly pending = new Map<
    string,
    { original: boolean; temporary: boolean; side: number }
  >();
  clear() {
    this.pending.clear();
  }
  recover(compiled: CompiledBuilding, memory: EditMemory) {
    const latest = new Map<string, boolean>();
    for (const transition of memory.transitions)
      for (const command of transition.revision.commands) {
        if (command.type !== 'set-door') continue;
        const inverse = transition.revision.inverseCommands.find(
          (value) => value.type === 'set-door' && value.doorId === command.doorId,
        );
        latest.set(
          command.doorId,
          transition.source === 'navigation' &&
            transition.kind === 'edit' &&
            command.open &&
            inverse?.type === 'set-door' &&
            !inverse.open,
        );
      }
    for (const door of compiled.doors)
      if (
        door.open &&
        latest.get(door.id) !== false &&
        !compiled.building.rules?.some(
          (rule) =>
            rule.enabled &&
            rule.actions.some(
              (action) => action.type === 'set-door' && action.doorId === door.id && action.open,
            ),
        )
      )
        this.pending.set(door.id, { original: false, temporary: true, side: 0 });
  }
  entrance(door: DoorPortal, outside: Point3) {
    this.pending.set(door.id, {
      original: false,
      temporary: true,
      side: Math.sign(side(door, outside)),
    });
  }
  record(compiled: CompiledBuilding, from: NavigationPoint, commands: SceneCommand[]) {
    for (const command of commands) {
      if (command.type !== 'set-door') continue;
      const door = compiled.doors.find((value) => value.id === command.doorId);
      if (!door || door.open === command.open) continue;
      const original = this.pending.get(door.id)?.original ?? door.open;
      if (original === command.open) this.pending.delete(door.id);
      else
        this.pending.set(door.id, {
          original,
          temporary: command.open,
          side: Math.sign(side(door, from.position)),
        });
    }
  }
  closures(world: CharacterWorld, travelling: boolean, memory?: EditMemory): SceneCommand[] {
    const result: SceneCommand[] = [];
    for (const [id, pending] of this.pending) {
      const door = world.compiled.doors.find((value) => value.id === id);
      const latest = memory?.transitions.findLast((transition) =>
        transition.revision.commands.some(
          (command) => command.type === 'set-door' && command.doorId === id,
        ),
      );
      if (
        !door ||
        door.open !== pending.temporary ||
        (latest && (latest.source !== 'navigation' || latest.kind !== 'edit'))
      ) {
        this.pending.delete(id);
        continue;
      }
      const passed =
        world.player.floorId !== door.floorId || pending.side * side(door, world.feet) < -0.2;
      if ((!travelling || passed) && world.canSwingDoor(id, pending.original)) {
        result.push({ type: 'set-door', doorId: id, open: pending.original });
        this.pending.delete(id);
      }
    }
    return result;
  }
}
