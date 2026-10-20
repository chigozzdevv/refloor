import { useEffect, useMemo } from 'react';
import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three';
import type { Material as ThreeMaterial } from 'three';
import type { SceneObject } from '@refloor/scene';
import { FurnitureSolid as Solid } from '@/components/scene/furniture-solid';
import { FixtureControl } from '@/components/objects/fixture-control';

export function Tap({
  object,
  x,
  y,
  z,
  scale = 1,
  material,
}: {
  object: SceneObject;
  x: number;
  y: number;
  z: number;
  scale?: number;
  material: ThreeMaterial;
}) {
  const geometry = useMemo(
    () =>
      new TubeGeometry(
        new CatmullRomCurve3([
          new Vector3(0, 0.025, 0),
          new Vector3(0, 0.21, 0),
          new Vector3(0, 0.26, 0.055),
          new Vector3(0, 0.22, 0.15),
        ]),
        24,
        0.013,
        8,
        false,
      ),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group position={[x, y, z]} scale={scale}>
      <mesh position={[0, 0.012, 0]} material={material} castShadow>
        <cylinderGeometry args={[0.024, 0.025, 0.024, 20]} />
      </mesh>
      <mesh geometry={geometry} material={material} castShadow />
      <FixtureControl
        object={object}
        capability="water"
        label={
          object.behaviours.some(
            (value) => value.kind === 'water' && value.state.powered && value.state.flow > 0,
          )
            ? 'Turn off tap'
            : 'Turn on tap'
        }
        position={[0.04, 0.12, 0.035]}
      >
        <Solid
          size={[0.065, 0.012, 0.016]}
          at={[0.03, 0.09, 0]}
          material={material}
          rotation={[
            0,
            0,
            object.behaviours.some(
              (value) => value.kind === 'water' && value.state.powered && value.state.flow > 0,
            )
              ? -0.35
              : 0,
          ]}
        />
      </FixtureControl>
    </group>
  );
}

export function Basin({
  x,
  y,
  w,
  d,
  ceramic = false,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  ceramic?: boolean;
}) {
  const color = ceramic ? '#f2f1eb' : '#b7c1c2',
    metalness = ceramic ? 0 : 0.8,
    roughness = ceramic ? 0.18 : 0.28;
  return (
    <group position={[x, y, 0]}>
      <Solid
        size={[w, 0.012, d]}
        at={[0, -0.135, 0]}
        color={color}
        metalness={metalness}
        roughness={roughness}
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Solid
            size={[0.015, 0.14, d]}
            at={[(side * w) / 2, -0.07, 0]}
            color={color}
            metalness={metalness}
            roughness={roughness}
          />
          <Solid
            size={[w, 0.14, 0.015]}
            at={[0, -0.07, (side * d) / 2]}
            color={color}
            metalness={metalness}
            roughness={roughness}
          />
        </group>
      ))}
      <mesh position={[0, -0.125, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.025, 24]} />
        <meshStandardMaterial color="#555f61" metalness={0.85} roughness={0.2} />
      </mesh>
    </group>
  );
}
