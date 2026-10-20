import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BufferGeometry,
  BoxGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Object3D,
} from 'three';
import type { InstancedMesh, MeshPhysicalMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Building, Material } from '@refloor/scene';
import { siteSurfaceMaterial } from '@refloor/scene/site-material';
import type { exteriorLayout } from '@/shared/scene/exterior';
import { landscapeLayout } from '@/shared/scene/landscape';
import type { LandscapeInstance } from '@/shared/scene/landscape';
import { useRenderSettings } from '@/shared/scene/render-settings';
import { landscapeFoliage } from '@/shared/scene/landscape-foliage';
import { useSurface } from '@/shared/scene/asset-loader';
import { applyMetricUVs } from '@/shared/scene/metric-uv';
import { SiteSurface } from '@/components/scene/site-surface';

function useGroundMaterial(finish: Material, scale: number, contrast: number) {
  const material = useSurface(finish);
  useLayoutEffect(() => {
    if (finish.textureId) return;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.landscapeScale = { value: scale };
      shader.uniforms.landscapeContrast = { value: contrast };
      shader.vertexShader = `varying vec2 vLandscapePosition;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLandscapePosition = (modelMatrix * vec4(position, 1.0)).xz;',
      );
      shader.fragmentShader = `
      varying vec2 vLandscapePosition;
      uniform float landscapeScale;
      uniform float landscapeContrast;
      float landscapeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float landscapeNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(landscapeHash(i), landscapeHash(i + vec2(1.0, 0.0)), f.x),
          mix(landscapeHash(i + vec2(0.0, 1.0)), landscapeHash(i + vec2(1.0)), f.x), f.y);
      }
      ${shader.fragmentShader}`.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      float landscapePixel = max(fwidth(vLandscapePosition.x), fwidth(vLandscapePosition.y));
      float landscapePatch = mix(landscapeNoise(vLandscapePosition * landscapeScale), 0.5,
        smoothstep(0.4, 1.5, landscapePixel * landscapeScale));
      float landscapeGrain = mix(landscapeNoise(vLandscapePosition * 55.0), 0.5,
        smoothstep(0.4, 1.5, landscapePixel * 55.0));
      diffuseColor.rgb *= 1.0 + (landscapePatch - 0.5) * landscapeContrast + (landscapeGrain - 0.5) * 0.18;`,
      );
    };
    material.customProgramCacheKey = () => 'refloor-landscape-ground-v1';
    material.needsUpdate = true;
  }, [material, finish.textureId, scale, contrast]);
  return material;
}

function mergeParts(parts: BufferGeometry[]) {
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (!geometry) throw new Error('Landscape geometry could not be assembled.');
  return geometry;
}

