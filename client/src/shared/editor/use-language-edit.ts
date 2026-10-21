import { useCollaboration } from '@/shared/collaboration/store';
import type { EditMemory, EditTarget } from '@refloor/scene/edit-memory';
import { collaborationBridge } from '@/shared/collaboration/bridge';
import type { ChatTarget } from '@refloor/scene/chat';
import type { ChatTurn } from '@refloor/scene/edit-memory';
import { scopedEditMemory } from '@refloor/scene/edit-memory';
import { editApi } from '@/shared/refloor/edits';
import { useProject } from '@/shared/scene/scene-store';
import { physicsSession } from '@/shared/navigation/physics-session';
import { walkInput } from '@/shared/navigation/input';
import { editingError } from '@/shared/editor/errors';
import { targetIdentity } from '@/shared/editor/identity';
import { scenePresentation } from '@/shared/scene/presentation';
import type { CompiledBuilding } from '@refloor/engine';
import { deviceCommands } from '@refloor/catalogue/device-commands';
import { prepareMediaCommand, waitForPlayback } from '@/shared/behaviours/television';
import { createEditGuards } from '@refloor/scene/edit-guards';
import { propertiesMatch } from '@refloor/scene/properties';

function conversation(memory: EditMemory, target: EditTarget) {
  const self = useCollaboration.getState().state?.self;
  return scopedEditMemory(
    self && useProject.getState().remote?.shared
      ? {
          ...memory,
          turns: memory.turns.filter((turn) => !turn.author || turn.author.id === self.id),
        }
      : memory,
    target,
  );
}
export function changedMechanisms(before: CompiledBuilding, after: CompiledBuilding) {
  const affected = new Set<string>();
  for (const door of after.doors)
    if (before.doors.find((value) => value.id === door.id)?.open !== door.open)
      affected.add(door.id);
  for (const object of after.building.objects) {
    const previous = before.building.objects.find((value) => value.id === object.id),
      open = object.behaviours.find((value) => value.kind === 'openable')?.state.open,
      wasOpen = previous?.behaviours.find((value) => value.kind === 'openable')?.state.open;
    if (open !== wasOpen) affected.add(object.id);
  }
  return affected;
}

async function presentEdit(
  compiled: CompiledBuilding,
  epoch: number,
  affected: ReadonlySet<string>,
  media: string[],
) {
  const controller = new AbortController(),
    unsubscribe = useProject.subscribe((state) => {
      if (state.projectEpoch !== epoch) controller.abort();
    });
  try {
    if (useProject.getState().projectEpoch !== epoch) controller.abort();
    await scenePresentation.waitFor(compiled, controller.signal, affected);
    await waitForPlayback(media, controller.signal);
  } finally {
    unsubscribe();
  }
}

