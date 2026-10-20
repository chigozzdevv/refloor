import type { ObjectAsset, SceneObject } from '@refloor/scene';
import { finish, finishes } from '@refloor/catalogue/materials';
import { roomEssentials } from '@refloor/catalogue/essentials';

export type FurnitureRenderer =
  | 'sofa'
  | 'chair'
  | 'coffee-table'
  | 'bed'
  | 'television'
  | 'pendant'
  | 'floodlight'
  | 'wall-light'
  | 'outdoor-planter'
  | 'cabinet'
  | 'plant'
  | 'kitchen'
  | 'island'
  | 'fridge'
  | 'vanity'
  | 'toilet'
  | 'shower'
  | 'desk'
  | 'dining-table'
  | 'dining-chair'
  | 'wardrobe'
  | 'bedside'
  | 'mirror';
export type CatalogueEntry = ObjectAsset & {
  renderer: FurnitureRenderer;
  description: string;
  modelUrl?: string;
  modelRotation?: number;
  tintMaterials?: string[];
  tintNodes?: string[];
  optionalMaterials?: string[];
};

export const catalogue: CatalogueEntry[] = [
  ...roomEssentials,
  {
    assetId: 'catalogue/floodlight',
    label: 'Exterior floodlight',
    kind: 'light',
    dimensions: { width: 0.32, height: 0.22, depth: 0.18 },
    materials: { body: finishes.black, frame: finishes.black },
    behaviours: [{ kind: 'light', state: { powered: false, intensity: 20, color: '#ffe6c4' } }],
    renderer: 'floodlight',
    description: 'An adjustable exterior light for the entrance and compound.',
  },
  {
    assetId: 'catalogue/wall-light',
    label: 'Warm up and down wall light',
    kind: 'light',
    dimensions: { width: 0.2, height: 0.44, depth: 0.2 },
    materials: { body: finishes.black },
    behaviours: [{ kind: 'light', state: { powered: true, intensity: 6, color: '#ffd0a3' } }],
    renderer: 'wall-light',
    description: 'A weatherproof lantern with warm, shielded up and down wall wash beams.',
  },
  {
    assetId: 'catalogue/outdoor-planter',
    label: 'Entrance planter',
    kind: 'decor',
    dimensions: { width: 1.2, height: 1.22, depth: 0.72 },
    materials: { body: finish('#a8a798', null, 0.92) },
    behaviours: [],
    renderer: 'outdoor-planter',
    description:
      'A stone planter with real scanned foliage, suitable for the entrance and compound.',
  },
  {
    assetId: 'catalogue/sofa',
    label: 'Forma sofa',
    kind: 'sofa',
    dimensions: { width: 2.35, height: 0.88, depth: 0.98 },
    materials: { body: finishes.black },
    behaviours: [],
    renderer: 'sofa',
    description: 'Generous leather upholstery and a low profile.',
    modelUrl: '/models/furniture/sofa_02/sofa_02_1k.gltf',
  },
  {
    assetId: 'catalogue/chair',
    label: 'Arc lounge chair',
    kind: 'chair',
    dimensions: { width: 0.85, height: 0.88, depth: 0.87 },
    materials: { body: finishes.black },
    behaviours: [],
    renderer: 'chair',
    description: 'Sculpted timber and a leather seat.',
    modelUrl: '/models/furniture/modern_arm_chair_01/modern_arm_chair_01_1k.gltf',
    tintMaterials: ['modern_arm_chair_01_pillow'],
  },
  {
    assetId: 'catalogue/coffee-table',
    label: 'Sora coffee table',
    kind: 'table',
    dimensions: { width: 1.25, height: 0.42, depth: 0.68 },
    materials: { body: finishes.oak },
    behaviours: [],
    renderer: 'coffee-table',
    description: 'Low oak, softly rounded edges.',
    modelUrl: '/models/furniture/modern_coffee_table_01/modern_coffee_table_01_1k.gltf',
    modelRotation: Math.PI / 2,
  },
  {
    assetId: 'catalogue/bed',
    label: 'Linen platform bed',
    kind: 'bed',
    dimensions: { width: 1.95, height: 1.05, depth: 2.2 },
    materials: { body: finishes.linen, frame: finishes.walnutVeneer },
    behaviours: [],
    renderer: 'bed',
    description: 'A quiet frame for slow mornings.',
  },
  {
    assetId: 'catalogue/television',
    label: 'Frame television',
    kind: 'television',
    dimensions: { width: 1.42, height: 0.82, depth: 0.075 },
    materials: { body: finishes.black },
    behaviours: [
      {
        kind: 'television',
        screenNode: 'screen',
        state: { powered: false, muted: true, volume: 0.35, source: 'asset:waterfall' },
      },
    ],
    renderer: 'television',
    description: 'A slim display with real video playback.',
  },
  {
    assetId: 'catalogue/pendant',
    label: 'Opal pendant',
    kind: 'light',
    dimensions: { width: 0.42, height: 0.45, depth: 0.42 },
    materials: { body: finish('#f1eadb', null, 0.45), frame: finishes.brass },
    behaviours: [{ kind: 'light', state: { powered: true, intensity: 3, color: '#ffe6bf' } }],
    renderer: 'pendant',
    description: 'Warm light through an opal shade.',
  },
  {
    assetId: 'catalogue/cabinet',
    label: 'Linear sideboard',
    kind: 'storage',
    dimensions: { width: 1.6, height: 0.7, depth: 0.42 },
    materials: { body: finishes.oakVeneer, frame: finishes.black },
    behaviours: [],
    renderer: 'cabinet',
    description: 'Warm timber, fine shadow gaps.',
  },
  {
    assetId: 'catalogue/plant',
    label: 'Variegated houseplant',
    kind: 'decor',
    dimensions: { width: 0.7, height: 0.84, depth: 0.66 },
    materials: { body: finishes.clay },
    behaviours: [],
    renderer: 'plant',
    description: 'Variegated leaves and a terracotta pot.',
    modelUrl: '/models/furniture/potted_plant_02/potted_plant_02_1k.gltf',
    tintMaterials: ['potted_plant_02_pot'],
    tintNodes: ['potted_plant_02_pot'],
  },
];

export function getCatalogueEntry(assetId: string): CatalogueEntry {
  const entry = catalogue.find((item) => item.assetId === assetId);
  if (!entry) throw new Error(`Furniture asset is unavailable: ${assetId}`);
  return entry;
}

export function assetFromCatalogue(assetId: string): ObjectAsset {
  const entry = getCatalogueEntry(assetId);
  return structuredClone({
    assetId: entry.assetId,
    label: entry.label,
    kind: entry.kind,
    dimensions: entry.dimensions,
    materials: entry.materials,
    behaviours: entry.behaviours,
  });
}

export function createFurniture(
  assetId: string,
  placement: Pick<SceneObject, 'id' | 'floorId' | 'roomId' | 'position' | 'rotation'>,
): SceneObject {
  return { ...assetFromCatalogue(assetId), ...placement };
}
