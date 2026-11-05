import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { useProject } from '@/shared/scene/scene-store';
import { mapDestination } from '@/shared/navigation/map-route';
import { physicsSession } from '@/shared/navigation/physics-session';
import { entryPose } from '@/shared/navigation/entry';
import { MapPlan } from '@/components/navigation/map-plan';

export function HouseMap({ obscured = false }: { obscured?: boolean }) {
  const { compiled, mode, projectEpoch, floorId: activeFloorId } = useProject(),
    { player, heading, mapOpen, setMapOpen, go } = useNavigation();
  const dialog = useRef<HTMLDialogElement>(null),
    expand = useRef<HTMLButtonElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  const [viewFloor, setViewFloor] = useState<string | null>(null);
  const entry = useMemo(() => entryPose(compiled), [compiled]),
    currentPlayer = mode === 'entry' ? { floorId: entry.floorId, position: entry.inside } : player,
    currentFloor = mode === 'orbit' ? activeFloorId : (currentPlayer?.floorId ?? entry.floorId),
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
    if (!mapOpen || obscured || !dialog.current) return;
    const element = dialog.current;
    element.showModal();
    return () => {
      element.close();
      const target = returnFocus.current;
      (target?.isConnected ? target : expand.current)?.focus({ preventScroll: true });
    };
  }, [mapOpen, obscured]);
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
  if (obscured) return null;
  if (!mapOpen)
    return mode !== 'entry' ? (
      <section className="map-mini" aria-label="House minimap">
        <button
          ref={expand}
          className="map-expand"
          aria-label="Expand house map"
          onClick={(event) => {
            returnFocus.current = event.currentTarget;
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
    <dialog
      ref={dialog}
      className="map-backdrop"
      aria-label="House map"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement | SVGElement>(
            'button:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = items[0],
          last = items.at(-1),
          active = document.activeElement;
        if (event.shiftKey && active === first && last) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last && first) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        setMapOpen(false);
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setMapOpen(false);
      }}
    >
      <section className="house-map" onPointerDown={(event) => event.stopPropagation()}>
        <div className="plan-toolbar">
          <div className="map-floors" role="tablist" aria-label="Map floors">
            {compiled.building.floors.map((floor) => (
              <button
                key={floor.id}
                role="tab"
                aria-selected={floor.id === floorId}
                tabIndex={floor.id === floorId ? 0 : -1}
                onClick={() => setViewFloor(floor.id)}
                onKeyDown={(event) => {
                  const floors = compiled.building.floors;
                  const index = floors.findIndex((value) => value.id === floor.id);
                  const next =
                    event.key === 'ArrowRight'
                      ? (index + 1) % floors.length
                      : event.key === 'ArrowLeft'
                        ? (index + floors.length - 1) % floors.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? floors.length - 1
                            : null;
                  if (next === null) return;
                  event.preventDefault();
                  setViewFloor(floors[next]!.id);
                  event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus();
                }}
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
    </dialog>
  );
}
