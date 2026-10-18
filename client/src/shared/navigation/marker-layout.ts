import type { Destination } from '@/shared/navigation/destinations';

export type ProjectedMarker = {
  destination: Destination;
  x: number;
  y: number;
  distance: number;
};

const labelWidth = (marker: ProjectedMarker) =>
  Math.max(
    44,
    Math.min(150, (marker.destination.caption ?? marker.destination.label).length * 6 + 18),
  );

export function organizeMarkers(candidates: ProjectedMarker[], width: number, height: number) {
  const ranked = candidates
    .filter(
      (value) =>
        value.x > labelWidth(value) / 2 + 8 &&
        value.x < width - labelWidth(value) / 2 - 8 &&
        value.y >
          (value.destination.kind === 'door' || value.destination.kind === 'stairs' ? 135 : 95) &&
        value.y < height - 100,
    )
    .sort(
      (a, b) =>
        Number(a.destination.kind === 'room' || a.destination.kind === 'waypoint') -
          Number(b.destination.kind === 'room' || b.destination.kind === 'waypoint') ||
        a.distance +
          Math.abs(a.x - width / 2) / width -
          (b.distance + Math.abs(b.x - width / 2) / width),
    );
  const result: ProjectedMarker[] = [];
  for (const candidate of ranked) {
    if (
      result.some(
        (placed) =>
          Math.hypot(placed.x - candidate.x, placed.y - candidate.y) < 100 ||
          (Math.abs(placed.x - candidate.x) <
            (labelWidth(placed) + labelWidth(candidate)) / 2 + 12 &&
            Math.abs(placed.y - candidate.y) < 90),
      )
    )
      continue;
    result.push(candidate);
    if (result.length === 3) break;
  }
  return result;
}
