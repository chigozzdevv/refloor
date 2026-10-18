import {
  Layers3,
  Moon,
  MoveUpRight,
  Sun,
  X,
  Box,
  Plus,
  Rotate3D,
  SlidersHorizontal,
} from 'lucide-react';
import { useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Viewport } from '@/features/viewport/Viewport';
import { useProject } from '@/features/projects/project-store';

export function App() {
  const {
    compiled,
    floorId,
    setFloor,
    lighting,
    setLighting,
    quality,
    setQuality,
    selection,
    select,
    createHome,
    sceneReady,
  } = useProject();
  const [newHome, setNewHome] = useState(false);
  const object = compiled.building.objects.find((value) => value.id === selection?.id),
    wall = compiled.building.floors
      .flatMap((floor) => floor.walls)
      .find((value) => value.id === selection?.id);
  return (
    <ErrorBoundary>
      <main className="studio">
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
            <span className="local-badge">STUDIO</span>
          </span>
          <div className="topbar-actions">
            <button className="button subtle" onClick={() => setNewHome(true)}>
              <Plus size={15} />
              New space
            </button>
          </div>
        </header>
        <section className="space-heading">
          <span className="eyebrow">A SPACE TO MAKE YOUR OWN</span>
          <h1>
            Good spaces.
            <br />
            <em>Better living.</em>
          </h1>
          <p>
            Look around. Find your angle.
            <br />
            Make yourself at home.
          </p>
        </section>
        <aside className="left-rail" aria-label="Viewport settings">
          <button className="rail-button active" title="Orbit the house">
            <Rotate3D size={20} />
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
        <div className="viewport-note">
          <span className="live-dot" />
          {quality === 'high' ? 'High fidelity' : 'Balanced'}
          <span className="note-separator">/</span>
          {lighting === 'day' ? 'Late afternoon' : 'Evening glow'}
        </div>
        <div className="interaction-hint">
          <span className="mouse-icon" />
          Drag to orbit<span>·</span>Scroll to zoom<span>·</span>Click to select
        </div>
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
        {selection && (
          <aside className="inspector">
            <div className="panel-heading">
              <span className="eyebrow">IN YOUR SPACE</span>
              <button
                className="icon-button"
                onClick={() => select(null)}
                aria-label="Close object details"
              >
                <X size={18} />
              </button>
            </div>
            <div className="object-icon">
              <Box size={26} />
            </div>
            <h2>{object?.label ?? 'Interior wall'}</h2>
            <p>
              {object
                ? `${object.dimensions.width} × ${object.dimensions.depth} × ${object.dimensions.height} m`
                : `Finish: ${wall?.material.color ?? ''}`}
            </p>
            <span className="detail-caption">{object?.kind ?? 'Architectural surface'}</span>
          </aside>
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
              {([1, 2] as const).map((storeys) => (
                <button
                  key={storeys}
                  className="home-option"
                  onClick={() => {
                    createHome(storeys);
                    setNewHome(false);
                  }}
                >
                  <span>
                    <strong>{storeys === 1 ? 'The Garden House' : 'The Linden House'}</strong>
                    <small>
                      {storeys === 1
                        ? 'A light-filled bungalow · 120 m²'
                        : 'Two storeys, room to grow · 240 m²'}
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
