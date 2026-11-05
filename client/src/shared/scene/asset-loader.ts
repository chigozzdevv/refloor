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
import type { CompiledBuilding } from '@refloor/engine';

const surfaces: Record<string, { scale: [number, number]; maps: [string, string, string] }> = {
  'wood-floor': { scale: [1.2, 1.2], maps: ['basecolor.webp', 'normal.jpg', 'arm.webp'] },
  'wood-veneer': { scale: [1.83, 1.83], maps: ['basecolor.webp', 'normal.jpg', 'arm.webp'] },
  plaster: { scale: [1.998063, 1.998064], maps: ['basecolor.webp', 'normal.webp', 'arm.jpg'] },
  fabric: { scale: [0.263603, 0.2638], maps: ['basecolor.webp', 'normal.webp', 'arm.webp'] },
  brick: { scale: [1.12, 1.12], maps: ['basecolor.webp', 'normal.jpg', 'arm.jpg'] },
  marble: { scale: [1.5, 1.5], maps: ['basecolor.webp', 'normal.jpg', 'arm.jpg'] },
  'marble-slab': { scale: [1.5, 1.5], maps: ['basecolor.webp', 'normal.webp', 'arm.jpg'] },
  'roof-asphalt': { scale: [20, 20], maps: ['basecolor.webp', 'normal.jpg', 'arm.jpg'] },
  'metal-roof': { scale: [2, 2], maps: ['basecolor.webp', 'normal.jpg', 'arm.webp'] },
};

const textureUrls = (id: string) => surfaces[id]!.maps.map((name) => `/textures/${id}/${name}`);

export function preloadSurfaces(compiled: CompiledBuilding) {
  const materials = [
    ...compiled.parts.flatMap((part) => [
      part.material,
      ...(part.exterior ? [part.exterior.material] : []),
    ]),
    ...compiled.building.objects.flatMap((object) => Object.values(object.materials)),
  ];
  const ids = new Set(
    materials.flatMap((material) =>
      material.textureId && Object.hasOwn(surfaces, material.textureId) ? [material.textureId] : [],
    ),
  );
  // Match useSurface's loader keys so the preload reuses the same texture instances.
  for (const id of ids) useTexture.preload(textureUrls(id));
}

export function useSurface(finish: Material, glass = false): MeshPhysicalMaterial {
  const { textureId: id, color, roughness, metalness, opacity } = finish;
  if (id !== null && !Object.hasOwn(surfaces, id))
    throw new Error(`Surface texture is unavailable: ${id}`);
  const [base, normal, arm] = useTexture(id ? textureUrls(id) : []);
  const result = useMemo(() => {
    const cloned = [base, normal, arm].flatMap((texture, index) => {
      if (!texture) return [];
      const copy = texture.clone();
      copy.wrapS = copy.wrapT = RepeatWrapping;
      copy.colorSpace = index === 0 ? SRGBColorSpace : NoColorSpace;
      const [width, depth] = surfaces[id ?? '']?.scale ?? [1, 1];
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
