import { useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import {
  Color,
  DoubleSide,
  FrontSide,
  MeshPhysicalMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
} from 'three';
import type { Material } from '@refloor/scene';

const scales: Record<string, [number, number]> = {
  'wood-floor': [1.2, 1.2],
  plaster: [1.998063, 1.998064],
  fabric: [0.263603, 0.2638],
};

export function useSurface(finish: Material, glass = false): MeshPhysicalMaterial {
  const { textureId: id, color, roughness, metalness, opacity } = finish;
  if (id !== null && !Object.hasOwn(scales, id))
    throw new Error(`Surface texture is unavailable: ${id}`);
  const [base, normal, arm] = useTexture(
    id ? ['basecolor', 'normal', 'arm'].map((name) => `/assets/materials/${id}/${name}.jpg`) : [],
  );
  const result = useMemo(() => {
    const cloned = [base, normal, arm].flatMap((texture, index) => {
      if (!texture) return [];
      const copy = texture.clone();
      copy.wrapS = copy.wrapT = RepeatWrapping;
      copy.colorSpace = index === 0 ? SRGBColorSpace : NoColorSpace;
      const [width, depth] = scales[id ?? ''] ?? [1, 1];
      copy.repeat.set(1 / width, 1 / depth);
      copy.anisotropy = 8;
      copy.needsUpdate = true;
      return [copy];
    });
    const material = new MeshPhysicalMaterial({
      color: new Color(color),
      roughness,
      metalness,
      side: glass ? DoubleSide : FrontSide,
      map: cloned[0] ?? null,
      normalMap: cloned[1] ?? null,
      roughnessMap: cloned[2] ?? null,
      aoMap: cloned[2] ?? null,
      aoMapIntensity: 0.5,
      normalScale: new Vector2(id === 'plaster' ? 0.28 : 0.65, id === 'plaster' ? 0.28 : 0.65),
      sheen: id === 'fabric' ? 0.7 : 0,
      sheenRoughness: 0.85,
      sheenColor: new Color('#e8dcc6'),
      clearcoat: id === 'wood-floor' ? 0.12 : 0,
      clearcoatRoughness: 0.45,
      transmission: glass ? 0.94 : 0,
      thickness: glass ? 0.015 : 0,
      ior: glass ? 1.5 : 1.45,
      transparent: !glass && opacity < 1,
      opacity: glass ? 1 : opacity,
      envMapIntensity: glass ? 1 : 0.65,
    });
    return { material, cloned };
  }, [color, roughness, metalness, opacity, glass, id, base, normal, arm]);
  useEffect(
    () => () => {
      result.material.dispose();
      result.cloned.forEach((texture) => texture.dispose());
    },
    [result],
  );
  return result.material;
}
