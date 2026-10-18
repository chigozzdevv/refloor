import { Edges } from '@react-three/drei';
import type { SceneObject } from '@refloor/scene';

export function SelectionOutline({ dimensions }: { dimensions: SceneObject['dimensions'] }) {
  return (
    <mesh position={[0, dimensions.height / 2, 0]} raycast={() => undefined}>
      <boxGeometry
        args={[dimensions.width + 0.025, dimensions.height + 0.025, dimensions.depth + 0.025]}
      />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      <Edges color="#c4a86d" transparent opacity={0.65} raycast={() => undefined} />
    </mesh>
  );
}
