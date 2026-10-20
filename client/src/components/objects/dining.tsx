import { FurnitureSolid as Solid } from '@/components/scene/furniture-solid';
import type { FixtureProps } from '@/components/objects/fixture-props';

export function Table({ object, body, frame, desk = false }: FixtureProps & { desk?: boolean }) {
  const { width: w, height: h, depth: d } = object.dimensions;
  return (
    <>
      <Solid size={[w, 0.045, d]} at={[0, h - 0.0225, 0]} material={body} radius={0.022} />
      <Solid size={[w - 0.2, 0.035, 0.045]} at={[0, h - 0.08, -d / 2 + 0.09]} material={frame} />
      {desk && (
        <>
          <Solid size={[w * 0.3, 0.12, d - 0.12]} at={[-w * 0.27, h - 0.11, 0]} material={body} />
          <Solid
            size={[w * 0.12, 0.012, 0.012]}
            at={[-w * 0.27, h - 0.1, d / 2 - 0.054]}
            material={frame}
          />
        </>
      )}
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <mesh
            key={`${x}:${z}`}
            position={[x * (w / 2 - 0.11), (h - 0.045) / 2, z * (d / 2 - 0.1)]}
            material={frame}
            castShadow
            receiveShadow
          >
            <cylinderGeometry args={[0.028, 0.017, h - 0.045, 12]} />
          </mesh>
        )),
      )}
    </>
  );
}

export function DiningChair({ object, body, frame }: FixtureProps) {
  const { width: w, height: h, depth: d } = object.dimensions;
  return (
    <>
      <Solid
        size={[w - 0.015, 0.075, d - 0.025]}
        at={[0, h * 0.53, 0]}
        material={body}
        radius={0.037}
      />
      <Solid
        size={[w - 0.025, h * 0.37, 0.075]}
        at={[0, h * 0.8, -d * 0.365]}
        material={body}
        rotation={[0.12, 0, 0]}
        radius={0.037}
      />
      <Solid size={[w * 0.73, 0.03, d * 0.73]} at={[0, h * 0.47, 0]} material={frame} />
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <mesh
            key={`${x}:${z}`}
            position={[x * w * 0.36, h * 0.235, z * d * 0.34]}
            rotation={[z * -0.045, 0, x * 0.045]}
            material={frame}
            castShadow
          >
            <cylinderGeometry args={[0.022, 0.012, h * 0.47, 12]} />
          </mesh>
        )),
      )}
    </>
  );
}
