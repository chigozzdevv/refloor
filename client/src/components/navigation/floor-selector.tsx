import { Layers3 } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';

export function FloorSelector() {
  const { compiled, floorId, setFloor } = useProject();
  return (
    <div className="floor-switch" aria-label="Choose floor">
      <Layers3 size={16} />
      {compiled.building.floors.map((floor) => (
        <button
          key={floor.id}
          className={floorId === floor.id ? 'selected' : ''}
          onClick={() => setFloor(floor.id)}
        >
          {floor.name}
        </button>
      ))}
    </div>
  );
}
