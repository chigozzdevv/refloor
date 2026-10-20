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
  ShaderChunk,
  Vector2,
} from 'three';
import type { Material } from '@refloor/scene';

const scales: Record<string, [number, number]> = {
  'wood-floor': [1.2, 1.2],
  'wood-veneer': [1.83, 1.83],
  plaster: [1.998063, 1.998064],
  fabric: [0.263603, 0.2638],
  brick: [1.12, 1.12],
  marble: [1.5, 1.5],
  'marble-slab': [1.5, 1.5],
  'roof-asphalt': [20, 20],
  'metal-roof': [2, 2],
};

export function useSurface(finish: Material, glass = false): MeshPhysicalMaterial {
  const { textureId: id, color, roughness, metalness, opacity } = finish;
  if (id !== null && !Object.hasOwn(scales, id))
    throw new Error(`Surface texture is unavailable: ${id}`);
  const [base, normal, arm] = useTexture(
    id ? ['basecolor', 'normal', 'arm'].map((name) => `/textures/${id}/${name}.jpg`) : [],
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
      metalnessMap: id === 'metal-roof' ? (cloned[2] ?? null) : null,
      aoMap: cloned[2] ?? null,
      aoMapIntensity: 0.5,
      normalScale: new Vector2(id === 'plaster' ? 0.28 : 0.65, id === 'plaster' ? 0.28 : 0.65),
      sheen: id === 'fabric' ? 0.7 : 0,
      sheenRoughness: 0.85,
      sheenColor: new Color('#e8dcc6'),
      clearcoat:
        id === 'wood-floor' || id === 'wood-veneer'
          ? 0.12
          : id === 'marble' || id === 'marble-slab'
            ? 0.18
            : 0,
      clearcoatRoughness: 0.45,
      transmission: 0,
      thickness: 0,
      ior: glass ? 1.5 : 1.45,
      transparent: glass || opacity < 1,
      opacity,
      envMapIntensity: glass ? 1 : 0.65,
    });
    if (glass) {
      material.forceSinglePass = true;
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `float paneFresnel = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 5.0);
          diffuseColor.a = mix(diffuseColor.a, max(diffuseColor.a, 0.55), paneFresnel);
          #include <opaque_fragment>`,
        );
      };
      material.customProgramCacheKey = () => 'refloor-thin-glazing-v1';
    }
    if (id === 'metal-roof') {
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          ShaderChunk.map_fragment.replace(
            'diffuseColor *= sampledDiffuseColor;',
            'sampledDiffuseColor.rgb = vec3(dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))); diffuseColor *= sampledDiffuseColor;',
          ),
        );
      };
      material.customProgramCacheKey = () => 'refloor-tintable-metal-roof';
    }
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
