import { useRef } from 'react';
import { Html } from '@react-three/drei';
import { Vector3 } from 'three';
import { ElementChat } from '@/components/editor/element-chat';
import { EnableSound } from '@/components/objects/enable-sound';
import { useProject } from '@/shared/scene/scene-store';
import { selectedContext } from '@/shared/editor/chat-context';
import { usePlayback, playMedia } from '@/shared/behaviours/television';

export function SelectionChat() {
  const card = useRef<HTMLDivElement>(null);
  const { selection, compiled, projectEpoch, mode, select } = useProject();
  const context = selectedContext(compiled.building, selection);
  const playback = usePlayback((state) => (selection ? state.players[selection.id] : undefined));
  if (!context || !selection || mode === 'entry') return null;
  return (
    <Html
      position={[context.position.x, context.position.y, context.position.z]}
      zIndexRange={[30, 20]}
      calculatePosition={(object, camera, size) => {
        const point = new Vector3().setFromMatrixPosition(object.matrixWorld).project(camera);
        const x = ((point.x + 1) * size.width) / 2,
          y = ((1 - point.y) * size.height) / 2;
        const width = card.current?.offsetWidth ?? 252,
          height = card.current?.offsetHeight ?? 160;
        return [
          Math.max(12, Math.min(size.width - width - 12, x + 18)),
          Math.max(
            76,
            Math.min(size.height - height - 18, size.width < 600 ? y - height - 18 : y - 30),
          ),
        ];
      }}
    >
      <div
        ref={card}
        className="selection-chat-wrap"
        key={`${projectEpoch}:${selection.kind}:${selection.id}`}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerCancel={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <ElementChat
          target={{ kind: selection.kind, id: selection.id }}
          label={context.label}
          suggestions={context.suggestions}
          close={() => select(null)}
        />
        {context.object?.kind === 'television' &&
          context.object.behaviours.some(
            (item) => item.kind === 'television' && item.state.powered,
          ) && (
            <div className="chat-media">
              <EnableSound object={context.object} />
              {playback?.status === 'blocked' && (
                <button className="tool-button" onClick={() => playMedia(selection.id)}>
                  Play video
                </button>
              )}
              {playback?.status === 'failed' && <span>Video could not load.</span>}
            </div>
          )}
      </div>
    </Html>
  );
}
