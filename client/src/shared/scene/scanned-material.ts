import { Color, MeshStandardMaterial } from 'three';
import type { Material as ThreeMaterial } from 'three';
import type { CatalogueEntry } from '@refloor/catalogue';
import type { Material } from '@refloor/scene';
import { sameMaterial } from '@/shared/scene/finish';

export function scannedMaterial(
  source: ThreeMaterial,
  nodeName: string,
  entry: CatalogueEntry,
  appearance: Material,
  finish: ThreeMaterial,
): ThreeMaterial {
  const original = entry.materials.body,
    editable =
      (!entry.tintMaterials || entry.tintMaterials.includes(source.name)) &&
      (!entry.tintNodes || entry.tintNodes.includes(nodeName));
  if (!editable || !original || sameMaterial(appearance, original)) return source.clone();
  const replacement =
    appearance.textureId !== original.textureId ||
    appearance.roughness !== original.roughness ||
    appearance.metalness !== original.metalness ||
    appearance.opacity !== original.opacity;
  if (replacement) {
    const material = finish.clone();
    material.name = source.name;
    material.side = source.side;
    return material;
  }
  const material = source.clone();
  if (material instanceof MeshStandardMaterial) {
    const reference = new Color(original.color),
      target = new Color(appearance.color);
    // Linear colour ratios retain the scan's albedo detail when brightening dark upholstery.
    material.color.multiply(
      target.setRGB(
        target.r / Math.max(reference.r, 0.0001),
        target.g / Math.max(reference.g, 0.0001),
        target.b / Math.max(reference.b, 0.0001),
      ),
    );
  }
  return material;
}
