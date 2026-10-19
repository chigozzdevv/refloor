import { useMemo } from 'react';
import { Object3D } from 'three';
import { RoundedBox } from '@react-three/drei';
import type { SceneObject } from '@refloor/scene';
import { lightOutput } from '@refloor/catalogue';
import { useSurface } from '@/shared/scene/asset-loader';

export function Floodlight({ object }: { object: SceneObject }) {
  const target = useMemo(() => new Object3D(), []),
    material = useSurface(object.materials.body!);
  const output = lightOutput(object),
    state = object.behaviours.find((value) => value.kind === 'light')?.state;
  return (
    <>
      <primitive object={target} position={[0, -2.4, 3.5]} />
      <RoundedBox
        args={[object.dimensions.width, object.dimensions.height, object.dimensions.depth]}
        position={[0, object.dimensions.height / 2, 0]}
        radius={0.025}
        smoothness={3}
        material={material}
        castShadow
      />
      <mesh
        position={[0, object.dimensions.height / 2, object.dimensions.depth / 2 + 0.002]}
        rotation={[-0.2, 0, 0]}
      >
        <planeGeometry args={[object.dimensions.width * 0.82, object.dimensions.height * 0.7]} />
        <meshStandardMaterial
          color={output ? '#fff3db' : '#9daba8'}
          emissive={state?.color ?? '#ffffff'}
          emissiveIntensity={output ? 2 : 0}
          roughness={0.3}
        />
      </mesh>
      {output > 0 && (
        <spotLight
          position={[0, 0.1, 0.15]}
          target={target}
          userData={{ lightBudget: { id: object.id, floorId: object.floorId, exterior: true } }}
          color={state?.color ?? '#ffe6c4'}
          intensity={output * 5}
          angle={0.95}
          penumbra={0.55}
          distance={14}
          decay={2}
          castShadow
          shadow-mapSize={[512, 512]}
          shadow-bias={-0.00015}
          shadow-normalBias={0.015}
          shadow-camera-near={0.05}
          shadow-autoUpdate={false}
        />
      )}
    </>
  );
}
