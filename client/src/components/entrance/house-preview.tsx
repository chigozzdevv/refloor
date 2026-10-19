import { Suspense, useEffect, useLayoutEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { Object3D, PCFShadowMap } from 'three';
import { compileBuilding } from '@refloor/engine';
import type { MeshPart } from '@refloor/engine';
import { createHouse } from '@refloor/catalogue/houses';
import { partGeometry } from '@/shared/scene/geometry';
import { housePreviewCamera, exteriorLayout } from '@/shared/scene/exterior';
import { useSurface } from '@/shared/scene/asset-loader';
import { ExteriorModel } from '@/components/scene/exterior';

function PreviewPart({ part }: { part: MeshPart }) {
  const geometry = useMemo(() => partGeometry(part), [part]);
  const material = useSurface(part.material, part.role === 'window');
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      material={geometry.groups.length ? [material, material] : material}
      position={[part.collider.position.x, part.collider.position.y, part.collider.position.z]}
      rotation={[0, part.collider.rotation, 0]}
      castShadow={part.role !== 'window'}
      receiveShadow
    />
  );
}

function PreviewScene({ storeys, width, depth }: { storeys: 1 | 2; width: number; depth: number }) {
  const compiled = useMemo(
    () =>
      compileBuilding(
        createHouse({ id: 'house-preview', name: 'House preview', storeys, width, depth }),
      ),
    [storeys, width, depth],
  );
  const { camera, size, invalidate } = useThree();
  const site = useMemo(() => exteriorLayout(compiled), [compiled]);
  const sunTarget = useMemo(() => {
    const target = new Object3D();
    target.position.set(site.centre.x, site.ground.elevation, site.centre.z);
    return target;
  }, [site]);
  useLayoutEffect(() => {
    const view = housePreviewCamera(compiled, size.width / size.height);
    camera.position.copy(view.position);
    camera.lookAt(view.target);
    camera.updateMatrixWorld();
    invalidate();
  }, [camera, compiled, size.width, size.height, invalidate]);
  return (
    <>
      <color attach="background" args={['#c4ccc5']} />
      <fog attach="fog" args={['#c4ccc5', 35, 100]} />
      <Environment files="/textures/environment/daylight.hdr" environmentIntensity={0.6} />
      <hemisphereLight args={['#e7edf2', '#b29a7c', 0.8]} />
      <primitive object={sunTarget} />
      <directionalLight
        position={[site.centre.x - 10, 18, site.centre.z - 10]}
        target={sunTarget}
        intensity={3}
        color="#fff0d9"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-far={70}
        shadow-normalBias={0.035}
      />
      {compiled.parts.map((part) => (
        <PreviewPart key={part.id} part={part} />
      ))}
      <ExteriorModel compiled={compiled} />
    </>
  );
}

export function HousePreview(props: { storeys: 1 | 2; width: number; depth: number }) {
  return (
    <span className="home-preview" aria-hidden="true">
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        shadows={{ type: PCFShadowMap }}
        camera={{ fov: 45, near: 0.1, far: 200 }}
        gl={{ antialias: true, powerPreference: 'low-power' }}
        fallback={<span>House preview unavailable</span>}
      >
        <Suspense fallback={null}>
          <PreviewScene {...props} />
        </Suspense>
      </Canvas>
    </span>
  );
}
