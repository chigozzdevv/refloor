import { useRef } from 'react';
import { Html } from '@react-three/drei';
import { Vector3 } from 'three';
import { ElementChat } from '@/components/editor/element-chat';
import { useProject } from '@/shared/scene/scene-store';
import { selectedContext } from '@/shared/editor/chat-context';
import { usePlayback } from '@/shared/behaviours/television';

export function SelectionChat() {
  const card = useRef<HTMLDivElement>(null);
  const { selection, compiled, projectEpoch, select } = useProject();
  const context = selectedContext(compiled.building, selection);
  const playback = usePlayback((state) => (selection ? state.players[selection.id] : undefined));
  if (!context || !selection) return null;
  const markOffscreen = (hidden: boolean) =>
    card.current?.toggleAttribute('data-offscreen', hidden);
  return (
    <Html
      position={[context.position.x, context.position.y, context.position.z]}
      zIndexRange={[30, 20]}
      onOcclude={markOffscreen}
      calculatePosition={(object, camera, size) => {
        const world = new Vector3().setFromMatrixPosition(object.matrixWorld),
          behind = world.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0,
          point = behind ? world.set(0, 0, 0) : world.project(camera);
        const x = ((point.x + 1) * size.width) / 2,
          y = ((1 - point.y) * size.height) / 2;
        const width = card.current?.offsetWidth ?? Math.min(280, size.width - 24),
          height = card.current?.offsetHeight ?? 160;
        const left = behind
            ? Math.max(12, (size.width - width) / 2)
            : Math.max(12, Math.min(size.width - width - 12, x + 18)),
          top = behind
            ? Math.max(76, (size.height - height) / 2)
            : Math.max(
                76,
                Math.min(size.height - height - 18, size.width < 600 ? y - height - 18 : y - 30),
              );
        markOffscreen(behind);
        if (card.current) {
          card.current.dataset.tail =
            y > top + height ? 'bottom' : y < top ? 'top' : x > left + width ? 'right' : 'left';
          card.current.style.setProperty(
            '--tail-x',
            `${Math.max(18, Math.min(width - 18, x - left))}px`,
          );
          card.current.style.setProperty(
            '--tail-y',
            `${Math.max(18, Math.min(height - 18, y - top))}px`,
          );
        }
        return [left, top];
      }}
    >
      <div
        ref={card}
        className="selection-chat-wrap"
        key={`${projectEpoch}:${selection.kind}:${selection.id}:${selection.side ?? 'interior'}`}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerCancel={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <ElementChat
          target={{
            kind: selection.kind,
            id: selection.id,
            ...(selection.side ? { side: selection.side } : {}),
          }}
          label={context.label}
          suggestions={context.suggestions}
          status={
            playback?.status === 'failed' || playback?.status === 'blocked'
              ? playback.message
              : null
          }
          close={() => select(null)}
        />
      </div>
    </Html>
  );
}
