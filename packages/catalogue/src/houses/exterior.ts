import type { Building } from '@refloor/scene';
import { compileBuilding } from '@refloor/engine';
import { contains, rotate } from '@refloor/engine/math';
import { assetFromCatalogue } from '@refloor/catalogue/furniture';

export function furnishExterior(building: Building) {
  const compiled = compileBuilding(building);
  const ground = building.floors.reduce((a, b) => (a.elevation < b.elevation ? a : b));
  for (const door of compiled.doors.filter((value) => value.floorId === ground.id))
    for (const sign of [-1, 1]) {
      const outward = rotate({ x: 0, z: sign }, door.rotation);
      const inside = { x: door.centre.x - outward.x * 0.5, z: door.centre.z - outward.z * 0.5 };
      if (
        contains(ground.footprint, {
          x: door.centre.x + outward.x * 0.5,
          z: door.centre.z + outward.z * 0.5,
        }) ||
        !contains(ground.footprint, inside)
      )
        continue;
      const room = ground.rooms.find((value) => contains(value.footprint, inside));
      if (!room) continue;
      for (const side of [-1, 1]) {
        const id = `site/floodlight-${side < 0 ? 'left' : 'right'}`;
        if (building.objects.some((object) => object.id === id)) continue;
        const fixture = assetFromCatalogue('catalogue/floodlight');
        building.objects.push({
          ...fixture,
          id,
          label: `${side < 0 ? 'Left' : 'Right'} entrance floodlight`,
          floorId: ground.id,
          roomId: room.id,
          placement: 'exterior',
          position: {
            x: door.centre.x + outward.z * side * 1.8 + outward.x * 0.28,
            y: 2.4,
            z: door.centre.z - outward.x * side * 1.8 + outward.z * 0.28,
          },
          rotation: Math.atan2(outward.x, outward.z),
        });
      }
      return;
    }
}
