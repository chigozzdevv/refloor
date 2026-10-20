import type { Building } from '@refloor/scene';
import { getCatalogueEntry } from '@refloor/catalogue/furniture';

const textures = new Set([
  'wood-floor',
  'wood-veneer',
  'fabric',
  'plaster',
  'brick',
  'marble',
  'marble-slab',
  'roof-asphalt',
  'metal-roof',
]);

export function validateBuildingAssets(building: Building) {
  const materials = [
    ...building.floors.flatMap((floor) => [
      ...floor.rooms.map((room) => room.floorMaterial),
      ...floor.walls.flatMap((wall) => [
        wall.material,
        ...(wall.exteriorMaterial ? [wall.exteriorMaterial] : []),
        ...wall.openings.map((opening) => opening.material),
      ]),
    ]),
    building.roof.material,
    ...Object.values(building.siteMaterials ?? {}).filter((material) => material !== undefined),
    ...building.objects.flatMap((object) => Object.values(object.materials)),
    ...building.stairs.map((stair) => stair.material),
  ];
  for (const material of materials)
    if (material.textureId && !textures.has(material.textureId))
      throw new Error(`This project uses an unavailable texture: ${material.textureId}`);
  for (const object of building.objects) {
    const entry = getCatalogueEntry(object.assetId);
    if (
      object.kind !== entry.kind ||
      Object.keys(entry.materials).some(
        (slot) => !object.materials[slot] && !entry.optionalMaterials?.includes(slot),
      ) ||
      object.behaviours
        .map((value) => value.kind)
        .sort()
        .join(',') !==
        entry.behaviours
          .map((value) => value.kind)
          .sort()
          .join(',')
    )
      throw new Error(`This project uses an incompatible object definition: ${object.label}`);
    const television = object.behaviours.find((value) => value.kind === 'television');
    const assetTelevision = entry.behaviours.find((value) => value.kind === 'television');
    if (television && television.screenNode !== assetTelevision?.screenNode)
      throw new Error(`This television uses an unavailable screen: ${television.screenNode}`);
    if (
      television?.state.source &&
      television.state.source !== 'asset:waterfall' &&
      !/^https?:\/\//i.test(television.state.source)
    )
      throw new Error('This project refers to an unavailable video asset.');
  }
}
