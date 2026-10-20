import { BoxGeometry } from 'three';
import type { BufferGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Wall } from '@refloor/scene';

export function wallDetailGeometry(wall: Wall) {
  const paint: BufferGeometry[] = [],
    wood: BufferGeometry[] = [],
    length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z),
    doors = wall.openings.filter((opening) => opening.kind === 'door'),
    cuts = [0, length, ...doors.flatMap((door) => [door.offset, door.offset + door.width])].sort(
      (a, b) => a - b,
    );
  const box = (
    target: BufferGeometry[],
    size: [number, number, number],
    position: [number, number, number],
    rounded = false,
  ) => {
    let geometry: BufferGeometry = rounded
      ? new RoundedBoxGeometry(...size, 2, 0.004)
      : new BoxGeometry(...size);
    if (geometry.index) {
      const indexed = geometry;
      geometry = geometry.toNonIndexed();
      indexed.dispose();
    }
    geometry.clearGroups();
    geometry.translate(...position);
    target.push(geometry);
  };
  for (let i = 1; i < cuts.length; i++) {
    const start = cuts[i - 1]!,
      end = cuts[i]!,
      centre = (start + end) / 2;
    if (
      end - start > 0.001 &&
      !doors.some((door) => centre > door.offset && centre < door.offset + door.width)
    )
      box(paint, [end - start, 0.11, wall.thickness + 0.022], [centre, 0.055, 0]);
  }
  for (const opening of wall.openings) {
    const target = opening.kind === 'door' ? wood : paint,
      centre = opening.offset + opening.width / 2,
      sill = opening.kind === 'window' ? opening.sill : 0;
    for (const sign of [-1, 1])
      box(
        target,
        [0.045, opening.height + 0.045, wall.thickness + 0.035],
        [centre + sign * (opening.width / 2 + 0.015), sill + opening.height / 2, 0],
        true,
      );
    box(
      target,
      [opening.width + 0.09, 0.045, wall.thickness + 0.035],
      [centre, sill + opening.height + 0.015, 0],
      true,
    );
    if (opening.kind === 'window') {
      box(paint, [opening.width + 0.14, 0.05, wall.thickness + 0.13], [centre, sill - 0.025, 0]);
      box(paint, [0.022, opening.height, 0.025], [centre, sill + opening.height / 2, 0]);
    }
  }
  const merge = (parts: BufferGeometry[]) => {
    if (!parts.length) return null;
    const result = mergeGeometries(parts, false);
    parts.forEach((part) => part.dispose());
    if (!result) throw new Error('Wall details could not be combined.');
    result.computeBoundingSphere();
    return result;
  };
  return { paint: merge(paint), wood: merge(wood) };
}
