import { CatmullRomCurve3, PlaneGeometry, SphereGeometry, TubeGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export type FurnitureSize = [number, number, number];

export function pillowGeometry(width: number, height: number, depth: number) {
  const geometry = new SphereGeometry(1, 32, 20),
    position = geometry.getAttribute('position'),
    uv = geometry.getAttribute('uv'),
    soften = (value: number) => Math.sign(value) * Math.abs(value) ** 0.45;
  for (let index = 0; index < position.count; index++) {
    const x = (soften(position.getX(index)) * width) / 2,
      z = (soften(position.getZ(index)) * depth) / 2,
      y = (position.getY(index) * height) / 2,
      fold = (Math.sin(x * 42 + z * 6) * 0.002 * Math.abs(y)) / height;
    position.setXYZ(index, x, y + fold, z);
    uv.setXY(index, x, z);
  }
  geometry.computeVertexNormals();
  const points = Array.from({ length: 64 }, (_, index) => {
    const angle = (index * Math.PI * 2) / 64;
    return new Vector3(
      (soften(Math.cos(angle)) * width) / 2,
      0,
      (soften(Math.sin(angle)) * depth) / 2,
    );
  });
  return {
    body: geometry,
    seam: new TubeGeometry(new CatmullRomCurve3(points, true), 64, 0.0025, 4, true),
  };
}

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
