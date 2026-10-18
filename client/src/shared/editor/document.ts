import { undoRevision } from '@refloor/scene';
import { validateCommandTuning } from '@refloor/catalogue';
import type { SceneCommand } from '@refloor/scene';
import type { EditDetails, HistoryRecord } from '@/shared/editor/history';
import { describeChange, describeTarget } from '@/shared/editor/history';
import { isPlayerPositionValid, validateBuilding, validatePlacement } from '@refloor/engine';
import type { CompiledBuilding, NavigationPoint } from '@refloor/engine';

export type DocumentState = {
  compiled: CompiledBuilding;
  past: HistoryRecord[];
  future: HistoryRecord[];
};
const metadata = () => ({ id: crypto.randomUUID(), at: new Date().toISOString() });

export function editDocument(
  state: DocumentState,
  commands: SceneCommand[],
  player?: NavigationPoint,
  details?: EditDetails,
): DocumentState {
  validateCommandTuning(state.compiled.building, commands);
  const result = validatePlacement(
    state.compiled.building,
    { ...metadata(), expectedRevision: state.compiled.building.revision, commands },
    state.compiled.options,
    player,
  );
  return {
    compiled: result.compiled,
    past: [
      ...state.past,
      {
        revision: result.revision,
        label: details?.label ?? describeChange(state.compiled.building, commands),
        source: details?.source ?? 'manual',
        target: details?.target ?? describeTarget(state.compiled.building, commands),
      },
    ].slice(-50),
    future: [],
  };
}

export function reverseDocument(
  state: DocumentState,
  direction: 'undo' | 'redo',
  player?: NavigationPoint,
): DocumentState {
  const source = direction === 'undo' ? state.past : state.future,
    record = source.at(-1);
  if (!record) return state;
  const result = undoRevision(state.compiled.building, record.revision, metadata()),
    compiled = validateBuilding(result.building, state.compiled.options);
  if (player && !isPlayerPositionValid(compiled, player))
    throw new Error('Move clear of this object or door before restoring the previous arrangement.');
  return {
    compiled,
    past:
      direction === 'undo'
        ? state.past.slice(0, -1)
        : [...state.past, { ...record, revision: result.revision }],
    future:
      direction === 'redo'
        ? state.future.slice(0, -1)
        : [...state.future, { ...record, revision: result.revision }],
  };
}

export function restoreBefore(
  state: DocumentState,
  id: string,
  player?: NavigationPoint,
): DocumentState {
  const index = state.past.findIndex((record) => record.revision.id === id);
  if (index < 0) throw new Error('That change is no longer in the history.');
  let result = state;
  while (result.past.length > index) result = reverseDocument(result, 'undo', player);
  return result;
}

export function redoChange(state: DocumentState, player?: NavigationPoint): DocumentState {
  let result = reverseDocument(state, 'redo', player);
  while (result.future.at(-1)?.source === 'navigation')
    result = reverseDocument(result, 'redo', player);
  return result;
}