export async function sendLanguageEdit(target: ChatTarget, message: string) {
  const text = message.trim(),
    before = useProject.getState(),
    requestId = crypto.randomUUID();
  if (!text || !before.beginChat(requestId)) return false;
  if (before.remote?.shared)
    useCollaboration.setState({ applying: { id: requestId, target, text }, draft: null });
  let turn: ChatTurn | undefined;
  const base = {
    id: requestId,
    at: new Date().toISOString(),
    target,
    message: text,
    ...(before.remote?.shared && useCollaboration.getState().state
      ? {
          author: {
            id: useCollaboration.getState().state!.self.id,
            name: useCollaboration.getState().state!.self.name,
          },
        }
      : {}),
    baseRevision: before.compiled.building.revision,
  };
  try {
    const direct = deviceCommands(before.compiled.building, target, text);
    let planning = before;
    let result = direct
      ? { ...direct, baseRevision: base.baseRevision }
      : await editApi.interpret({
          requestId,
          target,
          message: text,
          building: before.compiled.building,
          context: conversation(before.memory, target),
          view: { ...walkInput.view },
          player: before.mode === 'walk' ? (physicsSession.current?.player ?? null) : null,
        });
    const dependencies = () =>
      ('guards' in result && result.guards) ||
      (result.commands.length ? createEditGuards(planning.compiled.building, result.commands) : []);
    if (
      !direct &&
      before.remote?.shared &&
      useProject.getState().projectEpoch === before.projectEpoch &&
      !propertiesMatch(useProject.getState().compiled.building, dependencies())
    ) {
      planning = useProject.getState();
      result = await editApi.interpret({
        requestId,
        target,
        message: text,
        building: planning.compiled.building,
        context: conversation(planning.memory, target),
        view: { ...walkInput.view },
        player: planning.mode === 'walk' ? (physicsSession.current?.player ?? null) : null,
      });
    }
    const current = useProject.getState();
    const guards = dependencies();
    if (
      current.projectEpoch !== before.projectEpoch ||
      result.baseRevision !== planning.compiled.building.revision ||
      (before.remote?.shared
        ? !propertiesMatch(current.compiled.building, guards)
        : current.compiled.building !== planning.compiled.building)
    )
      throw new Error('The space changed while I was working. Please try that again.');
    const identity = targetIdentity(planning.compiled.building, target);
    if (
      result.commands.length &&
      !current.edit(result.commands, {
        source: 'chat',
        id: requestId,
        at: base.at,
        chat: { target, message: text, reply: (result.message || 'Done.').slice(0, 1000) },
        label: text,
        guards,
        target: identity ? `${identity.label} · ${identity.location}` : undefined,
      })
    )
      throw new Error(useProject.getState().notice ?? 'That change could not be applied.');
    if (direct)
      prepareMediaCommand(
        useProject.getState().past.at(-1)?.revision.commands ?? [],
        useProject.getState().compiled.building,
      );
    if (result.commands.length && current.remote?.shared)
      await collaborationBridge.current!.wait(requestId);
    turn = {
      ...base,
      baseRevision: planning.compiled.building.revision,
      reply: (result.message || 'Done.').slice(0, 1000),
      status: result.commands.length ? 'applied' : 'clarification',
      revisionId: result.commands.length ? requestId : null,
    };
    if (result.commands.length) {
      const applied = useProject.getState().compiled;
      const media = applied.building.objects
        .filter((object) => {
          const state = object.behaviours.find((value) => value.kind === 'television')?.state,
            previous = current.compiled.building.objects
              .find((value) => value.id === object.id)
              ?.behaviours.find((value) => value.kind === 'television')?.state;
          return (
            state?.powered &&
            (!previous?.powered ||
              state.source !== previous.source ||
              state.muted !== previous.muted ||
              direct?.commands.some(
                (command) => command.type === 'set-television' && command.objectId === object.id,
              ))
          );
        })
        .map((object) => object.id);
      await presentEdit(
        applied,
        before.projectEpoch,
        changedMechanisms(current.compiled, applied),
        media,
      );
    }
    return true;
  } catch (error) {
    const applied =
        turn?.status === 'applied' && useProject.getState().projectEpoch === before.projectEpoch,
      explanation = editingError(error);
    turn = {
      ...(turn ?? base),
      reply: (applied
        ? `Applied the change, but ${explanation.charAt(0).toLowerCase()}${explanation.slice(1)}`
        : explanation
      ).slice(0, 1000),
      status: turn?.status === 'applied' ? 'applied' : 'rejected',
      revisionId: turn?.revisionId ?? null,
    };
    return applied;
  } finally {
    const current = useProject.getState();
    if (useCollaboration.getState().applying?.id === requestId)
      useCollaboration.setState({ applying: null });
    current.finishChat(requestId, current.projectEpoch === before.projectEpoch ? turn : undefined);
  }
}

export function useLanguageEdit(target: ChatTarget) {
  const turns = useProject((state) => state.memory.turns);
  const history = turns
    .filter(
      (turn) =>
        turn.target.kind === target.kind &&
        turn.target.id === target.id &&
        turn.target.side === target.side,
    )
    .slice(-8);
  const busy = useProject((state) => state.chatPending !== null),
    lastTurn = useProject((state) =>
      state.memory.turns.findLast(
        (turn) =>
          turn.target.kind === target.kind &&
          turn.target.id === target.id &&
          turn.target.side === target.side,
      ),
    );
  const send = (message: string) => sendLanguageEdit(target, message);
  return { busy, reply: busy ? null : (lastTurn?.reply ?? null), history, send };
}
