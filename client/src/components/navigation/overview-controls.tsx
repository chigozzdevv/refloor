import { House, Layers2 } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';

export function OverviewControls() {
  const { mode, compiled, cutaway, floorId } = useProject();
  if (mode !== 'orbit') return null;
  const Icon = cutaway ? House : Layers2;
  return (
    <div className="overview-controls" aria-label="Overview controls">
      <button
        aria-label={cutaway ? 'Show exterior' : 'Show interior'}
        onClick={() =>
          useProject.setState({ cutaway: !cutaway, selection: null, focusRequest: null })
        }
      >
        <Icon size={16} />
        {cutaway ? 'Exterior' : 'Interior'}
      </button>
      {cutaway && compiled.building.floors.length > 1 && (
        <select
          aria-label="Overview floor"
          value={floorId}
          onChange={(event) =>
            useProject.setState({
              floorId: event.target.value,
              selection: null,
              focusRequest: null,
            })
          }
        >
          {compiled.building.floors.map((floor) => (
            <option key={floor.id} value={floor.id}>
              {floor.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
