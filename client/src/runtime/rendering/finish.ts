import type { Material } from '@refloor/scene';

export function sameMaterial(a: Material | undefined, b: Material | undefined): boolean {
  return (
    !!a &&
    !!b &&
    a.color === b.color &&
    a.textureId === b.textureId &&
    a.roughness === b.roughness &&
    a.metalness === b.metalness &&
    a.opacity === b.opacity
  );
}