function grassGeometry() {
  const vertices: number[] = [];
  for (let blade = 0; blade < 9; blade++) {
    const angle = (blade / 9) * Math.PI * 2,
      dx = Math.cos(angle),
      dz = Math.sin(angle),
      height = 0.28 + (blade % 3) * 0.055,
      root = [dx * 0.035, 0, dz * 0.035],
      bend = [dx * 0.16, height * 0.65, dz * 0.16],
      tip = [dx * 0.29, height, dz * 0.29],
      widthX = dz * 0.015,
      widthZ = -dx * 0.015;
    vertices.push(
      root[0]! - widthX,
      root[1]!,
      root[2]! - widthZ,
      root[0]! + widthX,
      root[1]!,
      root[2]! + widthZ,
      bend[0]! - widthX,
      bend[1]!,
      bend[2]! - widthZ,
      root[0]! + widthX,
      root[1]!,
      root[2]! + widthZ,
      bend[0]! + widthX,
      bend[1]!,
      bend[2]! + widthZ,
      bend[0]! - widthX,
      bend[1]!,
      bend[2]! - widthZ,
      bend[0]! - widthX,
      bend[1]!,
      bend[2]! - widthZ,
      bend[0]! + widthX,
      bend[1]!,
      bend[2]! + widthZ,
      tip[0]!,
      tip[1]!,
      tip[2]!,
    );
  }
  const geometry = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function LandscapeBatch({
  items,
  geometry,
  material,
  color,
  referenceColor = '#ffffff',
  shade = 0.18,
  castShadow = false,
}: {
  items: LandscapeInstance[];
  geometry: BufferGeometry;
  material: MeshPhysicalMaterial;
  color: string;
  referenceColor?: string;
  shade?: number;
  castShadow?: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const dummy = new Object3D(),
      tint = new Color(color),
      reference = new Color(referenceColor),
      base = tint.clone().setRGB(tint.r / reference.r, tint.g / reference.g, tint.b / reference.b);
    items.forEach((item, index) => {
      dummy.position.fromArray(item.position);
      dummy.rotation.fromArray([...item.rotation, 'XYZ']);
      dummy.scale.fromArray(item.scale);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(index, dummy.matrix);
      ref.current!.setColorAt(
        index,
        tint.copy(base).multiplyScalar(1 - shade / 2 + item.shade * shade),
      );
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [items, color, shade, referenceColor]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, items.length]}
      castShadow={castShadow}
      receiveShadow
      material={material}
    />
  );
}

export function Landscape({
  site,
  building,
}: {
  site: ReturnType<typeof exteriorLayout>;
  building: Building;
}) {
  const quality = useRenderSettings((state) => state.landscapeQuality),
    layout = useMemo(() => landscapeLayout(site, quality), [site, quality]),
    lawn = useGroundMaterial(siteSurfaceMaterial(building, 'lawn'), 0.65, 0.35),
    soil = useGroundMaterial(siteSurfaceMaterial(building, 'planting-bed'), 14, 0.5),
    stone = useSurface(siteSurfaceMaterial(building, 'landscape-stone')),
    planting = useSurface(siteSurfaceMaterial(building, 'planting')),
    timber = useSurface({
      color: '#77604a',
      textureId: null,
      roughness: 1,
      metalness: 0,
      opacity: 1,
    }),
    geometry = useMemo(
      () => ({
        ...landscapeFoliage(quality),
        grasses: grassGeometry(),
        stones: new IcosahedronGeometry(1, 0),
      }),
      [quality],
    ),
    beds = useMemo(
      () =>
        mergeParts(
          layout.beds.map((bed) =>
            applyMetricUVs(new BoxGeometry(bed.width, 0.07, bed.depth)).translate(
              bed.x,
              layout.ground + 0.025,
              bed.z,
            ),
          ),
        ),
      [layout],
    ),
    edging = useMemo(
      () =>
        mergeParts(
          layout.edging.map((edge) =>
            applyMetricUVs(new BoxGeometry(...edge.scale)).translate(...edge.position),
          ),
        ),
      [layout],
    );
  useLayoutEffect(() => {
    planting.side = DoubleSide;
    planting.vertexColors = true;
    planting.needsUpdate = true;
  }, [planting]);
  useEffect(
    () => () => {
      Object.values(geometry).forEach((value) => value.dispose());
    },
    [geometry],
  );
  useEffect(
    () => () => {
      beds.dispose();
      edging.dispose();
    },
    [beds, edging],
  );
  return (
    <group>
      <SiteSurface buildingId={building.id} slot="lawn">
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[site.centre.x, layout.ground, site.centre.z]}
          receiveShadow
          material={lawn}
        >
          <planeGeometry args={[200, 200]} onUpdate={applyMetricUVs} />
        </mesh>
      </SiteSurface>
      <SiteSurface buildingId={building.id} slot="planting-bed">
        <mesh geometry={beds} receiveShadow material={soil} />
      </SiteSurface>
      <SiteSurface buildingId={building.id} slot="landscape-stone">
        <mesh geometry={edging} receiveShadow castShadow={quality === 'high'} material={stone} />
        <LandscapeBatch
          items={layout.stones}
          geometry={geometry.stones}
          material={stone}
          color="#ffffff"
          shade={0.25}
        />
      </SiteSurface>
      <SiteSurface buildingId={building.id} slot="planting">
        <LandscapeBatch
          items={layout.shrubs}
          geometry={geometry.shrubs}
          material={planting}
          color="#3e5e2c"
          referenceColor="#60743b"
          castShadow={quality === 'high'}
          shade={0.35}
        />
        <LandscapeBatch
          items={layout.grasses}
          geometry={geometry.grasses}
          material={planting}
          color="#8b9560"
          referenceColor="#60743b"
          shade={0.25}
        />
        <LandscapeBatch
          items={layout.trees}
          geometry={geometry.trees}
          material={planting}
          color="#587346"
          referenceColor="#60743b"
          shade={0.25}
          castShadow={quality === 'high'}
        />
        <LandscapeBatch
          items={layout.trees}
          geometry={geometry.trunks}
          material={timber}
          color="#ffffff"
          castShadow={quality === 'high'}
          shade={0.15}
        />
      </SiteSurface>
    </group>
  );
}
