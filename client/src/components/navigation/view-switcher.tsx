import { DoorOpen, Footprints, Moon, Rotate3D, SlidersHorizontal, Sun } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';

export function ViewSwitcher() {
  const { mode, setMode, lighting, setLighting, quality, setQuality } = useProject();
  return (
    <aside className="left-rail" aria-label="Viewport settings">
      <button
        className={`rail-button ${mode === 'orbit' ? 'active' : ''}`}
        title="Orbit the house"
        onClick={() => setMode('orbit')}
      >
        <Rotate3D size={20} />
      </button>
      <button
        className={`rail-button ${mode === 'walk' ? 'active' : ''}`}
        title="Walk through the house"
        onClick={() => setMode('walk')}
      >
        <Footprints size={20} />
      </button>
      <button
        className={`rail-button ${mode === 'entry' ? 'active' : ''}`}
        title="Return to the entrance"
        onClick={() => setMode('entry')}
      >
        <DoorOpen size={20} />
      </button>
      <div className="rail-divider" />
      <button
        className={`rail-button ${lighting === 'day' ? 'active' : ''}`}
        onClick={() => setLighting('day')}
        title="Daylight"
      >
        <Sun size={19} />
      </button>
      <button
        className={`rail-button ${lighting === 'evening' ? 'active' : ''}`}
        onClick={() => setLighting('evening')}
        title="Evening"
      >
        <Moon size={19} />
      </button>
      <div className="rail-divider" />
      <button
        className="rail-button"
        onClick={() => setQuality(quality === 'high' ? 'balanced' : 'high')}
        title={`Render quality: ${quality}`}
      >
        <SlidersHorizontal size={19} />
      </button>
    </aside>
  );
}
