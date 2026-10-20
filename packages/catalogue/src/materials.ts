import type { Material } from '@refloor/scene';

export function finish(
  color: string,
  textureId: string | null = null,
  roughness = 0.8,
  metalness = 0,
): Material {
  return { color, textureId, roughness, metalness, opacity: 1 };
}

export const finishes = {
  chalk: finish('#f5f1e8', 'plaster', 0.9),
  sand: finish('#dfd3bc', 'plaster', 0.88),
  sage: finish('#a5af97', 'plaster', 0.88),
  clay: finish('#bd8770', 'plaster', 0.88),
  ink: finish('#41433e', 'plaster', 0.85),
  oak: finish('#f2dfbf', 'wood-floor', 0.68),
  walnut: finish('#a88763', 'wood-floor', 0.65),
  oakVeneer: finish('#f2dfbf', 'wood-veneer', 0.58),
  walnutVeneer: finish('#9c7854', 'wood-veneer', 0.56),
  linen: finish('#eee5d4', 'fabric', 0.94),
  olive: finish('#858b69', 'fabric', 0.94),
  tobacco: finish('#a17e58', 'fabric', 0.92),
  brass: finish('#c4a36a', null, 0.3, 0.85),
  black: finish('#20211e', null, 0.35, 0.25),
  glass: { ...finish('#e4eee9', null, 0.08), opacity: 0.16 },
  brick: finish('#ffffff', 'brick', 0.9),
  marble: finish('#ffffff', 'marble', 0.32),
  marbleSlab: finish('#ffffff', 'marble-slab', 0.35),
  asphalt: finish('#ffffff', 'roof-asphalt', 0.95),
  metalRoof: finish('#a9afb3', 'metal-roof', 0.42, 1),
};

export const wallFinishes = ['chalk', 'sand', 'sage', 'clay', 'ink'] as const;
export const fabricFinishes = ['linen', 'olive', 'tobacco'] as const;
export const woodFinishes = ['oak', 'walnut'] as const;
