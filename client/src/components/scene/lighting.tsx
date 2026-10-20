import { Environment, SoftShadows } from '@react-three/drei';
import {
  Bloom,
  EffectComposer,
  N8AO,
  Outline,
  SMAA,
  ToneMapping,
} from '@react-three/postprocessing';
import { SMAAPreset, ToneMappingMode } from 'postprocessing';
import { LightBudget } from '@/components/scene/light-budget';
import { useProject } from '@/shared/scene/scene-store';
import { useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { invalidateShadows, refreshShadows, shadowRevision } from '@/shared/scene/shadow-updates';
import { useRenderSettings } from '@/shared/scene/render-settings';

function ShadowUpdates() {
  const compiled = useProject((state) => state.compiled),
    mode = useProject((state) => state.mode),
    floorId = useProject((state) => state.floorId),
    resolution = useRenderSettings((state) => state.sunlightResolution),
    lighting = useProject((state) => state.lighting);
  const seen = useRef(-1),
    frames = useRef(0);
  useLayoutEffect(invalidateShadows, [compiled, mode, floorId, resolution, lighting]);
  useFrame(({ scene, invalidate }) => {
    if (seen.current !== shadowRevision()) {
      seen.current = shadowRevision();
      frames.current = 2;
    }
    if (frames.current > 0 || useProject.getState().interacting) {
      refreshShadows(scene);
      frames.current = Math.max(0, frames.current - 1);
      if (frames.current > 0) invalidate();
    }
  }, -0.5);
  return null;
}

export function Lighting() {
  const lighting = useProject((state) => state.lighting),
    settings = useRenderSettings();
  const day = lighting === 'day';
  return (
    <>
      <LightBudget />
      <ShadowUpdates />
      <Environment
        files="/textures/environment/daylight.hdr"
        environmentIntensity={day ? 0.65 : 0.18}
        environmentRotation={[0, 2.3, 0]}
      />
      <color attach="background" args={[day ? '#e7e7df' : '#121922']} />
      <fog attach="fog" args={[day ? '#e7e7df' : '#121922', 45, 140]} />
      <hemisphereLight args={['#e4ebf2', '#aa9276', day ? 0.35 : 0.12]} />
      <directionalLight
        key={settings.sunlightResolution}
        position={[-6, 12, -6]}
        color={day ? '#fff2d8' : '#b6cbe3'}
        intensity={day ? 3.2 : 0.35}
        castShadow
        shadow-mapSize={[settings.sunlightResolution, settings.sunlightResolution]}
        shadow-autoUpdate={false}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={0.5}
        shadow-camera-far={45}
        shadow-normalBias={0.025}
        shadow-bias={-0.00008}
      />
      {settings.softShadows && <SoftShadows size={12} samples={12} focus={0.3} />}
      <EffectComposer autoClear={false} multisampling={settings.multisampling}>
        <N8AO
          enabled={settings.ambientOcclusion}
          aoRadius={0.45}
          intensity={1.35}
          distanceFalloff={1}
          quality={settings.aoQuality}
          halfRes
        />
        {settings.bloom && <Bloom luminanceThreshold={1.6} intensity={0.16} mipmapBlur />}
        <Outline
          edgeStrength={6}
          visibleEdgeColor="#edc379"
          hiddenEdgeColor="#edc379"
          xRay={false}
          blur={false}
        />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        {settings.multisampling === 0 && <SMAA preset={SMAAPreset.MEDIUM} />}
      </EffectComposer>
    </>
  );
}
