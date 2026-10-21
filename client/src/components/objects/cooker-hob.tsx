import { useEffect, useMemo } from 'react';
import { BoxGeometry, CylinderGeometry, TorusGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function CookerHob({ x, y, depth }: { x: number; y: number; depth: number }) {
  const geometry = useMemo(() => {
    const iron = [],
      caps = [];
    for (const side of [-1, 1])
      for (const row of [-1, 1]) {
        const bx = side * 0.14,
          bz = row * Math.min(0.12, depth * 0.2),
          radius = row === 1 ? 0.057 : 0.049;
        const ring = new TorusGeometry(radius + 0.014, 0.0035, 6, 24);
        ring.rotateX(-Math.PI / 2);
        ring.translate(bx, 0.015, bz);
        iron.push(ring);
        const cap = new CylinderGeometry(radius, radius + 0.002, 0.012, 24);
        cap.translate(bx, 0.017, bz);
        caps.push(cap);
        for (let index = 0; index < 4; index++) {
          const angle = (index * Math.PI) / 2,
            grate = new BoxGeometry(0.078, 0.012, 0.008);
          grate.rotateY(angle);
          grate.translate(bx + Math.cos(angle) * 0.064, 0.035, bz - Math.sin(angle) * 0.064);
          iron.push(grate);
        }
      }
    const result = { iron: mergeGeometries(iron), caps: mergeGeometries(caps) };
    [...iron, ...caps].forEach((part) => part.dispose());
    return result;
  }, [depth]);
  useEffect(
    () => () => {
      geometry.iron.dispose();
      geometry.caps.dispose();
    },
    [geometry],
  );
  return (
    <group position={[x, y, 0]}>
      <mesh geometry={geometry.iron} castShadow receiveShadow>
        <meshStandardMaterial color="#34383a" metalness={0.65} roughness={0.48} />
      </mesh>
      <mesh geometry={geometry.caps} castShadow receiveShadow>
        <meshStandardMaterial color="#14191b" metalness={0.35} roughness={0.62} />
      </mesh>
    </group>
  );
}
