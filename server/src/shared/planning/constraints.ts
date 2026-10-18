import type { RoomRequirement } from '@refloor/server/shared/planning/requirements';

const depths = {
  living: 4.8,
  dining: 3.8,
  kitchen: 3.8,
  bedroom: 3.8,
  bathroom: 3.2,
  workspace: 3.4,
};
export function minimumDepth(room: RoomRequirement): number {
  const base = Math.max(...room.uses.map((use) => depths[use]));
  return Math.round(
    (base +
      (room.uses.length - 1) * 3 +
      (room.size === 'spacious' ? 1 : room.size === 'compact' ? 0 : 0.4)) *
      10,
  );
}
