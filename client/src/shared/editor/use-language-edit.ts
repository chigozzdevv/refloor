import type { ChatTarget } from '@refloor/scene/chat';
import type { ChatTurn } from '@refloor/scene/edit-memory';
import { scopedEditMemory } from '@refloor/scene/edit-memory';
import { editApi } from '@/shared/refloor/edits';
import { useProject } from '@/shared/scene/scene-store';
import { physicsSession } from '@/shared/navigation/physics-session';
import { walkInput } from '@/shared/navigation/input';
import { editingError } from '@/shared/editor/errors';
import { targetIdentity } from '@/shared/editor/identity';

export function useLanguageEdit(target: ChatTarget) {
  const busy = useProject((state) => state.chatPending !== null),
    lastTurn = useProject((state) =>
      state.memory.turns.findLast(
        (turn) =>
          turn.target.kind === target.kind &&
          turn.target.id === target.id &&
          turn.target.side === target.side,
      ),
    );
  const send = async (message: string) => {
    const text = message.trim(),
      before = useProject.getState(),
      requestId = crypto.randomUUID();
    if (!text || !before.beginChat(requestId)) return false;
    let turn: ChatTurn | undefined;
    const base = {
      id: requestId,
      at: new Date().toISOString(),
      target,
      message: text,
      baseRevision: before.compiled.building.revision,
    };
    try {
      const result = await editApi.interpret({
        requestId,
        target,
        message: text,
        building: before.compiled.building,
        context: scopedEditMemory(before.memory, target),
        view: { ...walkInput.view },
        player: before.mode === 'walk' ? (physicsSession.current?.player ?? null) : null,
      });
      const current = useProject.getState();
      if (
        current.projectEpoch !== before.projectEpoch ||
        current.compiled.building !== before.compiled.building ||
        result.baseRevision !== current.compiled.building.revision
      )
        throw new Error('The space changed while I was working. Please try that again.');
      const identity = targetIdentity(before.compiled.building, target);
      if (
        result.commands.length &&
        !current.edit(result.commands, {
          source: 'chat',
          label: text,
          target: identity ? `${identity.label} · ${identity.location}` : undefined,
        })
      )
        throw new Error(useProject.getState().notice ?? 'That change could not be applied.');
      turn = {
        ...base,
        reply: (result.message || 'Done.').slice(0, 1000),
        status: result.commands.length ? 'applied' : 'clarification',
        revisionId: result.commands.length ? useProject.getState().past.at(-1)!.revision.id : null,
      };
      return true;
    } catch (error) {
      turn = {
        ...base,
        reply: editingError(error).slice(0, 1000),
        status: 'rejected',
        revisionId: null,
      };
      return false;
    } finally {
      const current = useProject.getState();
      current.finishChat(
        requestId,
        current.projectEpoch === before.projectEpoch ? turn : undefined,
      );
    }
  };
  return { busy, reply: busy ? null : (lastTurn?.reply ?? null), send };
}
