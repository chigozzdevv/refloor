import type { CompiledBuilding, NavigationPoint } from '@refloor/engine';
import { contains } from '@refloor/engine/math';

export function MapPlan({
  compiled,
  floorId,
  player,
  heading,
  navigate,
}: {
  compiled: CompiledBuilding;
  floorId: string;
  player: NavigationPoint | null;
  heading: number;
  navigate?: (roomId: string) => void;
}) {
  const floor = compiled.building.floors.find((value) => value.id === floorId);
  if (!floor) return null;
  const fp = floor.footprint,
    here = player?.floorId === floorId ? player.position : null,
    current = here ? floor.rooms.find((room) => contains(room.footprint, here)) : null;
  return (
    <svg
      className="map-plan"
      viewBox={`${fp.x - 0.5} ${fp.z - 0.5} ${fp.width + 1} ${fp.depth + 1}`}
      aria-label={`${floor.name} plan`}
    >
      {floor.rooms.map((room) => {
        const rect = room.footprint,
          words = room.name.replace(/-/g, ' ').split(' '),
          middle = Math.ceil(words.length / 2),
          lines =
            room.name.length > 13
              ? [words.slice(0, middle).join(' '), words.slice(middle).join(' ')]
              : [room.name];
        return (
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
            <title>
              {room.name}
              {current?.id === room.id ? ' — you are here' : ''}
            </title>
            <rect x={rect.x} y={rect.z} width={rect.width} height={rect.depth} rx={0.07} />
            {navigate && (
              <text
                x={rect.x + rect.width / 2}
                y={rect.z + rect.depth / 2}
                textAnchor="middle"
                fontSize={Math.min(
                  0.34,
                  (rect.width / Math.max(...lines.map((line) => line.length), 8)) * 1.5,
                )}
              >
                {lines.map((line, index) => (
                  <tspan
                    key={index}
                    x={rect.x + rect.width / 2}
                    dy={index ? '1.3em' : lines.length > 1 ? '-.3em' : '0'}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
            )}
          </g>
        );
      })}
      <g className="map-detail">
        {compiled.building.objects
          .filter((object) => object.floorId === floor.id && object.kind !== 'light')
          .map((object) => (
            <rect
              key={object.id}
              x={object.position.x - object.dimensions.width / 2}
              y={object.position.z - object.dimensions.depth / 2}
              width={object.dimensions.width}
              height={object.dimensions.depth}
              rx={0.06}
              transform={`rotate(${(-object.rotation * 180) / Math.PI} ${object.position.x} ${object.position.z})`}
            />
          ))}
        {floor.voids.map((hole) => (
          <rect
            key={hole.id}
            className="map-void"
            x={hole.footprint.x}
            y={hole.footprint.z}
            width={hole.footprint.width}
            height={hole.footprint.depth}
          />
        ))}
        {floor.walls.map((wall) => (
          <line
            key={wall.id}
            className="map-wall"
            x1={wall.start.x}
            y1={wall.start.z}
            x2={wall.end.x}
            y2={wall.end.z}
          />
        ))}
        {compiled.doors
          .filter((door) => door.floorId === floor.id)
          .map((door) => (
            <line
              key={door.id}
              className="map-door"
              x1={door.centre.x - (Math.cos(door.rotation) * door.width) / 2}
              y1={door.centre.z + (Math.sin(door.rotation) * door.width) / 2}
              x2={door.centre.x + (Math.cos(door.rotation) * door.width) / 2}
              y2={door.centre.z - (Math.sin(door.rotation) * door.width) / 2}
            />
          ))}
        {compiled.stairs
          .filter((stair) => stair.lower.floorId === floor.id || stair.upper.floorId === floor.id)
          .map((stair) => (
            <g key={stair.id} className="map-stair">
              <rect
                x={stair.footprint.x}
                y={stair.footprint.z}
                width={stair.footprint.width}
                height={stair.footprint.depth}
              />
              {Array.from({ length: 8 }, (_, index) => (
                <line
                  key={index}
                  x1={stair.footprint.x}
                  y1={stair.footprint.z + ((index + 1) * stair.footprint.depth) / 9}
                  x2={stair.footprint.x + stair.footprint.width}
                  y2={stair.footprint.z + ((index + 1) * stair.footprint.depth) / 9}
                />
              ))}
            </g>
          ))}
      </g>
      {here && (
        <g
          className="map-player"
          transform={`translate(${here.x} ${here.z}) rotate(${(heading * 180) / Math.PI})`}
        >
          <circle r={0.24} />
          <path d="M 0 -.5 L .16 -.12 L -.16 -.12 Z" />
        </g>
      )}
    </svg>
  );
}
