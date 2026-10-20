import type { Footprint } from '@refloor/scene';
import type { RoomRequirement } from '@refloor/server/shared/planning/requirements';
import { combinedSideBySide, zoneMinimumDepth } from '@refloor/server/shared/planning/constraints';

export type RoomZone = {
  use: RoomRequirement['uses'][number];
  footprint: Footprint;
  facing: 'front' | 'rear';
};

export function roomZones(room: RoomRequirement, footprint: Footprint): RoomZone[] {
  if (room.uses.length === 1) return [{ use: room.uses[0]!, footprint, facing: 'rear' }];
  const order = ['dining', 'living', 'kitchen'] as const;
  if (combinedSideBySide(room, footprint.width)) {
    const uses = order.filter((use) => room.uses.includes(use)),
      width = footprint.width / uses.length;
    return uses.map((use, index) => ({
      use,
      footprint: { ...footprint, x: footprint.x + index * width, width },
      facing: 'rear',
    }));
  }
  const uses = (['living', 'dining', 'kitchen'] as const).filter((use) => room.uses.includes(use)),
    minimum = uses.reduce((sum, use) => sum + zoneMinimumDepth(use), 0),
    spare = Math.max(0, footprint.depth - minimum);
  let z = footprint.z;
  return uses.map((use, index) => {
    const depth = zoneMinimumDepth(use) + spare / uses.length,
      zone = {
        use,
        footprint: { ...footprint, z, depth },
        facing: index === 0 && use === 'living' ? ('front' as const) : ('rear' as const),
      };
    z += depth;
    return zone;
  });
}
