import { PlaneGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export type FurnitureSize = [number, number, number];

export function roundedFurnitureGeometry(
  size: FurnitureSize,
  radius = 0.018,
  textureOffset: FurnitureSize = [0, 0, 0],
) {
  const geometry = new RoundedBoxGeometry(
    ...size,
    2,
    Math.min(radius, ...size.map((value) => value / 3)),
  );
  const position = geometry.getAttribute('position'),
    normal = geometry.getAttribute('normal'),
    uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) + textureOffset[0],
      y = position.getY(i) + textureOffset[1],
      z = position.getZ(i) + textureOffset[2],
      nx = Math.abs(normal.getX(i)),
      ny = Math.abs(normal.getY(i)),
      nz = Math.abs(normal.getZ(i));
    if (ny >= nx && ny >= nz) uv.setXY(i, x, z);
    else if (nx >= nz) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
  }
  return geometry;
}

export function duvetGeometry(width: number, depth: number) {
  const geometry = new PlaneGeometry(width - 0.05, depth * 0.75, 24, 28);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position'),
    uv = geometry.getAttribute('uv'),
    halfWidth = (width - 0.05) / 2,
    halfDepth = (depth * 0.75) / 2;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      z = position.getZ(i),
      side = Math.max(0, (Math.abs(x) - halfWidth * 0.78) / (halfWidth * 0.22)),
      foot = Math.max(0, (z - halfDepth * 0.77) / (halfDepth * 0.23)),
      fold = Math.sin(x * 27 + z * 2.8) * 0.005 + Math.sin(z * 21 - x * 3.4) * 0.003;
    position.setY(i, -0.21 * side * side - 0.19 * foot * foot + fold);
    uv.setXY(i, x, z);
  }
  geometry.computeVertexNormals();
  return geometry;
}
