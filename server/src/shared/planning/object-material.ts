import { getCatalogueEntry } from '@refloor/catalogue';
import { getObjectAsset } from '@refloor/scene';
import type { Material, SceneCommand, SceneObject } from '@refloor/scene';

export function objectMaterial(object: SceneObject, slot: string) {
  const entry = getCatalogueEntry(object.assetId);
  return (
    object.materials[slot] ??
    (entry.optionalMaterials?.includes(slot) ? entry.materials[slot] : undefined)
  );
}

export function objectMaterialCommand(
  object: SceneObject,
  slot: string,
  material: Material,
): SceneCommand {
  if (!objectMaterial(object, slot)) throw new Error('That surface is unavailable on this item.');
  if (object.materials[slot])
    return { type: 'set-object-material', objectId: object.id, slot, material };
  const asset = structuredClone(getObjectAsset(object));
  asset.materials[slot] = structuredClone(material);
  return { type: 'replace-object', objectId: object.id, asset };
}
