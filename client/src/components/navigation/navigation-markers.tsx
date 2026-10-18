import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { Vector3 } from 'three';
import { contains } from '@refloor/engine/math';
import type { Destination } from '@/shared/navigation/destinations';
import { destinations, stairContinuation } from '@/shared/navigation/destinations';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { physicsSession } from '@/shared/navigation/physics-session';
import { useProject } from '@/shared/scene/scene-store';

function Marker({ destination }: { destination: Destination }) {
  const [inView, setInView] = useState(false);
  const projected = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    projected.set(destination.anchor.x, destination.anchor.y, destination.anchor.z).project(camera);
    const visible =
      projected.z > -1 &&
      projected.z < 1 &&
      Math.abs(projected.x) < 0.9 &&
      projected.y > -0.88 &&
      projected.y < 0.72;
    if (visible !== inView) setInView(visible);
  });
  const Icon =
    destination.kind === 'stairs'
      ? destination.direction === 'up'
        ? ArrowUp
        : ArrowDown
      : ChevronRight;
  return (
    <Html
      center
      occlude
      position={[destination.anchor.x, destination.anchor.y, destination.anchor.z]}
      zIndexRange={[15, 10]}
    >
      <button
        hidden={!inView}
        className={`navigation-marker marker-${destination.kind}`}
        aria-label={destination.label}
        title={destination.label}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          useProject.getState().select(null);
          useNavigation.getState().go(destination.target, destination.lookAt);
        }}
      >
        {destination.kind === 'room' ? <span className="marker-dot" /> : <Icon size={17} />}
      </button>
    </Html>
  );
}

export function NavigationMarkers() {
  const { compiled, mode, floorId, selection, interacting } = useProject();
  const request = useNavigation((state) => state.request);
  const all = useMemo(() => destinations(compiled), [compiled]);
  const [visible, setVisible] = useState<Destination[]>([]);
  const elapsed = useRef(1),
    projected = useMemo(() => new Vector3(), []);
  useFrame(({ camera }, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.2 || mode !== 'walk' || request || selection || interacting) return;
    elapsed.current = 0;
    const player = physicsSession.current?.player;
    if (!player) return;
    const floor = compiled.building.floors.find((value) => value.id === player.floorId),
      room = floor?.rooms.find((value) => contains(value.footprint, player.position));
    const continuing = stairContinuation(compiled, player);
    const candidates = (continuing.length ? continuing : all)
      .filter(
        (value) =>
          value.floorId === floorId &&
          (value.kind === 'stairs' || !room || value.roomId === room.id),
      )
      .map((value) => ({
        value,
        distance: Math.hypot(
          value.anchor.x - player.position.x,
          value.anchor.z - player.position.z,
        ),
      }))
      .filter(({ value, distance }) => distance < 11 && (value.kind !== 'room' || distance > 0.7))
      .filter(({ value }) => {
        projected.set(value.anchor.x, value.anchor.y, value.anchor.z).project(camera);
        return (
          projected.z > -1 &&
          projected.z < 1 &&
          Math.abs(projected.x) < 1 &&
          Math.abs(projected.y) < 1
        );
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 8)
      .map(({ value }) => value);
    setVisible((previous) =>
      previous.length === candidates.length && previous.every((value, i) => value === candidates[i])
        ? previous
        : candidates,
    );
  });
  if (mode !== 'walk' || request || selection || interacting) return null;
  return visible.map((destination) => (
    <Marker key={`${compiled.building.revision}:${destination.id}`} destination={destination} />
  ));
}
