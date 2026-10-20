import type { RoomRequirement } from '@refloor/server/shared/planning/requirements';

const depths = {
  living: 4.8,
  dining: 3.8,
  kitchen: 3.8,
  bedroom: 3.8,
  bathroom: 3.2,
  workspace: 3.4,
};
const combinedDepths = { living: 4.4, dining: 3.4, kitchen: 3.8 };

export function combinedSideBySide(room: RoomRequirement, width: number): boolean {
  return room.uses.length > 1 && width + 1e-6 >= room.uses.length * 4.2;
}

export function zoneMinimumDepth(use: RoomRequirement['uses'][number]): number {
  return combinedDepths[use as keyof typeof combinedDepths] ?? depths[use];
}

export function minimumDepth(room: RoomRequirement, width = 0): number {
  const base =
    room.uses.length === 1 || combinedSideBySide(room, width)
      ? Math.max(...room.uses.map((use) => depths[use]))
      : room.uses.reduce((sum, use) => sum + zoneMinimumDepth(use), 0);
  const requested = base + (room.size === 'spacious' ? 1 : room.size === 'compact' ? 0 : 0.4),
    needsFrontWardrobe = room.uses.includes('bedroom') && width > 0 && width < 5.6;
  return Math.round(Math.max(requested, needsFrontWardrobe ? 4.5 : 0) * 10);
}
