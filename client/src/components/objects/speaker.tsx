import type { SceneObject } from '@refloor/scene';
import { finishes } from '@refloor/catalogue';
import { useSurface } from '@/shared/scene/asset-loader';
import { FurnitureSolid as Solid } from '@/components/scene/furniture-solid';

export function Speaker({ object }: { object: SceneObject }) {
  const { width: w, height: h, depth: d } = object.dimensions,
    body = useSurface(object.materials.body ?? finishes.walnutVeneer),
    frame = useSurface(object.materials.frame ?? finishes.black);
  return (
    <>
      <Solid size={[w, h - 0.025, d]} at={[0, h / 2 + 0.0125, 0]} material={body} />
      <Solid size={[w - 0.025, h - 0.05, 0.008]} at={[0, h / 2, d / 2 + 0.002]} material={frame} />
      {[0.28, 0.56, 0.8].map((fraction, index) => (
        <group
          key={fraction}
          position={[0, h * fraction, d / 2 + 0.009]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <mesh material={frame} castShadow>
            <cylinderGeometry args={[w * (index === 2 ? 0.13 : 0.37), w * 0.34, 0.012, 32]} />
          </mesh>
          <mesh position={[0, -0.009, 0]}>
            <sphereGeometry args={[w * (index === 2 ? 0.1 : 0.2), 24, 12]} />
            <meshStandardMaterial color="#202125" roughness={0.8} />
          </mesh>
        </group>
      ))}
      <Solid size={[w, 0.018, d]} at={[0, 0.009, 0]} material={frame} />
    </>
  );
}
