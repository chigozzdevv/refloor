import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { Raycaster, Vector3 } from 'three';
import { contains } from '@refloor/engine/math';
import type { Destination } from '@/shared/navigation/destinations';
import { destinations, nearbyRoute, stairContinuation } from '@/shared/navigation/destinations';
import { organizeMarkers } from '@/shared/navigation/marker-layout';
import { roomExit } from '@/shared/navigation/room-exit';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { physicsSession } from '@/shared/navigation/physics-session';
import { useProject } from '@/shared/scene/scene-store';
import { isVisible } from '@/shared/editor/picking';

function Marker({ destination, primary }: { destination: Destination; primary: boolean }) {
  const [hovered, setHovered] = useState(false);
  const floor = destination.kind === 'room' || destination.kind === 'waypoint';
  const Icon =
    destination.kind === 'stairs'
      ? destination.direction === 'up'
        ? ArrowUp
        : ArrowDown
      : ChevronRight;
  const travel = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    useProject.getState().select(null);
    useNavigation.getState().go(destination.target, destination.lookAt, destination.label);
  };
  return (
    <group position={[destination.anchor.x, destination.anchor.y, destination.anchor.z]}>
      {floor && (
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <mesh
            position={[0, 0, 0.003]}
            userData={{ navigationMarker: true }}
            onClick={(event) => {
              event.stopPropagation();
              if (event.delta < 5) travel();
            }}
          >
            <circleGeometry args={[0.21, 48]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
          </mesh>
          <mesh raycast={() => undefined}>
            <ringGeometry args={[0.16, 0.195, 48]} />
            <meshBasicMaterial
              color={primary || hovered ? '#e6c58c' : '#ffffff'}
              transparent
              opacity={0.9}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 0, -0.001]} raycast={() => undefined}>
            <circleGeometry args={[0.155, 40]} />
            <meshBasicMaterial
              color="#101720"
              transparent
              opacity={0.4}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 0, 0.002]} raycast={() => undefined}>
            <circleGeometry args={[0.026, 20]} />
            <meshBasicMaterial color={primary ? '#e6c58c' : '#ffffff'} toneMapped={false} />
          </mesh>
        </group>
      )}
      <Html center zIndexRange={[15, 10]}>
        <button
          className={`navigation-marker ${floor ? 'marker-floor' : 'marker-portal'} ${primary ? 'marker-primary' : ''}`}
          aria-label={destination.label}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            travel();
          }}
        >
          {!floor && (
            <span className="marker-symbol">
              <Icon size={16} />
            </span>
          )}
          <span className="marker-caption">{destination.caption ?? destination.label}</span>
        </button>
      </Html>
    </group>
  );
}

export function NavigationMarkers() {
  const { compiled, mode, floorId, selection, interacting } = useProject();
  const request = useNavigation((state) => state.request);
  const all = useMemo(() => destinations(compiled), [compiled]);
  const exits = useMemo(() => new Map<string, Destination | null>(), [compiled]);
  const [visible, setVisible] = useState<Destination[]>([]);
  const elapsed = useRef(1),
    projected = useMemo(() => new Vector3(), []),
    anchor = useMemo(() => new Vector3(), []),
    raycaster = useMemo(() => new Raycaster(), []);
  useFrame(({ camera, scene, size }, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.16 || mode !== 'walk') return;
    elapsed.current = 0;
    const player = physicsSession.current?.player;
    if (!player) return;
    const floor = compiled.building.floors.find((value) => value.id === player.floorId),
      room = floor?.rooms.find((value) => contains(value.footprint, player.position)),
      continuing = stairContinuation(compiled, player);
    if (room && !exits.has(room.id)) exits.set(room.id, roomExit(compiled, player, all));
    camera.updateMatrixWorld();
    const candidates = (continuing.length ? continuing : all)
      .filter((destination) => {
        if (
          destination.floorId !== floorId ||
          (!continuing.length &&
            destination.kind !== 'stairs' &&
            room &&
            destination.roomId !== room.id)
        )
          return false;
        const distance = Math.hypot(
          destination.anchor.x - player.position.x,
          destination.anchor.z - player.position.z,
        );
        const limit = destination.kind === 'stairs' ? 4 : destination.kind === 'door' ? 6 : 5;
        if (
          distance > limit ||
          ((destination.kind === 'room' || destination.kind === 'waypoint') && distance < 0.85)
        )
          return false;
        anchor.set(destination.anchor.x, destination.anchor.y, destination.anchor.z);
        const length = anchor.distanceTo(camera.position);
        raycaster.set(camera.position, anchor.clone().sub(camera.position).normalize());
        raycaster.near = 0.05;
        raycaster.far = Math.max(0.05, length - 0.08);
        if (
          raycaster
            .intersectObjects(scene.children, true)
            .some((hit) => !hit.object.userData.navigationMarker && isVisible(hit.object))
        )
          return false;
        if (!continuing.length && floor) {
          const approach = destination.approach ?? destination.target;
          if (
            !nearbyRoute(
              compiled,
              { floorId: floor.id, position: { ...player.position, y: floor.elevation } },
              approach,
              destination.kind === 'door' ? 'openable' : 'current',
            )
          )
            return false;
        }
        return true;
      })
      .map((destination) => ({
        destination,
        distance: Math.hypot(
          destination.anchor.x - player.position.x,
          destination.anchor.z - player.position.z,
        ),
      }));
    const next = [...candidates].sort((a, b) => a.distance - b.distance)[0]?.destination;
    useNavigation.getState().setContext(
      continuing.length ? 'Stairs' : (room?.name ?? floor?.name ?? ''),
      next
        ? {
            x: next.anchor.x,
            y: Math.max(next.anchor.y, player.position.y + 0.45),
            z: next.anchor.z,
          }
        : null,
      room && !continuing.length ? (exits.get(room.id) ?? null) : null,
    );
    if (request || selection || interacting) return;
    const layout = organizeMarkers(
      candidates.flatMap(({ destination, distance }) => {
        projected
          .set(destination.anchor.x, destination.anchor.y, destination.anchor.z)
          .project(camera);
        return projected.z > -1 && projected.z < 1
          ? [
              {
                destination,
                distance,
                x: ((projected.x + 1) * size.width) / 2,
                y: ((1 - projected.y) * size.height) / 2,
              },
            ]
          : [];
      }),
      size.width,
      size.height,
    ).map((value) => value.destination);
    setVisible((previous) =>
      previous.length === layout.length &&
      previous.every(
        (value, index) =>
          value.id === layout[index]?.id &&
          value.anchor.x === layout[index]?.anchor.x &&
          value.anchor.y === layout[index]?.anchor.y &&
          value.anchor.z === layout[index]?.anchor.z,
      )
        ? previous
        : layout,
    );
  });
  if (mode !== 'walk' || request || selection || interacting) return null;
  return visible.map((destination, index) => (
    <Marker
      key={`${compiled.building.revision}:${destination.id}`}
      primary={index === 0}
      destination={destination}
    />
  ));
}
