import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Raycaster, Vector3 } from 'three';
import { contains } from '@refloor/engine/math';
import type { Destination } from '@/shared/navigation/destinations';
import {
  destinations,
  destinationRoute,
  stairContinuation,
} from '@/shared/navigation/destinations';
import { organizeMarkers } from '@/shared/navigation/marker-layout';
import { navigationCues, tourPortals } from '@/shared/navigation/portals';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { physicsSession } from '@/shared/navigation/physics-session';
import { useProject } from '@/shared/scene/scene-store';
import { belongsToDoor, isVisible } from '@/shared/editor/picking';
import { ArrowDown, ArrowUp, DoorClosed, DoorOpen } from 'lucide-react';
import { useExperience } from '@/shared/scene/experience-store';

function Marker({ destination, primary }: { destination: Destination; primary: boolean }) {
  const [hovered, setHovered] = useState(false);
  const portal = destination.kind === 'door' || destination.kind === 'stairs';
  const doorway = destination.kind === 'door';
  const open = useProject(
    (state) => state.compiled.doors.find((door) => door.id === destination.doorId)?.open,
  );
  const DoorIcon = open ? DoorOpen : DoorClosed;
  const StairIcon = destination.direction === 'down' ? ArrowDown : ArrowUp;
  const travel = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    useProject.getState().select(null);
    useNavigation
      .getState()
      .go(destination.target, destination.lookAt, destination.label, destination.doorId);
  };
  return (
    <group position={[destination.anchor.x, destination.anchor.y, destination.anchor.z]}>
      {!doorway && (
        <group rotation={[-Math.PI / 2, 0, 0]} scale={destination.kind === 'stairs' ? 0.7 : 1}>
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
          {!portal && (
            <mesh position={[0, 0, 0.002]} raycast={() => undefined}>
              <circleGeometry args={[0.026, 20]} />
              <meshBasicMaterial color={primary ? '#e6c58c' : '#ffffff'} toneMapped={false} />
            </mesh>
          )}
        </group>
      )}
      <Html center zIndexRange={[15, 10]}>
        <button
          className={`navigation-marker marker-floor ${portal ? 'marker-portal' : ''} ${primary ? 'marker-primary' : ''} ${doorway ? 'marker-door' : ''} ${destination.kind === 'stairs' ? 'marker-stairs' : ''}`}
          data-navigation-target={destination.id}
          data-direction={destination.direction}
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
          {doorway && <DoorIcon size={19} strokeWidth={1.6} />}
          {destination.kind === 'stairs' && <StairIcon size={20} strokeWidth={1.8} />}
          <span className="marker-caption">{destination.caption ?? destination.label}</span>
        </button>
      </Html>
    </group>
  );
}

export function NavigationMarkers() {
  const stage = useExperience((state) => state.stage);
  const { compiled, mode, selection, interacting } = useProject();
  const { request, mapOpen } = useNavigation();
  const all = useMemo(() => destinations(compiled), [compiled]);
  const [visible, setVisible] = useState<Destination[]>([]);
  const elapsed = useRef(1),
    projected = useMemo(() => new Vector3(), []),
    anchor = useMemo(() => new Vector3(), []),
    raycaster = useMemo(() => new Raycaster(), []);
  useFrame(({ camera, scene, size }, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.16 || mode !== 'walk' || stage !== 'ready') return;
    elapsed.current = 0;
    const player = physicsSession.current?.player;
    if (!player) return;
    const floor = compiled.building.floors.find((value) => value.id === player.floorId),
      room = floor?.rooms.find((value) => contains(value.footprint, player.position)),
      continuing = stairContinuation(compiled, player);
    const links = continuing.length ? continuing : tourPortals(compiled, player, all);
    camera.getWorldDirection(projected);
    const heading = Math.atan2(projected.x, -projected.z),
      location = continuing.length ? 'Stairs' : (room?.name ?? floor?.name ?? '');
    if (request || mapOpen || interacting || selection) {
      useNavigation.getState().setContext({ player, heading, location, portals: [] });
      return;
    }
    camera.updateMatrixWorld();
    const candidates = (continuing.length ? continuing : all)
      .filter((destination) => {
        if (
          destination.floorId !== player.floorId ||
          ((destination.kind === 'stairs' || destination.kind === 'door') &&
            !continuing.length &&
            !links.some((link) => link.id === destination.id)) ||
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
        const limit = destination.kind === 'room' ? 7 : 15;
        if (distance > limit || (destination.kind === 'room' && distance < 0.85)) return false;
        anchor.set(destination.anchor.x, destination.anchor.y, destination.anchor.z);
        const length = anchor.distanceTo(camera.position);
        raycaster.set(camera.position, anchor.clone().sub(camera.position).normalize());
        raycaster.near = 0.05;
        raycaster.far = Math.max(0.05, length - 0.08);
        if (
          raycaster
            .intersectObjects(scene.children, true)
            .some(
              (hit) =>
                !hit.object.userData.navigationMarker &&
                !belongsToDoor(hit.object, destination.doorId) &&
                isVisible(hit.object),
            )
        )
          return false;
        if (!continuing.length && floor) {
          const approach = destination.approach ?? destination.target;
          if (
            !destinationRoute(
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
    ).map((value) => links.find((link) => link.id === value.destination.id) ?? value.destination);
    useNavigation.getState().setContext({
      player,
      heading,
      location,
      portals: navigationCues(compiled, player, links),
    });
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
  if (stage !== 'ready' || mode !== 'walk' || request || selection || interacting || mapOpen)
    return null;
  return visible.map((destination, index) => (
    <Marker
      key={`${compiled.building.revision}:${destination.id}`}
      primary={index === 0}
      destination={destination}
    />
  ));
}
