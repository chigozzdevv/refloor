import type { CompiledBuilding } from '@refloor/engine/types';
import { topologyKey } from '@refloor/engine/navigation/topology';

export function geometryKey(compiled: CompiledBuilding): string {
  return JSON.stringify({
    topology: topologyKey(compiled),
    rooms: compiled.building.floors.map((floor) =>
      floor.rooms.map((room) => ({
        id: room.id,
        footprint: room.footprint,
      })),
    ),
    objects: compiled.building.objects.map((object) => ({
      id: object.id,
      kind: object.kind,
      placement: object.placement,
      floorId: object.floorId,
      roomId: object.roomId,
    })),
  });
}
