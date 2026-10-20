import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Shoot = { from: Vector3; to: Vector3; radius: number };
const up = new Vector3(0, 1, 0);
const random = (seed: number) => {
  const value = Math.sin(seed * 91.345 + 17.837) * 4758.5453;
  return value - Math.floor(value);
};

function treeShoots() {
  const shoots: Shoot[] = [
    { from: new Vector3(), to: new Vector3(0.03, 1.15, -0.02), radius: 0.073 },
  ];
  for (let leader = 0; leader < 5; leader++) {
    const angle = leader * 2.399 + 0.3,
      start = new Vector3(0.02, 0.82 + leader * 0.07, 0),
      end = new Vector3(
        Math.cos(angle) * (0.32 + random(leader + 8) * 0.23),
        2.65 + random(leader + 9) * 0.45,
        Math.sin(angle) * 0.48,
      );
    shoots.push({ from: start, to: end, radius: 0.026 - leader * 0.002 });
    for (let twig = 0; twig < 6; twig++) {
      const seed = leader * 71 + twig * 13,
        at = start.clone().lerp(end, 0.45 + twig * 0.085),
        bearing = angle + (twig % 2 ? 1 : -1) * (0.55 + random(seed + 3) * 0.65),
        reach = 0.32 + random(seed + 4) * 0.38,
        tip = at
          .clone()
          .add(
            new Vector3(
              Math.cos(bearing) * reach,
              0.18 + random(seed + 5) * 0.24,
              Math.sin(bearing) * reach,
            ),
          );
      shoots.push({ from: at, to: tip, radius: 0.008 + random(seed + 6) * 0.004 });
    }
  }
  return shoots;
}

function shrubShoots() {
  const shoots: Shoot[] = [];
  for (let stem = 0; stem < 10; stem++) {
    const angle = stem * 2.399,
      reach = 0.3 + random(stem + 21) * 0.39,
      start = new Vector3(Math.cos(angle) * 0.12, -0.72, Math.sin(angle) * 0.12),
      end = new Vector3(
        Math.cos(angle) * reach,
        0.3 + random(stem + 22) * 0.45,
        Math.sin(angle) * reach,
      );
    shoots.push({ from: start, to: end, radius: 0.018 });
    for (let twig = 0; twig < 3; twig++) {
      const at = start.clone().lerp(end, 0.55 + twig * 0.15),
        bearing = angle + (twig % 2 ? 1 : -1) * 0.65,
        tip = at.clone().add(new Vector3(Math.cos(bearing) * 0.2, 0.13, Math.sin(bearing) * 0.2));
      shoots.push({ from: at, to: tip, radius: 0.007 });
    }
  }
  return shoots;
}

function branchGeometry(shoots: Shoot[]) {
  const geometries = shoots.map(({ from, to, radius }) => {
    const direction = to.clone().sub(from),
      centre = from.clone().lerp(to, 0.5);
    return new CylinderGeometry(radius * 0.35, radius, direction.length(), 5, 1, true)
      .applyQuaternion(new Quaternion().setFromUnitVectors(up, direction.normalize()))
      .translate(centre.x, centre.y, centre.z);
  });
  const geometry = mergeGeometries(geometries);
  geometries.forEach((part) => part.dispose());
  if (!geometry) throw new Error('Landscape branches could not be assembled.');
  return geometry;
}

function leafGeometry(shoots: Shoot[], tree: boolean, quality: 'high' | 'balanced') {
  const positions: number[] = [],
    colors: number[] = [],
    tips = shoots.filter((_shoot, index) => (tree ? index > 0 && (index - 1) % 7 !== 0 : true)),
    leaf = new Vector3(),
    direction = new Vector3(),
    rotation = new Quaternion(),
    roll = new Quaternion(),
    color = new Color();
  tips.forEach((shoot, shootIndex) => {
    const count = tree ? 34 : 3;
    for (let index = 0; index < count; index++) {
      if (quality === 'balanced' && index % 2 !== 0) continue;
      const seed = shootIndex * 151 + index * 17,
        bearing = index * 2.399 + random(seed + 1),
        reach = tree ? 0.12 + random(seed + 2) * 0.22 : random(seed + 2) * 0.11,
        at = shoot.from
          .clone()
          .lerp(shoot.to, tree ? 0.48 + random(seed + 3) * 0.66 : 0.65 + random(seed + 3) * 0.38),
        length = tree ? 0.105 + random(seed + 4) * 0.085 : 0.15 + random(seed + 4) * 0.08,
        width = length * (tree ? 0.3 : 0.38),
        curl = length * 0.12,
        outline = [
          [0, 0, 0],
          [-width, length * 0.3, 0],
          [-width * 0.68, length * 0.72, 0],
          [0, length, 0],
          [width * 0.68, length * 0.72, 0],
          [width, length * 0.3, 0],
        ];
      at.add(
        new Vector3(
          Math.cos(bearing) * reach,
          (random(seed + 5) - 0.5) * (tree ? 0.27 : 0.12),
          Math.sin(bearing) * reach,
        ),
      );
      direction.set(Math.cos(bearing), 0.1 + random(seed + 6) * 0.7, Math.sin(bearing)).normalize();
      rotation.setFromUnitVectors(up, direction);
      roll.setFromAxisAngle(up, (random(seed + 7) - 0.5) * 2.3);
      rotation.multiply(roll);
      const shade = 0.65 + random(seed + 8) * 0.55;
      for (let side = 0; side < outline.length; side++) {
        const a = outline[side]!,
          b = outline[(side + 1) % outline.length]!;
        for (const [pointIndex, point] of [
          [0, [0, length * 0.47, curl]],
          [1, a],
          [2, b],
        ] as const) {
          leaf.set(point[0]!, point[1]!, point[2]!).applyQuaternion(rotation).add(at);
          positions.push(leaf.x, leaf.y, leaf.z);
          color.setRGB(shade * (pointIndex ? 0.9 : 1.03), shade, shade * 0.84);
          colors.push(color.r, color.g, color.b);
        }
      }
    }
  });
  const geometry = new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute(positions, 3))
    .setAttribute('color', new Float32BufferAttribute(colors, 3));
  const points = geometry.getAttribute('position');
  for (let index = 0; index < points.count; index++) {
    const radius = Math.hypot(points.getX(index), points.getZ(index)),
      scale = Math.min(1, (tree ? 1.4 : 1.02) / radius);
    points.setXYZ(
      index,
      points.getX(index) * scale,
      points.getY(index),
      points.getZ(index) * scale,
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function landscapeFoliage(quality: 'high' | 'balanced') {
  const trees = treeShoots(),
    shrubs = shrubShoots();
  const leaves = leafGeometry(shrubs, false, quality),
    branches = branchGeometry(shrubs.filter((_shoot, index) => index % 4 === 0)),
    stems = branches.toNonIndexed(),
    tint = new Color('#6c5940'),
    reference = new Color('#60743b'),
    colors = new Float32Array(stems.getAttribute('position').count * 3);
  branches.dispose();
  stems.deleteAttribute('uv');
  for (let index = 0; index < colors.length; index += 3) {
    colors[index] = tint.r / reference.r;
    colors[index + 1] = tint.g / reference.g;
    colors[index + 2] = tint.b / reference.b;
  }
  stems.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const shrub = mergeGeometries([leaves, stems]);
  leaves.dispose();
  stems.dispose();
  if (!shrub) throw new Error('Landscape shrub leaves could not be assembled.');
  return {
    shrubs: shrub,
    trees: leafGeometry(trees, true, quality),
    trunks: branchGeometry(trees),
  };
}
