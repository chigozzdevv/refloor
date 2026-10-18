import { Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { NoToneMapping, PCFSoftShadowMap, SRGBColorSpace } from 'three';
import { useProject } from '@/features/projects/project-store';
import { Lighting } from '@/features/viewport/Lighting';
import { BuildingMesh } from '@/features/viewport/BuildingMesh';
import { Furniture } from '@/features/viewport/Furniture';
import { ArchitecturalDetails } from '@/features/viewport/ArchitecturalDetails';
import { CameraRig } from '@/features/viewport/CameraRig';
import { PhysicsRuntime } from '@/features/viewport/PhysicsRuntime';

function SceneReady() {
  const setReady = useProject((state) => state.setSceneReady);
  useEffect(() => setReady(true), [setReady]);
  return null;
}

export function Viewport() {
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
      onPointerMissed={() => select(null)}
    >
      <Suspense fallback={null}>
        <PhysicsRuntime />
        <Lighting />
        <BuildingMesh />
        <Furniture />
        <ArchitecturalDetails />
        <CameraRig />
        <SceneReady />
      </Suspense>
    </Canvas>
  );
}
