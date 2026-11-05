import { useMemo } from 'react';
import { Object3D } from 'three';
import { RoundedBox } from '@react-three/drei';
import type { SceneObject } from '@refloor/scene';
import { lightOutput } from '@refloor/catalogue';
import { useSurface } from '@/shared/scene/asset-loader';

export function WallLight({ object }: { object: SceneObject }) {
  const targets = useMemo(() => [new Object3D(), new Object3D()], []);
  const material = useSurface(object.materials.body!);
  const output = lightOutput(object),
    state = object.behaviours.find((value) => value.kind === 'light')?.state;
  const { width: w, height: h, depth: d } = object.dimensions;
  return (
    <>
      <RoundedBox
        args={[w * 0.85, h * 0.82, d * 0.18]}
        position={[0, h * 0.48, -d * 0.4]}
        radius={0.012}
        smoothness={3}
        material={material}
        castShadow
        receiveShadow
      />
      <mesh position={[0, h * 0.26, 0.018]} material={material} castShadow receiveShadow>
        <cylinderGeometry args={[w * 0.42, w * 0.42, h * 0.5, 28]} />
      </mesh>
      <mesh position={[0, h * 0.74, 0.018]}>
        <cylinderGeometry args={[w * 0.28, w * 0.28, h * 0.4, 24]} />
        <meshStandardMaterial
          color={output ? '#fff2d7' : '#d0cbc0'}
          emissive={state?.color ?? '#ffd0a3'}
          emissiveIntensity={output * 0.12}
          roughness={0.3}
        />
      </mesh>
      {[0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].map((angle) => (
        <mesh
          key={angle}
          position={[Math.sin(angle) * w * 0.37, h * 0.74, Math.cos(angle) * d * 0.37 + 0.018]}
          material={material}
          castShadow
        >
          <boxGeometry args={[w * 0.075, h * 0.43, d * 0.075]} />
        </mesh>
      ))}
      {[0.5, 0.97].map((height) => (
        <mesh key={height} position={[0, h * height, 0.018]} material={material} castShadow>
          <cylinderGeometry args={[w * 0.43, w * 0.43, h * 0.045, 28]} />
        </mesh>
      ))}
      {[0, 1].map((index) => (
        <group key={index}>
          <primitive object={targets[index]!} position={[0, index ? -1.1 : 1.1, -d * 0.84]} />
          <spotLight
            position={[0, index ? -h * 0.025 : h * 1.025, -d * 0.05]}
            target={targets[index]!}
            userData={{ lightBudget: { id: object.id, floorId: object.floorId, exterior: true } }}
            color={state?.color ?? '#ffd0a3'}
            intensity={output}
            angle={0.48}
            penumbra={0.65}
            distance={2.8}
            decay={2}
            castShadow
            shadow-mapSize={[256, 256]}
            shadow-camera-near={0.025}
            shadow-bias={-0.0001}
            shadow-normalBias={0.004}
            shadow-autoUpdate={false}
          />
        </group>
      ))}
    </>
  );
}
