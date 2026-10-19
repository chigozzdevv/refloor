import { useEffect, useMemo, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { useProject } from '@/shared/scene/scene-store';
import { mapDestination } from '@/shared/navigation/map-route';
import { physicsSession } from '@/shared/navigation/physics-session';
import { entryPose } from '@/shared/navigation/entry';
import { MapPlan } from '@/components/navigation/map-plan';

export function HouseMap() {
  const { compiled, mode, projectEpoch } = useProject(),
    { player, heading, mapOpen, setMapOpen, go } = useNavigation();
  const [viewFloor, setViewFloor] = useState<string | null>(null);
  const entry = useMemo(() => entryPose(compiled), [compiled]),
    currentPlayer = mode === 'entry' ? { floorId: entry.floorId, position: entry.inside } : player,
    currentFloor = currentPlayer?.floorId ?? entry.floorId,
    floorId = viewFloor ?? currentFloor;
  useEffect(() => {
    setViewFloor(null);
  }, [currentFloor, projectEpoch]);
  useEffect(() => {
    useNavigation.setState({
      player: null,
      heading: 0,
      portals: [],
      request: null,
      mapOpen: false,
    });
  }, [projectEpoch, setMapOpen]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMapOpen(false);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [setMapOpen]);
  const travel = (roomId: string) => {
    const state = useProject.getState(),
      entry = entryPose(compiled),
      from = physicsSession.current?.player ?? { floorId: entry.floorId, position: entry.inside };
    const destination = mapDestination(compiled, from, roomId);
    if (!destination) {
      state.notify('There is no clear route to this room.');
      return;
    }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    state.select(null);
    if (state.mode === 'entry') state.enterHome();
    else if (state.mode !== 'walk') state.setMode('walk');
    setMapOpen(false);
    go(destination.target, destination.lookAt, destination.label);
  };
  if (!mapOpen)
    return mode !== 'entry' ? (
      <section className="map-mini" aria-label="House minimap">
        <button
          className="map-expand"
          aria-label="Expand house map"
          onClick={() => {
            useNavigation.getState().stop();
            useProject.getState().select(null);
            setMapOpen(true);
          }}
        >
          <Maximize2 size={13} />
        </button>
        <MapPlan
          compiled={compiled}
          floorId={currentFloor}
          player={currentPlayer}
          heading={heading}
          compact
          navigate={travel}
        />
      </section>
    ) : null;
  return (
    <div className="map-backdrop" onPointerDown={() => setMapOpen(false)}>
      <section
        className="house-map"
        role="dialog"
        aria-label="House map"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="plan-toolbar">
          <div className="map-floors" role="tablist" aria-label="Map floors">
            {compiled.building.floors.map((floor) => (
              <button
                key={floor.id}
                role="tab"
                aria-selected={floor.id === floorId}
                onClick={() => setViewFloor(floor.id)}
              >
                {floor.name}
              </button>
            ))}
          </div>
          <button className="icon-button" aria-label="Close map" onClick={() => setMapOpen(false)}>
            <X size={17} />
          </button>
        </div>
        <MapPlan
          compiled={compiled}
          floorId={floorId}
          player={currentPlayer}
          heading={heading}
          navigate={travel}
        />
      </section>
    </div>
  );
}
