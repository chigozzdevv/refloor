import { useEffect, useRef, useState } from 'react';
import {
  Armchair,
  DoorOpen,
  Footprints,
  Globe2,
  History,
  LoaderCircle,
  Moon,
  Plus,
  Rotate3D,
  Sun,
  WandSparkles,
  X,
} from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';
import { ProjectActions } from '@/components/editor/project-actions';
import { ElementChat } from '@/components/editor/element-chat';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { EditHistory } from '@/components/editor/edit-history';
import { useFurnishings } from '@/shared/editor/use-furnishings';

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
    select,
  } = useProject();
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { furnishing, complete } = useFurnishings();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) {
        setOpen(false);
        setHistoryOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setHistoryOpen(false);
      }
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
          aria-label="Edit history"
          aria-expanded={historyOpen}
          onClick={() => {
            useNavigation.getState().stop();
            select(null);
            setOpen(false);
            setHistoryOpen(!historyOpen);
          }}
        >
          <History size={20} strokeWidth={1.5} />
        </button>
        <button
          className="house-toggle"
          aria-label="House controls"
          aria-expanded={open}
          onClick={() => {
            useNavigation.getState().stop();
            setHistoryOpen(false);
            select(null);
            setOpen(!open);
          }}
        >
          <Globe2 size={22} strokeWidth={1.5} />
        </button>
        {historyOpen && <EditHistory close={() => setHistoryOpen(false)} />}
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
                  ['orbit', 'Overview', Rotate3D],
                  ['entry', 'Entrance', DoorOpen],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  className={mode === value ? 'active' : ''}
                  aria-label={value === 'orbit' ? 'House overview' : label}
                  onClick={() => {
                    if (value === 'orbit') useNavigation.getState().resetOverview();
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
                disabled={furnishing}
                onClick={() => {
                  void complete();
                }}
              >
                {furnishing ? (
                  <LoaderCircle size={16} className="spinning" />
                ) : (
                  <WandSparkles size={16} />
                )}
                {furnishing ? 'Furnishing…' : 'Complete furnishings'}
              </button>
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
