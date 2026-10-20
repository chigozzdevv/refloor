import { getCatalogueEntry } from '@refloor/catalogue/furniture';

export type MountingSurface = 'floor' | 'wall' | 'ceiling' | 'tabletop';
export type PlacementProfile = {
  mount: MountingSurface;
  supports: MountingSurface[];
  location: 'interior' | 'exterior';
  supportsObjects: boolean;
};

export function placementProfile(assetId: string): PlacementProfile {
  const { renderer } = getCatalogueEntry(assetId);
  if (renderer === 'floodlight' || renderer === 'wall-light')
    return { mount: 'wall', supports: ['wall'], location: 'exterior', supportsObjects: false };
  if (renderer === 'television' || renderer === 'mirror')
    return { mount: 'wall', supports: ['wall'], location: 'interior', supportsObjects: false };
  if (renderer === 'pendant')
    return {
      mount: 'ceiling',
      supports: ['ceiling'],
      location: 'interior',
      supportsObjects: false,
    };
  return {
    mount: 'floor',
    supports: renderer === 'plant' ? ['floor', 'tabletop'] : ['floor'],
    location: renderer === 'outdoor-planter' ? 'exterior' : 'interior',
    supportsObjects: [
      'coffee-table',
      'desk',
      'dining-table',
      'cabinet',
      'bedside',
      'island',
    ].includes(renderer),
  };
}
