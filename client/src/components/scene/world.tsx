import { Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { NoToneMapping, PCFSoftShadowMap, SRGBColorSpace } from 'three';
import { useProject } from '@/shared/scene/scene-store';
import { Lighting } from '@/components/scene/lighting';
import { Building } from '@/components/scene/building';
import { Furniture } from '@/components/scene/furniture';
import { ArchitecturalDetails } from '@/components/scene/architectural-details';
import { NavigationControls } from '@/components/navigation/navigation-controls';
import { PhysicsRuntime } from '@/shared/navigation/physics-runtime';
import { SelectionChat } from '@/components/editor/selection-chat';
import { NavigationMarkers } from '@/components/navigation/navigation-markers';

function SceneReady() {
  const setReady = useProject((state) => state.setSceneReady);
  useEffect(() => setReady(true), [setReady]);
  return null;
}

export function World() {
  const quality = useProject((state) => state.quality),
    select = useProject((state) => state.select);
  return (
    <Canvas
      shadows
      camera={{ fov: 45, near: 0.08, far: 200, position: [16, 12, -8] }}
      dpr={quality === 'high' ? [1, 1.75] : 1}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        toneMapping: NoToneMapping,
        outputColorSpace: SRGBColorSpace,
      }}
      onCreated={({ gl }) => {
        gl.shadowMap.type = PCFSoftShadowMap;
      }}
      onPointerMissed={(event) => {
        if (event.target instanceof HTMLCanvasElement) select(null);
      }}
    >
      <Suspense fallback={null}>
        <PhysicsRuntime />
        <Lighting />
        <Building />
        <Furniture />
        <ArchitecturalDetails />
        <NavigationControls />
        <NavigationMarkers />
        <SelectionChat />
        <SceneReady />
      </Suspense>
    </Canvas>
  );
}
