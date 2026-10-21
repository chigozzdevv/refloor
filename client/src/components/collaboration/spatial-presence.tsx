import { Edges, Html } from '@react-three/drei';
import { MousePointer2 } from 'lucide-react';
import { useCollaboration } from '@/shared/collaboration/store';
import { useProject } from '@/shared/scene/scene-store';
import { selectedContext } from '@/shared/editor/chat-context';
export function SpatialPresence() {
  const peers = useCollaboration((state) => state.peers),
    { compiled, floorId, cutaway } = useProject();
  return (
    <group>
      {peers.map((peer) => {
        if (
          !peer.selection ||
          peer.selection.kind === 'house' ||
          (cutaway && peer.floorId !== floorId)
        )
          return null;
        const context = selectedContext(compiled.building, {
          kind: peer.selection.kind,
          id: peer.selection.id,
          ...(peer.selection.side ? { side: peer.selection.side } : {}),
          ...(peer.selection.point ? { point: peer.selection.point } : {}),
        });
        if (!context) return null;
        const object = context.object;
        return (
          <group key={peer.clientId}>
            {object && (
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
                <meshBasicMaterial
                  color={peer.member.color}
                  transparent
                  opacity={0.055}
                  depthWrite={false}
                />
                <Edges color={peer.member.color} raycast={() => undefined} />
              </mesh>
            )}
            {!object && (
              <mesh
                position={[context.position.x, context.position.y, context.position.z]}
                raycast={() => undefined}
              >
                <sphereGeometry args={[0.075, 12, 8]} />
                <meshBasicMaterial
                  color={peer.member.color}
                  transparent
                  opacity={0.8}
                  depthWrite={false}
                />
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
            >
              <div className="spatial-presence" style={{ color: peer.member.color }}>
                <MousePointer2 size={19} fill="currentColor" />
                <div>
                  <strong>{peer.member.name}</strong>
                  {peer.draft && <p>{peer.draft}</p>}
                </div>
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
