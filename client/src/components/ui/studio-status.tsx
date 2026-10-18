import { useProject } from '@/shared/scene/scene-store';

export function StudioStatus() {
  const { compiled, quality, lighting, mode } = useProject();
  return (
    <>
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
    </>
  );
}
