import type { BufferGeometry } from 'three';

export function applyMetricUVs(geometry: BufferGeometry) {
  const position = geometry.getAttribute('position'),
    normal = geometry.getAttribute('normal'),
    uv = geometry.getAttribute('uv');
  if (!position || !normal || !uv) return geometry;
  for (let index = 0; index < position.count; index++) {
    const x = Math.abs(normal.getX(index)),
      y = Math.abs(normal.getY(index)),
      z = Math.abs(normal.getZ(index));
    if (y >= x && y >= z) uv.setXY(index, position.getX(index), position.getZ(index));
    else if (x >= z) uv.setXY(index, position.getZ(index), position.getY(index));
    else uv.setXY(index, position.getX(index), position.getY(index));
  }
  uv.needsUpdate = true;
  return geometry;
}
