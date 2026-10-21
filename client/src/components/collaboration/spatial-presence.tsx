import { Edges, Html } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import { LoaderCircle, MousePointer2 } from 'lucide-react';
import { Vector3 } from 'three';
import type { SharedPresence } from '@refloor/scene/collaboration';
import { useCollaboration } from '@/shared/collaboration/store';
import { useProject } from '@/shared/scene/scene-store';
import { selectedContext } from '@/shared/editor/chat-context';
import {
  presenceCardPosition,
  presenceGroups,
  presencePhase,
} from '@/shared/collaboration/presence';

function PresenceMarker({
  peers,
  context,
}: {
  peers: SharedPresence[];
  context: NonNullable<ReturnType<typeof selectedContext>>;
}) {
  const card = useRef<HTMLDivElement>(null);
  const projected = useMemo(() => new Vector3(), []);
  const object = context.object,
    color = peers[0]!.member.color;
  return (
    <group>
      {object ? (
        <mesh
          position={[context.position.x, context.position.y, context.position.z]}
          rotation={[0, object.rotation, 0]}
          raycast={() => undefined}
        >
          <boxGeometry
            args={[
              object.dimensions.width + 0.035,
              object.dimensions.height + 0.035,
              object.dimensions.depth + 0.035,
            ]}
          />
          <meshBasicMaterial color={color} transparent opacity={0.055} depthWrite={false} />
          <Edges color={color} raycast={() => undefined} />
        </mesh>
      ) : (
        <mesh
          position={[context.position.x, context.position.y, context.position.z]}
          raycast={() => undefined}
        >
          <sphereGeometry args={[0.075, 12, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} />
        </mesh>
      )}
      <Html
        position={[
          context.position.x,
          context.position.y + (object ? object.dimensions.height / 2 + 0.06 : 0.15),
          context.position.z,
        ]}
        zIndexRange={[15, 10]}
        occlude
        style={{ pointerEvents: 'none' }}
        calculatePosition={(object, camera, size) => {
          projected.setFromMatrixPosition(object.matrixWorld).project(camera);
          const visible =
            Math.abs(projected.x) <= 1 &&
            Math.abs(projected.y) <= 1 &&
            projected.z >= -1 &&
            projected.z <= 1;
          const position = presenceCardPosition(
            { x: ((projected.x + 1) * size.width) / 2, y: ((1 - projected.y) * size.height) / 2 },
            size,
            { width: card.current?.offsetWidth ?? 205, height: card.current?.offsetHeight ?? 80 },
          );
          if (card.current) {
            card.current.style.visibility = visible ? 'visible' : 'hidden';
            card.current.dataset.side = position.side;
          }
          return [position.x, position.y];
        }}
      >
        <div ref={card} className="spatial-presence" style={{ color }}>
          <MousePointer2 size={19} fill="currentColor" />
          <div>
            {peers.slice(0, 3).map((peer) => (
              <div
                className="presence-peer"
                key={peer.member.id}
                style={{ color: peer.member.color }}
              >
                <strong title={peer.member.name}>
                  <span>{peer.member.name}</span>
                  {presencePhase(peer) === 'applying' && (
                    <LoaderCircle className="spinning" size={11} aria-label="Applying a change" />
                  )}
                </strong>
                {peer.draft && <p>{peer.draft}</p>}
              </div>
            ))}
            {peers.length > 3 && <small>+{peers.length - 3}</small>}
          </div>
        </div>
      </Html>
    </group>
  );
}
export function SpatialPresence() {
  const peers = useCollaboration((state) => state.peers);
  const { compiled, floorId, cutaway } = useProject();
  return (
    <group>
      {presenceGroups(peers.filter((peer) => !cutaway || peer.floorId === floorId)).map((group) => {
        const selection = group.peers[0]!.selection;
        const context =
          selection && selection.kind !== 'house'
            ? selectedContext(compiled.building, {
                kind: selection.kind,
                id: selection.id,
                ...(selection.side ? { side: selection.side } : {}),
                ...(selection.point ? { point: selection.point } : {}),
              })
            : null;
        return context ? (
          <PresenceMarker key={group.key} peers={group.peers} context={context} />
        ) : null;
      })}
    </group>
  );
}
