import { Environment, SoftShadows } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, Outline, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useProject } from '@/shared/scene/scene-store';

export function Lighting() {
  const lighting = useProject((state) => state.lighting),
    quality = useProject((state) => state.quality);
  const day = lighting === 'day';
  return (
    <>
      <Environment
        files="/textures/environment/daylight.hdr"
        environmentIntensity={day ? 0.65 : 0.12}
        environmentRotation={[0, 2.3, 0]}
      />
      <color attach="background" args={[day ? '#e7e7df' : '#121922']} />
      <fog attach="fog" args={[day ? '#e7e7df' : '#121922', 45, 140]} />
      <hemisphereLight args={['#e4ebf2', '#aa9276', day ? 0.35 : 0.08]} />
      <directionalLight
        position={[-6, 12, -6]}
        color={day ? '#fff2d8' : '#b6cbe3'}
        intensity={day ? 3.2 : 0.16}
        castShadow
        shadow-mapSize={quality === 'high' ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={0.5}
        shadow-camera-far={45}
        shadow-normalBias={0.025}
        shadow-bias={-0.00008}
      />
      {quality === 'high' && <SoftShadows size={12} samples={12} focus={0.3} />}
      <EffectComposer autoClear={false} multisampling={quality === 'high' ? 4 : 0}>
        <N8AO
          aoRadius={0.45}
          intensity={1.35}
          distanceFalloff={1}
          quality={quality === 'high' ? 'medium' : 'low'}
          halfRes
        />
        <Bloom luminanceThreshold={1.6} intensity={0.16} mipmapBlur />
        <Outline
          edgeStrength={6}
          visibleEdgeColor="#edc379"
          hiddenEdgeColor="#edc379"
          xRay={false}
          blur={false}
        />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  );
}
