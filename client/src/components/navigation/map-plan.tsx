import { useCollaboration } from '@/shared/collaboration/store';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CompiledBuilding, NavigationPoint } from '@refloor/engine';
import { contains } from '@refloor/engine/math';
import { planDoor, planRoomName, planWall } from '@/shared/navigation/floor-plan';
import { MapFurniture } from '@/components/navigation/map-furniture';
import { floorCourtyards, subtractRectangles } from '@refloor/scene/footprint';

export function MapPlan({
  compiled,
  floorId,
  player,
  heading,
  navigate,
  compact = false,
}: {
  compiled: CompiledBuilding;
  floorId: string;
  player: NavigationPoint | null;
  heading: number;
  navigate?: (roomId: string) => void;
  compact?: boolean;
}) {
  const peers = useCollaboration((state) => state.peers);
  const canvas = useRef<SVGSVGElement>(null),
    [unitsPerPixel, setUnitsPerPixel] = useState(0.05);
  const floor = compiled.building.floors.find((value) => value.id === floorId),
    walls = useMemo(() => floor?.walls.map((wall) => ({ wall, ...planWall(wall) })) ?? [], [floor]),
    doors = useMemo(
      () =>
        compiled.doors
          .filter((door) => door.floorId === floorId)
          .map((door) => ({ door, ...planDoor(door) })),
      [compiled, floorId],
    ),
    stairs = useMemo(() => {
      const ids = new Set(
        compiled.stairs
          .filter((stair) => stair.lower.floorId === floorId || stair.upper.floorId === floorId)
          .map((stair) => stair.id),
      );
      return compiled.parts.flatMap((part) =>
        ids.has(part.entityId) &&
        ['stair-tread', 'stair-landing'].includes(part.role) &&
        part.collider.shape === 'box'
          ? [{ id: part.id, collider: part.collider }]
          : [],
      );
    }, [compiled, floorId]);
  useEffect(() => {
    const svg = canvas.current;
    if (!svg || !floor) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || !entry.contentRect.width || !entry.contentRect.height) return;
      setUnitsPerPixel(
        Math.max(
          (floor.footprint.width + 1.3) / entry.contentRect.width,
          (floor.footprint.depth + 1.3) / entry.contentRect.height,
        ),
      );
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [floor]);
  if (!floor) return null;
  const fp = floor.footprint,
    here = player?.floorId === floorId ? player.position : null,
    current = here ? floor.rooms.find((room) => contains(room.footprint, here)) : null;
  return (
    <svg
      ref={canvas}
      className={`map-plan ${compact ? 'plan-compact' : 'plan-expanded'}`}
      viewBox={`${fp.x - 0.65} ${fp.z - 0.65} ${fp.width + 1.3} ${fp.depth + 1.3}`}
      aria-label={`${floor.name} plan`}
    >
      {subtractRectangles(fp, floorCourtyards(floor)).map((region, index) => (
        <rect
          key={index}
          className="plan-paper"
          x={region.x}
          y={region.z}
          width={region.width}
          height={region.depth}
        />
      ))}
      {floor.rooms.map((room) => (
        <g
          key={room.id}
          className={`map-room ${current?.id === room.id ? 'map-current' : ''}`}
          role={navigate ? 'button' : undefined}
          tabIndex={navigate ? 0 : undefined}
          aria-label={
            navigate
              ? `Go to ${room.name}${current?.id === room.id ? ', current room' : ''}`
              : undefined
          }
          onClick={navigate ? () => navigate(room.id) : undefined}
          onKeyDown={
            navigate
              ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(room.id);
                  }
                }
              : undefined
          }
        >
          <title>{room.name}</title>
          <rect
            x={room.footprint.x}
            y={room.footprint.z}
            width={room.footprint.width}
            height={room.footprint.depth}
          />
        </g>
      ))}
      <g className="plan-details">
        {!compact &&
          compiled.building.objects
            .filter((object) => object.floorId === floorId && object.kind !== 'light')
            .map((object) => <MapFurniture key={object.id} object={object} />)}
        {stairs.map((part) => (
          <rect
            key={part.id}
            className="plan-stair"
            x={-part.collider.size.x / 2}
            y={-part.collider.size.z / 2}
            width={part.collider.size.x}
            height={part.collider.size.z}
            transform={`translate(${part.collider.position.x} ${part.collider.position.z}) rotate(${(-part.collider.rotation * 180) / Math.PI})`}
          />
        ))}
        {walls.map(({ wall, rotation, segments }) => (
          <g
            key={wall.id}
            transform={`translate(${wall.start.x} ${wall.start.z}) rotate(${rotation})`}
          >
            {segments.map((segment, i) => (
              <rect
                className="plan-wall"
                key={i}
                x={segment.offset}
                y={-wall.thickness / 2}
                width={segment.length}
                height={wall.thickness}
              />
            ))}
            {wall.openings
              .filter((opening) => opening.kind === 'window')
              .map((opening) => (
                <g key={opening.id} className="plan-window">
                  <rect
                    x={opening.offset}
                    y={-wall.thickness / 2}
                    width={opening.width}
                    height={wall.thickness}
                  />
                  <path d={`M ${opening.offset} 0 h ${opening.width}`} />
                </g>
              ))}
          </g>
        ))}
        {doors.map(({ door, arc, leafTip }) => (
          <g key={door.id} className="plan-door">
            {!compact && door.open && <path className="plan-door-swing" d={arc} />}
            <path d={`M ${door.hinge.x} ${door.hinge.z} L ${leafTip.x} ${leafTip.z}`} />
          </g>
        ))}
        {floor.rooms.map((room) => {
          const name = planRoomName(room.name),
            words = name.split(' '),
            middle = Math.ceil(words.length / 2),
            lines =
              name.length > 12
                ? [words.slice(0, middle).join(' '), words.slice(middle).join(' ')]
                : [name],
            rect = room.footprint;
          return (
            <text
              key={room.id}
              className="plan-room-name"
              x={rect.x + rect.width / 2}
              y={
                !compact && room.kind !== 'corridor' && room.kind !== 'stairwell'
                  ? rect.z + Math.min(1.1, rect.depth * 0.4)
                  : rect.z + rect.depth * (room.kind === 'corridor' ? 0.8 : 0.5)
              }
              textAnchor="middle"
              fontSize={Math.min(
                (compact ? 8 : 12) * unitsPerPixel,
                (rect.width - 0.5) / (Math.max(...lines.map((line) => line.length), 5) * 0.55),
              )}
            >
              {lines.map((line, i) => (
                <tspan
                  key={i}
                  x={rect.x + rect.width / 2}
                  dy={i ? '1.2em' : lines.length > 1 ? '-.25em' : '0'}
                >
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}
      </g>
      {here && (
        <g
          className="map-player"
          transform={`translate(${here.x} ${here.z}) rotate(${(heading * 180) / Math.PI})`}
        >
          <circle className="plan-player-halo" r={0.36} />
          <circle r={0.19} />
          <path className="plan-player-heading" d="M 0 -.55 L .12 -.34 H -.12 Z" />
        </g>
      )}
      {peers
        .filter((peer) => peer.player?.floorId === floorId)
        .map((peer) => (
          <g
            key={peer.clientId}
            className="plan-peer"
            transform={`translate(${peer.player!.position.x} ${peer.player!.position.z})`}
            pointerEvents="none"
          >
            <title>
              {peer.member.name}
              {peer.draft ? `: ${peer.draft}` : ''}
            </title>
            <circle
              r={unitsPerPixel * (compact ? 4 : 5)}
              fill={peer.member.color}
              stroke="#ffffff"
              strokeWidth={unitsPerPixel * 1.5}
            />
            {!compact && (
              <text
                x={unitsPerPixel * 8}
                y={unitsPerPixel * 3}
                fontSize={unitsPerPixel * 11}
                fill="#24313b"
                stroke="#ffffff"
                strokeWidth={unitsPerPixel * 2.5}
                paintOrder="stroke"
              >
                {peer.member.name}
              </text>
            )}
          </g>
        ))}
    </svg>
  );
}
