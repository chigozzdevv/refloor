import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Object3D } from 'three';
import type { InstancedMesh } from 'three';
import type { CompiledBuilding } from '@refloor/engine';
import { compoundTiles, exteriorLayout } from '@/shared/scene/exterior';

export function Compound({ compiled }: { compiled: CompiledBuilding }) {
  const site = useMemo(() => exteriorLayout(compiled), [compiled]);
  const paving = useRef<InstancedMesh>(null);
  const tiles = useMemo(() => compoundTiles(site), [site]);
  useLayoutEffect(() => {
    if (!paving.current) return;
    const dummy = new Object3D(),
      color = new Color();
    tiles.forEach((tile, index) => {
      dummy.position.set(tile.x, site.ground.elevation - 0.125, tile.z);
      dummy.updateMatrix();
      paving.current!.setMatrixAt(index, dummy.matrix);
      paving.current!.setColorAt(index, color.setHSL(0.11, 0.055, 0.48 + tile.shade));
    });
    paving.current.instanceMatrix.needsUpdate = true;
    if (paving.current.instanceColor) paving.current.instanceColor.needsUpdate = true;
    paving.current.computeBoundingSphere();
  }, [tiles, site]);
  return (
    <group>
      <mesh
        position={[
          site.compound.x + site.compound.width / 2,
          site.ground.elevation - 0.18,
          site.compound.z + site.compound.depth / 2,
        ]}
        receiveShadow
      >
        <boxGeometry args={[site.compound.width, 0.06, site.compound.depth]} />
        <meshStandardMaterial color="#6b6b61" roughness={1} />
      </mesh>
      <instancedMesh
        ref={paving}
        args={[undefined, undefined, tiles.length]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[0.43, 0.06, 0.21]} />
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>
      {[-1, 1].flatMap((side) => [
        <mesh
          key={`z:${side}`}
          position={[
            site.compound.x + site.compound.width / 2,
            site.ground.elevation - 0.08,
            site.compound.z + (side > 0 ? site.compound.depth : 0),
          ]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[site.compound.width + 0.2, 0.18, 0.16]} />
          <meshStandardMaterial color="#aaa99b" roughness={0.9} />
        </mesh>,
        <mesh
          key={`x:${side}`}
          position={[
            site.compound.x + (side > 0 ? site.compound.width : 0),
            site.ground.elevation - 0.08,
            site.compound.z + site.compound.depth / 2,
          ]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[0.16, 0.18, site.compound.depth]} />
          <meshStandardMaterial color="#aaa99b" roughness={0.9} />
        </mesh>,
      ])}
    </group>
  );
}
