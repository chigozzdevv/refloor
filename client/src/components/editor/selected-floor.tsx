import { Select } from '@react-three/postprocessing';
import { useProject } from '@/shared/scene/scene-store';

export function SelectedFloor() {
  const { selection, compiled } = useProject();
  if (selection?.kind !== 'floor') return null;
  for (const floor of compiled.building.floors) {
    const room = floor.rooms.find((value) => value.id === selection.id);
    if (!room) continue;
    const fp = room.footprint;
    return (
      <Select enabled>
        <mesh
          position={[fp.x + fp.width / 2, floor.elevation + 0.008, fp.z + fp.depth / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => undefined}
        >
          <planeGeometry args={[fp.width - 0.12, fp.depth - 0.12]} />
          <meshBasicMaterial color="#edc379" transparent opacity={0.12} depthWrite={false} />
        </mesh>
      </Select>
    );
  }
  return null;
}
