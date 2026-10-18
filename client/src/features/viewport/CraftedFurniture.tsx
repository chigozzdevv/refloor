import { RoundedBox } from '@react-three/drei';
import { useMemo } from 'react';
import { Color, DoubleSide } from 'three';
import type { SceneObject } from '@refloor/scene';
import type { FurnitureRenderer } from '@refloor/catalogue';
import { finishes } from '@refloor/catalogue';
import { useSurface } from '@/runtime/rendering/materials';
import { useProject } from '@/features/projects/project-store';

function Bed({ object }: { object: SceneObject }) {
  const body = useSurface(object.materials.body ?? finishes.linen),
    frame = useSurface(object.materials.frame ?? finishes.walnut);
  const { width: w, depth: d } = object.dimensions;
  return (
    <>
      <RoundedBox
        args={[w, 0.24, d]}
        radius={0.035}
        smoothness={4}
        position={[0, 0.22, 0]}
        material={frame}
        castShadow
        receiveShadow
      />
      <RoundedBox
        args={[w - 0.12, 0.24, d - 0.15]}
        radius={0.09}
        smoothness={5}
        position={[0, 0.46, 0.02]}
        material={body}
        castShadow
        receiveShadow
      />
      <RoundedBox
        args={[w - 0.04, 0.94, 0.13]}
        radius={0.06}
        smoothness={4}
        position={[0, 0.58, -d / 2 + 0.04]}
        material={body}
        castShadow
        receiveShadow
      />
      {[-1, 1].map((sign) => (
        <RoundedBox
          key={sign}
          args={[w * 0.4, 0.15, 0.52]}
          radius={0.075}
          smoothness={6}
          position={[sign * w * 0.23, 0.63, -d * 0.29]}
          rotation={[0.08, 0, sign * 0.025]}
          material={body}
          castShadow
          receiveShadow
        />
      ))}
      <RoundedBox
        args={[w - 0.08, 0.035, d * 0.42]}
        radius={0.015}
        smoothness={4}
        position={[0, 0.605, d * 0.25]}
        castShadow
        receiveShadow
      >
        <meshPhysicalMaterial color="#a9af9c" roughness={0.95} sheen={0.65} sheenColor="#d8d7c7" />
      </RoundedBox>
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <mesh
            key={`${x}:${z}`}
            position={[x * (w / 2 - 0.16), 0.08, z * (d / 2 - 0.16)]}
            castShadow
          >
            <cylinderGeometry args={[0.035, 0.03, 0.16, 12]} />
            <meshStandardMaterial color="#443d30" roughness={0.6} />
          </mesh>
        )),
      )}
    </>
  );
}

function Cabinet({ object }: { object: SceneObject }) {
  const material = useSurface(object.materials.body ?? finishes.oak),
    { width: w, height: h, depth: d } = object.dimensions;
  const sections = Math.max(2, Math.round(w / 0.55));
  return (
    <>
      <RoundedBox
        args={[w, h - 0.1, d]}
        radius={0.014}
        smoothness={3}
        position={[0, (h + 0.1) / 2, 0]}
        material={material}
        castShadow
        receiveShadow
      />
      {Array.from({ length: sections }, (_, i) => (
        <group
          key={i}
          position={[-w / 2 + ((i + 0.5) * w) / sections, h / 2 + 0.04, d / 2 + 0.004]}
        >
          <RoundedBox
            args={[w / sections - 0.008, h - 0.15, 0.018]}
            radius={0.004}
            smoothness={2}
            material={material}
            castShadow
            receiveShadow
          />
          <mesh position={[(w / sections) * 0.33, 0.08, 0.014]}>
            <boxGeometry args={[0.018, 0.09, 0.012]} />
            <meshStandardMaterial color="#847354" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.055, 0]} castShadow>
        <boxGeometry args={[w - 0.14, 0.11, d - 0.12]} />
        <meshStandardMaterial color="#393b34" roughness={0.65} />
      </mesh>
    </>
  );
}

function Pendant({ object }: { object: SceneObject }) {
  const state = object.behaviours.find((behaviour) => behaviour.kind === 'light')?.state,
    lighting = useProject((value) => value.lighting);
  const powered = state?.powered ?? false;
  return (
    <>
      <mesh position={[0, 0.09, 0]} castShadow>
        <sphereGeometry args={[0.2, 32, 24]} />
        <meshPhysicalMaterial
          color="#f1eadb"
          roughness={0.45}
          transmission={0.15}
          thickness={0.08}
          emissive={state?.color ?? '#ffe6bf'}
          emissiveIntensity={powered ? 0.8 : 0}
        />
      </mesh>
      <mesh position={[0, 0.33, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.25, 8]} />
        <meshStandardMaterial color="#615746" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.44, 0]}>
        <cylinderGeometry args={[0.065, 0.065, 0.018, 20]} />
        <meshStandardMaterial color="#bba37e" roughness={0.3} metalness={0.8} />
      </mesh>
      {powered && (
        <pointLight
          position={[0, -0.05, 0]}
          color={state?.color ?? '#ffe6bf'}
          intensity={(state?.intensity ?? 3) * (lighting === 'day' ? 4 : 7)}
          distance={8}
          decay={2}
        />
      )}
    </>
  );
}

