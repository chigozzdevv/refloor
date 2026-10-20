import type { ObjectAsset } from '@refloor/scene/object';

export const openableAngles = { fridge: 1.45, cupboard: 1.3, oven: 1.2 } as const;
export const drawerExtensionRatio = 0.55;

export function openableClearance(object: Pick<ObjectAsset, 'assetId' | 'dimensions'>) {
  const { width, height, depth } = object.dimensions;
  const common = { width, height, offsetX: 0 };
  switch (object.assetId) {
    case 'catalogue/fridge':
      return { ...common, depth: (width - 0.025) * Math.sin(openableAngles.fridge) + 0.04 };
    case 'catalogue/wardrobe':
    case 'catalogue/cabinet':
    case 'catalogue/kitchen-island': {
      const sections = Math.max(2, Math.round(width / 0.6));
      return {
        ...common,
        depth: (width / sections - 0.012) * Math.sin(openableAngles.cupboard) + 0.03,
      };
    }
    case 'catalogue/vanity':
    case 'catalogue/bedside':
      return { ...common, depth: depth * drawerExtensionRatio + 0.02 };
    case 'catalogue/kitchen-counter':
      return {
        ...common,
        width: Math.min(width, 0.62),
        offsetX: width * 0.23,
        height: height * 0.76 * 0.72,
        depth: height * 0.76 * 0.5 * Math.sin(openableAngles.oven) + 0.03,
      };
    default:
      return null;
  }
}
