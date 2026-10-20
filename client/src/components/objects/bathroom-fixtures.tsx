import { useEffect, useMemo } from 'react';
import { DoubleSide, LatheGeometry, Vector2 } from 'three';
import { finishes } from '@refloor/catalogue';
import { useSurface } from '@/shared/scene/asset-loader';
import { FurnitureSolid as Solid } from '@/components/scene/furniture-solid';
import { Cupboard } from '@/components/objects/cupboard';
import { Tap, Basin } from '@/components/objects/plumbing';
import { FixtureControl } from '@/components/objects/fixture-control';
import { FixtureWater } from '@/components/objects/fixture-effects';
import type { FixtureProps } from '@/components/objects/fixture-props';

export function Vanity({ object, body, frame }: FixtureProps) {
  const stone = useSurface(object.materials.top ?? finishes.marbleSlab),
    { width: w, height: h, depth: d } = object.dimensions,
    top = h * 0.75,
    bw = Math.min(0.55, w * 0.55),
    bd = d * 0.6,
    side = (w - bw) / 2;
  return (
    <>
      <group position={[0, 0.12, 0]}>
        <Cupboard
          object={object}
          w={w}
          h={top - 0.16}
          d={d - 0.025}
          material={body}
          frame={frame}
          drawers
        />
      </group>
      {[-1, 1].map((sign) => (
        <group key={sign}>
          <Solid
            size={[side, 0.045, d]}
            at={[(sign * (bw + side)) / 2, top - 0.022, 0]}
            material={stone}
          />
          <Solid
            size={[bw, 0.045, (d - bd) / 2]}
            at={[0, top - 0.022, (sign * (d + bd)) / 4]}
            material={stone}
          />
        </group>
      ))}
      <Solid size={[w, 0.07, 0.015]} at={[0, top + 0.035, -d / 2 + 0.0075]} material={stone} />
      <Basin x={0} y={top - 0.01} w={bw} d={bd} ceramic />
      <Tap object={object} x={0} y={top} z={-d * 0.38} scale={0.83} material={frame} />
      <FixtureWater
        object={object}
        position={[0, top + 0.22 * 0.83, -d * 0.38 + 0.15 * 0.83]}
        length={0.22 * 0.83 + 0.12}
      />
    </>
  );
}

export function Toilet({ object, body, frame }: FixtureProps) {
  const { width: w, height: h, depth: d } = object.dimensions,
    bowl = useMemo(
      () =>
        new LatheGeometry(
          [
            new Vector2(0.35, 0),
            new Vector2(0.39, 0.08),
            new Vector2(0.43, 0.22),
            new Vector2(0.77, 0.5),
            new Vector2(0.97, 0.72),
            new Vector2(1, 0.9),
            new Vector2(0.95, 1),
            new Vector2(0.83, 0.97),
            new Vector2(0.77, 0.77),
            new Vector2(0.58, 0.45),
            new Vector2(0.3, 0.33),
            new Vector2(0, 0.33),
          ],
          32,
        ),
      [],
    );
  useEffect(() => () => bowl.dispose(), [bowl]);
  return (
    <>
      <mesh
        geometry={bowl}
        position={[0, 0.03, d * 0.09]}
        scale={[w * 0.44, h * 0.55, d * 0.37]}
        material={body}
        castShadow
        receiveShadow
      />
      <mesh
        position={[0, h * 0.6, d * 0.09]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[w / 0.61, d / 0.75, 1]}
        material={body}
      >
        <torusGeometry args={[0.2, 0.045, 12, 40]} />
      </mesh>
      <mesh position={[0, h * 0.29, d * 0.09]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1.2, 1]}>
        <circleGeometry args={[w * 0.14, 24]} />
        <meshPhysicalMaterial color="#91aeb2" roughness={0.08} metalness={0.08} />
      </mesh>
      <Solid size={[w * 0.77, h * 0.55, d * 0.22]} at={[0, h * 0.71, -d * 0.34]} material={body} />
      <Solid size={[0.07, 0.012, 0.04]} at={[w * 0.2, h * 0.995, -d * 0.34]} material={frame} />
    </>
  );
}

export function Shower({ object, body, frame }: FixtureProps) {
  const { width: w, height: h, depth: d } = object.dimensions;
  return (
    <>
      <Solid size={[w, 0.085, d]} at={[0, 0.045, 0]} material={body} />
      <Solid
        size={[w - 0.065, 0.012, d - 0.065]}
        at={[0, 0.087, 0]}
        color="#d7dfdb"
        roughness={0.24}
      />
      <Solid size={[0.11, 0.005, 0.11]} at={[w * 0.28, 0.096, -d * 0.28]} material={frame} />
      <mesh position={[0, h * 0.5, -d / 2 + 0.02]}>
        <boxGeometry args={[w, h - 0.1, 0.012]} />
        <meshPhysicalMaterial
          color="#b6d2cd"
          transparent
          opacity={0.13}
          roughness={0.08}
          metalness={0.04}
          depthWrite={false}
          side={DoubleSide}
          envMapIntensity={0.9}
        />
      </mesh>
      <mesh position={[-w / 2 + 0.02, h * 0.5, 0]}>
        <boxGeometry args={[0.012, h - 0.1, d]} />
        <meshPhysicalMaterial
          color="#b6d2cd"
          transparent
          opacity={0.13}
          roughness={0.08}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <mesh position={[0, h * 0.5, d / 2 - 0.015]}>
        <boxGeometry args={[w, h - 0.1, 0.012]} />
        <meshPhysicalMaterial
          color="#b6d2cd"
          transparent
          opacity={0.1}
          roughness={0.07}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <Solid
          key={side}
          size={[0.018, h, 0.018]}
          at={[side * (w / 2 - 0.02), h / 2, d / 2 - 0.015]}
          material={frame}
        />
      ))}
      <Solid size={[w, 0.018, 0.018]} at={[0, h - 0.01, d / 2 - 0.015]} material={frame} />
      <Solid size={[0.025, h * 0.48, 0.025]} at={[0, h * 0.65, -d * 0.43]} material={frame} />
      <Solid size={[0.025, 0.025, d * 0.32]} at={[0, h * 0.89, -d * 0.28]} material={frame} />
      <mesh position={[0, h * 0.88, -d * 0.14]} material={frame} castShadow>
        <cylinderGeometry args={[0.115, 0.115, 0.018, 32]} />
      </mesh>
      <mesh position={[0, h * 0.875, -d * 0.14]} rotation={[Math.PI / 2, 0, 0]} material={frame}>
        <torusGeometry args={[0.1, 0.004, 6, 32]} />
      </mesh>
      <FixtureControl
        object={object}
        capability="water"
        label={
          object.behaviours.some(
            (value) => value.kind === 'water' && value.state.powered && value.state.flow > 0,
          )
            ? 'Turn off shower'
            : 'Turn on shower'
        }
        position={[0, h * 0.42, -d * 0.36]}
      >
        <Solid size={[w * 0.26, 0.045, 0.055]} at={[0, h * 0.42, -d * 0.4]} material={frame} />
      </FixtureControl>
      <FixtureWater
        object={object}
        position={[0, h * 0.875, -d * 0.14]}
        length={h * 0.875 - 0.102}
        shower
      />
      <Solid size={[0.018, 0.24, 0.03]} at={[w * 0.3, h * 0.47, d / 2 - 0.015]} material={frame} />
    </>
  );
}
