import { useEffect, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { SceneObject } from '@refloor/scene';

export function SelectionBounds({ dimensions }: Pick<SceneObject, 'dimensions'>) {
  const geometry = useMemo(() => {
    const size = [dimensions.width + 0.04, dimensions.height + 0.04, dimensions.depth + 0.04];
    const points: number[] = [];
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        for (const z of [-1, 1]) {
          const corner = [(x * size[0]!) / 2, (y * size[1]!) / 2, (z * size[2]!) / 2];
          for (let axis = 0; axis < 3; axis++) {
            const end = [...corner];
            end[axis] =
              corner[axis]! - Math.sign(corner[axis]!) * Math.min(0.2, size[axis]! * 0.22);
            points.push(...corner, ...end);
          }
        }
    return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3));
  }, [dimensions.width, dimensions.height, dimensions.depth]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments
      geometry={geometry}
      position={[0, dimensions.height / 2, 0]}
      raycast={() => undefined}
      renderOrder={2}
    >
      <lineBasicMaterial
        color="#f3ce8d"
        transparent
        opacity={0.9}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  );
}
