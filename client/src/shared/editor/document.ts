import { undoRevision } from '@refloor/scene';
import type { SceneCommand, SceneRevision } from '@refloor/scene';
import { isPlayerPositionValid, validateBuilding, validatePlacement } from '@refloor/engine';
import type { CompiledBuilding, NavigationPoint } from '@refloor/engine';

export type DocumentState = {
  compiled: CompiledBuilding;
  past: SceneRevision[];
  future: SceneRevision[];
};
const metadata = () => ({ id: crypto.randomUUID(), at: new Date().toISOString() });

export function editDocument(
  state: DocumentState,
  commands: SceneCommand[],
  player?: NavigationPoint,
): DocumentState {
  const result = validatePlacement(
    state.compiled.building,
    { ...metadata(), expectedRevision: state.compiled.building.revision, commands },
    state.compiled.options,
    player,
  );
  return {
    compiled: result.compiled,
    past: [...state.past, result.revision].slice(-50),
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
  const result = undoRevision(state.compiled.building, record, metadata()),
    compiled = validateBuilding(result.building, state.compiled.options);
  if (player && !isPlayerPositionValid(compiled, player))
    throw new Error('Move clear of this object or door before restoring the previous arrangement.');
  return {
    compiled,
    past: direction === 'undo' ? state.past.slice(0, -1) : [...state.past, result.revision],
    future: direction === 'redo' ? state.future.slice(0, -1) : [...state.future, result.revision],
  };
}
