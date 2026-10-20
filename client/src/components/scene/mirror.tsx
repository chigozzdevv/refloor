import { useEffect, useMemo } from 'react';
import { PlaneGeometry } from 'three';
import type { Material } from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import type { SceneObject } from '@refloor/scene';
import { useProject } from '@/shared/scene/scene-store';

export function Mirror({ object, surface }: { object: SceneObject; surface: Material }) {
  const quality = useProject((state) => state.quality),
    { width, height, depth } = object.dimensions,
    appearance = object.materials.body!,
    reflective = appearance.metalness >= 0.8 && !appearance.textureId;
  const mirror = useMemo(() => {
    const resolution = quality === 'high' ? 512 : 256,
      reflector = new Reflector(new PlaneGeometry(width - 0.045, height - 0.045), {
        color: appearance.color,
        textureWidth: resolution,
        textureHeight: resolution,
        multisample: 0,
        clipBias: 0.003,
      }),
      renderReflection = reflector.onBeforeRender;
    let captured = -Infinity;
    reflector.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      if (camera.userData.refloorReflection) return;
      const state = useProject.getState(),
        now = performance.now();
      if (state.mode !== 'walk' || state.floorId !== object.floorId || now - captured < 33) return;
      captured = now;
      // Mirrors reuse the last texture in other reflections to prevent recursive scene renders.
      reflector.getReflectionCamera(camera).userData.refloorReflection = true;
      renderReflection.call(reflector, renderer, scene, camera, geometry, material, group);
    };
    return reflector;
  }, [width, height, appearance.color, quality, object.floorId]);
  useEffect(
    () => () => {
      mirror.geometry.dispose();
      mirror.dispose();
    },
    [mirror],
  );
  return reflective ? (
    <primitive object={mirror} position={[0, height / 2, depth / 2 + 0.012]} dispose={null} />
  ) : (
    <mesh position={[0, height / 2, depth / 2 + 0.012]} material={surface}>
      <planeGeometry args={[width - 0.045, height - 0.045]} />
    </mesh>
  );
}
