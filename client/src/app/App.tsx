import {
  Layers3,
  Moon,
  MoveUpRight,
  Sun,
  X,
  Plus,
  Rotate3D,
  SlidersHorizontal,
  DoorOpen,
  Footprints,
} from 'lucide-react';
import { useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Viewport } from '@/features/viewport/Viewport';
import { useProject } from '@/features/projects/project-store';
import { WalkPad } from '@/features/viewport/WalkPad';
import { Inspector } from '@/features/editor/Inspector';
import { FurnitureLibrary } from '@/features/editor/FurnitureLibrary';
import { EditorToolbar } from '@/features/editor/EditorToolbar';
import { ProjectActions } from '@/features/projects/ProjectActions';

export function App() {
  const {
    compiled,
    remote,
    floorId,
    setFloor,
    lighting,
    setLighting,
    quality,
    setQuality,
    createHome,
    sceneReady,
    mode,
    setMode,
    enterHome,
    notice,
  } = useProject();
  const [newHome, setNewHome] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [width, setWidth] = useState(12),
    [depth, setDepth] = useState(10);
  return (
    <ErrorBoundary>
      <main className={`studio ${mode}-mode ${lighting}-lighting`}>
        <div className="viewport">
          <Viewport />
        </div>
        {!sceneReady && (
          <div className="loading-overlay">
            <div className="scene-loading">
              <span className="loader-mark">r.</span>
              <span>Bringing your space to life</span>
              <div className="load-track">
                <i />
              </div>
            </div>
          </div>
        )}
        <header className="topbar">
          <a className="wordmark" href="/" aria-label="Refloor home">
            refloor<span className="brand-dot">®</span>
          </a>
          <span className="header-divider" />
          <span className="project-name">
            {compiled.building.name}
            <span className="local-badge">{remote ? 'SAVED SPACE' : 'BROWSER DRAFT'}</span>
          </span>
          <div className="topbar-actions">
            <ProjectActions />
            <button
              className="button subtle new-space"
              aria-label="New space"
              onClick={() => setNewHome(true)}
            >
              <Plus size={15} />
              <span>New space</span>
            </button>
          </div>
        </header>
        {mode !== 'walk' && (
          <section className={`space-heading ${mode === 'entry' ? 'entry-heading' : ''}`}>
            <span className="eyebrow">A SPACE TO MAKE YOUR OWN</span>
            <h1>
              {mode === 'entry' ? 'Step inside.' : 'Good spaces.'}
              <br />
              <em>{mode === 'entry' ? 'Make it yours.' : 'Better living.'}</em>
            </h1>
            <p>
              {mode === 'entry'
                ? 'Your next chapter starts at the door.'
                : 'Look around. Find your angle.'}
              <br />
              Make yourself at home.
            </p>
            {mode === 'entry' && (
              <div className="entry-actions">
                <button className="button primary" onClick={enterHome}>
                  Open the door <MoveUpRight size={16} />
                </button>
                <span>Or drag the brass handle.</span>
              </div>
            )}
          </section>
        )}
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
        {mode !== 'entry' && (
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
        )}
        <div className="viewport-note">
          <span className="live-dot" />
          {quality === 'high' ? 'High fidelity' : 'Balanced'}
          <span className="note-separator">/</span>
          {lighting === 'day' ? 'Late afternoon' : 'Evening glow'}
        </div>
        <div className="interaction-hint">
          <span className="mouse-icon" />
          {mode === 'walk' ? (
            <>
              WASD to move<span>·</span>Drag to look<span>·</span>Click a door to open
            </>
          ) : mode === 'entry' ? (
            <>A little curiosity goes a long way.</>
          ) : (
            <>
              Drag to orbit<span>·</span>Scroll to zoom<span>·</span>Click to select
            </>
          )}
        </div>
        {mode !== 'walk' && (
          <div className="space-stats">
            <span>
              {compiled.building.floors.length}{' '}
              {compiled.building.floors.length === 1 ? 'STOREY' : 'STOREYS'}
            </span>
            <span>
              {Math.round(
                compiled.building.floors.reduce(
                  (sum, floor) => sum + floor.footprint.width * floor.footprint.depth,
                  0,
                ),
              )}{' '}
              M²
            </span>
            <span>{compiled.building.objects.length} OBJECTS</span>
          </div>
        )}
        {mode === 'walk' && <WalkPad />}
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        <EditorToolbar openLibrary={() => setLibraryOpen(!libraryOpen)} />
        {mode !== 'entry' && <Inspector />}
        {libraryOpen && mode !== 'entry' && (
          <FurnitureLibrary key={floorId} close={() => setLibraryOpen(false)} />
        )}
        {newHome && (
          <div className="modal-backdrop" onClick={() => setNewHome(false)}>
            <section
              className="create-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Create a new space"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="panel-heading">
                <span className="eyebrow">START WITH A SPACE</span>
                <button
                  className="icon-button"
                  onClick={() => setNewHome(false)}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <h2>Room for possibilities.</h2>
              <p>Choose a starting home. Every room and object is yours to change.</p>
              <div className="home-dimensions">
                <label className="field-caption">
                  WIDTH · M
                  <input
                    aria-label="House width"
                    type="number"
                    min={11.5}
                    max={16}
                    step={0.5}
                    value={width}
                    onChange={(event) => setWidth(event.target.valueAsNumber)}
                  />
                </label>
                <label className="field-caption">
                  DEPTH · M
                  <input
                    aria-label="House depth"
                    type="number"
                    min={9.5}
                    max={14}
                    step={0.5}
                    value={depth}
                    onChange={(event) => setDepth(event.target.valueAsNumber)}
                  />
                </label>
              </div>
              {([1, 2] as const).map((storeys) => (
                <button
                  key={storeys}
                  className="home-option"
                  onClick={() => {
                    try {
                      createHome(storeys, width, depth);
                      setNewHome(false);
                    } catch {
                      useProject
                        .getState()
                        .notify('Choose a width from 11.5–16 m and a depth from 9.5–14 m.');
                    }
                  }}
                >
                  <span>
                    <strong>{storeys === 1 ? 'The Garden House' : 'The Linden House'}</strong>
                    <small>
                      {storeys === 1
                        ? `A light-filled bungalow · ${Math.round(width * depth)} m²`
                        : `Two storeys, room to grow · ${Math.round(width * depth * 2)} m²`}
                    </small>
                  </span>
                  <MoveUpRight size={20} />
                </button>
              ))}
            </section>
          </div>
        )}
        <div className="north-marker">
          N<span>↑</span>
        </div>
      </main>
    </ErrorBoundary>
  );
}
