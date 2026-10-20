import { useEffect, useMemo } from 'react';
import { PlaneGeometry } from 'three';
import type { Material } from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import type { SceneObject } from '@refloor/scene';
import { useProject } from '@/shared/scene/scene-store';
import { useRenderSettings } from '@/shared/scene/render-settings';
import { shadowRevision } from '@/shared/scene/shadow-updates';
import { mediaPlayers } from '@/shared/behaviours/television';

export function Mirror({ object, surface }: { object: SceneObject; surface: Material }) {
  const resolution = useRenderSettings((state) => state.mirrorResolution),
    interval = useRenderSettings((state) => state.mirrorInterval),
    { width, height, depth } = object.dimensions,
    appearance = object.materials.body!,
    reflective = appearance.metalness >= 0.8 && !appearance.textureId;
  const mirror = useMemo(() => {
    const reflector = new Reflector(new PlaneGeometry(width - 0.045, height - 0.045), {
        color: appearance.color,
        textureWidth: resolution,
        textureHeight: resolution,
        multisample: 0,
        clipBias: 0.003,
      }),
      renderReflection = reflector.onBeforeRender;
    let captured = -Infinity,
      revision = -1,
      view: typeof reflector.matrixWorld | null = null,
      projection: typeof reflector.matrixWorld | null = null;
    reflector.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      if (camera.userData.refloorReflection) return;
      const state = useProject.getState(),
        now = performance.now();
      if (state.mode !== 'walk' || state.floorId !== object.floorId || now - captured < interval)
        return;
      const changed =
          !view?.equals(camera.matrixWorld) ||
          !projection?.equals(camera.projectionMatrix) ||
          revision !== shadowRevision(),
        videoPlaying = [...mediaPlayers.values()].some((video) => !video.paused && !video.ended);
      const runningFixture = state.compiled.building.objects.some(
        (item) =>
          item.floorId === object.floorId &&
          item.behaviours.some(
            (behaviour) =>
              (behaviour.kind === 'water' && behaviour.state.powered && behaviour.state.flow > 0) ||
              (behaviour.kind === 'cooker' && behaviour.state.powered && behaviour.state.heat > 0),
          ),
      );
      if (!changed && !videoPlaying && !runningFixture && !state.interacting) return;
      captured = now;
      revision = shadowRevision();
      view = camera.matrixWorld.clone();
      projection = camera.projectionMatrix.clone();
      // Mirrors reuse the last texture in other reflections to prevent recursive scene renders.
      reflector.getReflectionCamera(camera).userData.refloorReflection = true;
      renderReflection.call(reflector, renderer, scene, camera, geometry, material, group);
    };
    return reflector;
  }, [width, height, appearance.color, resolution, interval, object.floorId]);
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
