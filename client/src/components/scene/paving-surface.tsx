import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, PlaneGeometry, Vector2 } from 'three';
import type { InstancedMesh, Mesh, MeshPhysicalMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { exteriorLayout } from '@/shared/scene/exterior';
import { applyMetricUVs } from '@/shared/scene/metric-uv';
import { pavingRegions, PavingLod, PavingProjection } from '@/shared/scene/paving-lod';
import { visibleMeshRaycast } from '@/shared/editor/picking';

export function PavingSurface({
  site,
  material: sourceMaterial,
  overridden,
  detailed,
}: {
  site: ReturnType<typeof exteriorLayout>;
  material: MeshPhysicalMaterial;
  overridden: boolean;
  detailed: RefObject<InstancedMesh | null>;
}) {
  const flat = useRef<Mesh>(null),
    regions = useMemo(() => pavingRegions(site), [site]),
    projection = useMemo(() => new PavingProjection(regions), [regions]),
    lod = useMemo(() => new PavingLod(), [regions]),
    last = useRef(-Infinity),
    material = useMemo(() => sourceMaterial.clone(), [sourceMaterial]),
    originalCompile = useMemo(() => sourceMaterial.onBeforeCompile, [sourceMaterial]),
    originalKey = useMemo(() => sourceMaterial.customProgramCacheKey(), [sourceMaterial]),
    geometry = useMemo(() => {
      const pieces = regions.map((region) =>
          applyMetricUVs(
            new PlaneGeometry(region.width, region.depth).rotateX(-Math.PI / 2),
          ).translate(region.x, region.y, region.z),
        ),
        merged = mergeGeometries(pieces);
      pieces.forEach((piece) => piece.dispose());
      if (!merged) throw new Error('Compound paving could not be assembled.');
      return merged;
    }, [regions]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => {
    const tint = overridden ? new Color(0.96, 0.96, 0.96) : new Color().setHSL(0.11, 0.055, 0.48);
    material.onBeforeCompile = (shader, renderer) => {
      originalCompile.call(material, shader, renderer);
      shader.uniforms.pavingOrigin = { value: new Vector2(site.compound.x, site.compound.z) };
      shader.uniforms.pavingTint = { value: tint };
      shader.vertexShader = `varying vec2 vPavingPosition;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvPavingPosition = (modelMatrix * vec4(position, 1.0)).xz;',
      );
      shader.fragmentShader = `varying vec2 vPavingPosition;
        uniform vec2 pavingOrigin;
        uniform vec3 pavingTint;
        float pavingIntegral(float x, float halfJoint) {
          float fraction = fract(x);
          return floor(x) * halfJoint * 2.0 + min(fraction, halfJoint) + max(0.0, fraction - (1.0 - halfJoint));
        }
        float pavingJoint(float x, float width, float halfJoint) {
          return clamp((pavingIntegral(x + width * 0.5, halfJoint) - pavingIntegral(x - width * 0.5, halfJoint)) / width, 0.0, 1.0);
        }
        ${shader.fragmentShader}`.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float row = floor((vPavingPosition.y - pavingOrigin.y - 0.11) / 0.22);
        vec2 grid = vec2((vPavingPosition.x - pavingOrigin.x - 0.22 - mod(row, 2.0) * 0.22) / 0.44,
          (vPavingPosition.y - pavingOrigin.y - 0.11) / 0.22);
        vec2 footprint = max(vec2(fwidth(vPavingPosition.x) / 0.44, fwidth(vPavingPosition.y) / 0.22), vec2(0.00001));
        float verticalJoint = pavingJoint(grid.x, footprint.x, 0.005 / 0.44);
        float horizontalJoint = pavingJoint(grid.y, footprint.y, 0.005 / 0.22);
        float coverage = 1.0 - (1.0 - verticalJoint) * (1.0 - horizontalJoint);
        float resolved = 1.0 - smoothstep(0.08, 0.3, max(footprint.x, footprint.y));
        float joint = mix(0.9765, 1.0 - 0.35 * coverage, resolved);
        float variation = 1.0 + sin(row * 19.7 + floor(grid.x) * 37.3) * 0.05 * resolved;
        diffuseColor.rgb *= pavingTint * joint * variation;`,
      );
    };
    material.customProgramCacheKey = () => `refloor-filtered-paving-v1:${originalKey}`;
    material.needsUpdate = true;
  }, [material, originalCompile, originalKey, overridden, site.compound.x, site.compound.z]);
  useFrame(({ camera, gl, clock }) => {
    if (clock.elapsedTime - last.current < 0.12) return;
    last.current = clock.elapsedTime;
    const near = lod.update(projection.measure(camera, gl.domElement.width, gl.domElement.height));
    if (detailed.current) detailed.current.visible = near;
    if (flat.current) flat.current.visible = !near;
  });
  return (
    <mesh
      ref={flat}
      geometry={geometry}
      material={material}
      receiveShadow
      raycast={visibleMeshRaycast}
    />
  );
}
