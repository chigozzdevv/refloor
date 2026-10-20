import type { Footprint } from '@refloor/scene';
import type {
  HouseRequirements,
  RoomRequirement,
} from '@refloor/server/shared/planning/requirements';

export function roomWindows(
  room: RoomRequirement,
  footprint: Footprint,
  style: HouseRequirements['design'],
) {
  const bathroom = room.uses.includes('bathroom'),
    publicRoom = room.uses.some((use) => use === 'living' || use === 'dining'),
    kitchen = room.uses.length === 1 && room.uses[0] === 'kitchen',
    generous = style?.glazing === 'generous',
    count = publicRoom
      ? generous
        ? Math.max(2, Math.min(4, Math.round(footprint.depth / 3)))
        : footprint.depth >= 7.5
          ? Math.min(3, Math.round(footprint.depth / 4))
          : 1
      : 1,
    spacing = footprint.depth / count,
    targetWidth = bathroom
      ? 1
      : publicRoom
        ? generous
          ? 2.8
          : style?.style === 'natural-minimal'
            ? 2.6
            : 2.2
        : kitchen
          ? generous
            ? 2.2
            : 1.6
          : generous
            ? 2.4
            : 1.8,
    width = Math.min(targetWidth, spacing - 0.7);
  return Array.from({ length: count }, (_, index) => ({
    offset: footprint.z + spacing * (index + 0.5) - width / 2,
    width,
    height: bathroom ? 0.65 : kitchen ? 1.1 : publicRoom ? (generous ? 1.9 : 1.7) : 1.5,
    sill: bathroom ? 1.65 : kitchen ? 1.35 : publicRoom ? (generous ? 0.65 : 0.75) : 0.85,
  }));
}
