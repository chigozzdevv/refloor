import { useEffect, useRef, useState } from 'react';
import {
  Armchair,
  DoorOpen,
  Footprints,
  Globe2,
  Moon,
  Plus,
  Redo2,
  Rotate3D,
  Sun,
  Undo2,
  X,
} from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';
import { ProjectActions } from '@/components/editor/project-actions';
import { ElementChat } from '@/components/editor/element-chat';

export function StudioHeader({
  openNewHome,
  openLibrary,
}: {
  openNewHome: () => void;
  openLibrary: () => void;
}) {
  const {
    compiled,
    projectEpoch,
    mode,
    setMode,
    enterHome,
    lighting,
    setLighting,
    quality,
    setQuality,
    past,
    future,
    undo,
    redo,
    select,
  } = useProject();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  return (
    <header className="topbar">
      <a className="wordmark" href="/" aria-label="Refloor home">
        refloor<span className="brand-dot">®</span>
      </a>
      <div className="house-controls" ref={panel}>
        <button
          className="house-toggle"
          aria-label="House controls"
          aria-expanded={open}
          onClick={() => {
            select(null);
            setOpen(!open);
          }}
        >
          <Globe2 size={22} strokeWidth={1.5} />
        </button>
        {open && (
          <section className="house-menu" aria-label="House controls menu">
            <div className="panel-heading">
              <span>House</span>
              <button
                className="icon-button"
                aria-label="Close house controls"
                onClick={() => setOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <ElementChat
              key={projectEpoch}
              target={{ kind: 'house', id: compiled.building.id }}
              label="Whole house"
              suggestions={['Cream walls throughout', 'Turn off all lights']}
              close={() => setOpen(false)}
            />
            <div className="house-view-controls">
              {(
                [
                  ['walk', 'Walk', Footprints],
                  ['orbit', 'Explore', Rotate3D],
                  ['entry', 'Entrance', DoorOpen],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  className={mode === value ? 'active' : ''}
                  onClick={() => {
                    if (value === 'walk' && mode === 'entry') enterHome();
                    else setMode(value);
                    setOpen(false);
                  }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
            <div className="house-actions">
              <button
                onClick={() => {
                  if (mode === 'entry') setMode('orbit');
                  openLibrary();
                  setOpen(false);
                }}
              >
                <Armchair size={16} />
                Furniture
              </button>
              <button
                onClick={() => {
                  openNewHome();
                  setOpen(false);
                }}
              >
                <Plus size={16} />
                New house
              </button>
            </div>
            <div className="house-utilities">
              <ProjectActions />
              <button
                className="icon-button"
                aria-label="Undo"
                disabled={!past.length}
                onClick={undo}
              >
                <Undo2 size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Redo"
                disabled={!future.length}
                onClick={redo}
              >
                <Redo2 size={17} />
              </button>
              <button
                className="icon-button"
                aria-label={lighting === 'evening' ? 'Switch to daylight' : 'Switch to night'}
                onClick={() => setLighting(lighting === 'evening' ? 'day' : 'evening')}
              >
                {lighting === 'evening' ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <button
                className="quality-button"
                aria-label={`Render quality: ${quality}`}
                onClick={() => setQuality(quality === 'high' ? 'balanced' : 'high')}
              >
                {quality === 'high' ? 'HD' : 'SD'}
              </button>
            </div>
          </section>
        )}
      </div>
    </header>
  );
}
