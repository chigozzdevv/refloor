import type { CompiledBuilding, NavigationPoint } from '@refloor/engine';
import { contains } from '@refloor/engine/math';

export function currentRoom(compiled: CompiledBuilding, player: NavigationPoint | null) {
  if (!player) return null;
  return (
    compiled.building.floors
      .find((floor) => floor.id === player.floorId)
      ?.rooms.find((room) => contains(room.footprint, player.position)) ?? null
  );
}
