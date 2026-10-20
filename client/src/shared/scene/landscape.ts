import type { exteriorLayout } from '@/shared/scene/exterior';

export type LandscapeInstance = {
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  shade: number;
};

type LandscapeBed = { x: number; z: number; width: number; depth: number };

const variation = (seed: number) => {
  const value = Math.sin(seed * 91.345 + 17.837) * 4758.5453;
  return value - Math.floor(value);
};

export function landscapeLayout(
  site: Pick<ReturnType<typeof exteriorLayout>, 'compound' | 'ground'>,
  quality: 'high' | 'balanced' = 'high',
) {
  const { x, z, width, depth } = site.compound,
    ground = site.ground.elevation - 0.205,
    bedWidth = 1.1,
    gap = 0.24,
    offset = gap + bedWidth / 2,
    beds: LandscapeBed[] = [
      { x: x - offset, z: z + depth / 2, width: bedWidth, depth },
      { x: x + width + offset, z: z + depth / 2, width: bedWidth, depth },
      { x: x + width / 2, z: z - offset, width: width + offset * 2 + bedWidth, depth: bedWidth },
      {
        x: x + width / 2,
        z: z + depth + offset,
        width: width + offset * 2 + bedWidth,
        depth: bedWidth,
      },
    ],
    shrubs: LandscapeInstance[] = [],
    grasses: LandscapeInstance[] = [],
    stones: LandscapeInstance[] = [],
    edging: LandscapeInstance[] = [];
  beds.forEach((bed, bedIndex) => {
    const horizontal = bed.width > bed.depth,
      length = horizontal ? bed.width : bed.depth,
      spacing = 1.4,
      count = Math.max(1, Math.min(17, Math.floor(length / spacing))),
      at = (along: number, across: number): [number, number, number] => [
        bed.x + (horizontal ? along : across),
        ground + 0.06,
        bed.z + (horizontal ? across : along),
      ];
    for (let index = 0; index < count; index++) {
      const seed = bedIndex * 137 + index * 11,
        along = -length / 2 + ((index + 0.5) * length) / count,
        radius = 0.31 + variation(seed + 1) * 0.09,
        shrub = at(along, (variation(seed + 2) - 0.5) * 0.08);
      shrubs.push({
        position: [shrub[0], shrub[1] + radius * 0.73, shrub[2]],
        scale: [radius, radius * (0.9 + variation(seed + 3) * 0.3), radius],
        rotation: [0, variation(seed + 4) * Math.PI * 2, 0],
        shade: variation(seed + 5),
      });
      for (const side of [-1, 1]) {
        const position = at(along + (side * length) / count / 3, side * 0.24),
          size = 0.62 + variation(seed + side + 7) * 0.38;
        grasses.push({
          position,
          scale: [size, size, size],
          rotation: [0, variation(seed + side + 8) * Math.PI * 2, 0],
          shade: variation(seed + side + 9),
        });
      }
    }
    const stoneCount = Math.min(100, Math.floor(length / 0.24));
    for (let index = 0; index < stoneCount; index++) {
      const seed = bedIndex * 197 + index * 13,
        along = -length / 2 + ((index + 0.5) * length) / stoneCount,
        position = at(along, (variation(seed + 2) - 0.5) * 0.8),
        size = 0.035 + variation(seed + 3) * 0.04;
      stones.push({
        position: [position[0], ground + 0.074, position[2]],
        scale: [size * 1.4, size * 0.65, size],
        rotation: [variation(seed + 4), variation(seed + 5) * Math.PI * 2, variation(seed + 6)],
        shade: variation(seed + 7),
      });
    }
    for (const side of [-1, 1])
      edging.push({
        position: at(0, side * (bedWidth / 2 + 0.015)),
        scale: horizontal ? [length, 0.1, 0.055] : [0.055, 0.1, length],
        rotation: [0, 0, 0],
        shade: 0.5,
      });
  });
  const trees: LandscapeInstance[] = [
    [x - 2.8, z - 2.7],
    [x + width + 2.9, z + depth + 2.5],
    [x - 2.6, z + depth + 2.8],
    [x + width + 2.7, z - 3.2],
  ].map(([treeX, treeZ], index) => {
    const size = 0.9 + variation(index + 881) * 0.25;
    return {
      position: [treeX!, ground, treeZ!],
      scale: [size, size, size],
      rotation: [0, variation(index + 889) * Math.PI * 2, 0],
      shade: variation(index + 899),
    };
  });
  return {
    ground,
    beds,
    edging,
    shrubs: quality === 'high' ? shrubs : shrubs.filter((_item, index) => index % 2 === 0),
    grasses:
      quality === 'high'
        ? grasses
        : grasses.filter((_item, index) => Math.floor(index / 2) % 2 === 0),
    stones: quality === 'high' ? stones : stones.filter((_item, index) => index % 2 === 0),
    trees,
  };
}