function Plant() {
  const leaves = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => {
        const angle = i * 2.399963,
          h = 0.7 + ((i % 15) / 15) * 0.8,
          radius = Math.sin(((h - 0.6) / 1.1) * Math.PI) * 0.24;
        return {
          x: Math.cos(angle) * radius,
          y: h,
          z: Math.sin(angle) * radius,
          angle,
          tilt: ((i % 5) - 2) * 0.2,
        };
      }),
    [],
  );
  return (
    <>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.22, 0.15, 0.44, 40]} />
        <meshStandardMaterial color="#b9ad92" roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.445, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.195, 32]} />
        <meshStandardMaterial color="#4e4436" roughness={1} />
      </mesh>
      <mesh position={[0, 0.91, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.025, 1.1, 10]} />
        <meshStandardMaterial color="#776346" roughness={1} />
      </mesh>
      {leaves.map((leaf, i) => (
        <mesh
          key={i}
          position={[leaf.x, leaf.y, leaf.z]}
          rotation={[leaf.tilt, leaf.angle, 0.4]}
          scale={[0.045, 0.14, 0.015]}
          castShadow
        >
          <sphereGeometry args={[1, 8, 6]} />
          <meshStandardMaterial
            color={new Color().setHSL(0.23, 0.16 + (i % 3) * 0.04, 0.28 + (i % 4) * 0.04)}
            roughness={0.9}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </>
  );
}

function Television({ object }: { object: SceneObject }) {
  const { width: w, height: h, depth: d } = object.dimensions;
  return (
    <>
      <RoundedBox
        args={[w, h, d]}
        radius={0.018}
        smoothness={4}
        position={[0, h / 2, 0]}
        castShadow
      >
        <meshPhysicalMaterial
          color={object.materials.body?.color ?? '#171a18'}
          roughness={0.3}
          metalness={0.3}
        />
      </RoundedBox>
      <mesh name="screen" position={[0, h / 2, d / 2 + 0.001]}>
        <planeGeometry args={[w - 0.035, h - 0.035]} />
        <meshPhysicalMaterial color="#151b19" roughness={0.12} metalness={0.15} clearcoat={1} />
      </mesh>
      <mesh position={[w / 2 - 0.05, 0.013, d / 2 + 0.002]}>
        <sphereGeometry args={[0.0025, 8, 6]} />
        <meshBasicMaterial color="#acb493" />
      </mesh>
    </>
  );
}

export function CraftedFurniture({
  object,
  renderer,
}: {
  object: SceneObject;
  renderer: FurnitureRenderer;
}) {
  if (renderer === 'bed') return <Bed object={object} />;
  if (renderer === 'cabinet') return <Cabinet object={object} />;
  if (renderer === 'pendant') return <Pendant object={object} />;
  if (renderer === 'plant') return <Plant />;
  if (renderer === 'television') return <Television object={object} />;
  throw new Error(`Furniture renderer is unavailable: ${renderer}`);
}
