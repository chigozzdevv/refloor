import { fingerprintBuilding } from '@refloor/scene';
import type { Building } from '@refloor/scene';
import { validateBuildingAssets } from '@refloor/catalogue';
import { isPlayerPositionValid, validateBuilding } from '@refloor/engine';
import type { NavigationPoint } from '@refloor/engine';
import { designNameSchema, maxDesigns } from '@refloor/scene/design-checkpoint';
import { captureElements, designHistorySchema, editMemorySchema } from '@refloor/scene/edit-memory';
import type { DesignHistory, EditMemory } from '@refloor/scene/edit-memory';
import type { DocumentState } from '@/shared/editor/document';
import { entryPose } from '@/shared/navigation/entry';
import { destinationRoute } from '@/shared/navigation/destinations';
import { maxProjectBytes } from '@/shared/scene/files';

const metadata = () => ({ id: crypto.randomUUID(), at: new Date().toISOString() });

function readHistory(input: unknown): DesignHistory {
  const result = designHistorySchema.safeParse(input);
  if (!result.success)
    throw new Error(result.error.issues[0]?.message ?? 'This saved design could not be read.');
  return result.data;
}

function checkPortable(state: DocumentState): DocumentState {
  const memory = editMemorySchema.safeParse(state.memory);
  if (!memory.success)
    throw new Error(memory.error.issues[0]?.message ?? 'The saved design context is invalid.');
  const payload = JSON.stringify(
    {
      format: 'refloor-project',
      version: 1,
      building: state.compiled.building,
      memory: state.memory,
    },
    null,
    2,
  );
  if (new TextEncoder().encode(payload).length > maxProjectBytes - 1024)
    throw new Error('This design is too large to save safely. Remove a saved design first.');
  return state;
}

function append(history: DesignHistory, building: Building, input: string): DesignHistory {
  const parsed = designNameSchema.safeParse(input);
  if (!parsed.success) throw new Error('Give this design a name between 1 and 64 characters.');
  const name = parsed.data;
  if (history.items.length >= maxDesigns)
    throw new Error('Six designs are saved. Remove one before saving another.');
  if (history.items.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
    throw new Error('A design already has this name. Choose another name.');
  return readHistory({
    ...history,
    items: [...history.items, { ...metadata(), name, building: structuredClone(building) }],
  });
}

function preservePreview(history: DesignHistory, building: Building) {
  if (
    !history.comparison ||
    history.items.some(
      (item) => fingerprintBuilding(item.building) === fingerprintBuilding(building),
    )
  )
    return { history, preserved: null };
  const source = history.items.find((item) => item.id === history.comparison!.checkpointId)!,
    base = `Changes to ${source.name}`.slice(0, 58);
  let name = base,
    suffix = 2;
  while (history.items.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
    name = `${base} ${suffix++}`;
  return { history: append(history, building, name), preserved: name };
}

function compileDesign(state: DocumentState, building: Building, player?: NavigationPoint) {
  if (building.id !== state.compiled.building.id)
    throw new Error('This saved design belongs to another house.');
  validateBuildingAssets(building);
  const compiled = validateBuilding(
    {
      ...structuredClone(building),
      revision: Math.max(building.revision, state.compiled.building.revision) + 1,
    },
    state.compiled.options,
  );
  const entry = entryPose(compiled);
  if (
    player &&
    (!isPlayerPositionValid(compiled, player) ||
      !destinationRoute(
        compiled,
        player,
        { floorId: entry.floorId, position: entry.inside },
        'openable',
      ))
  )
    throw new Error('Move to a clear spot before switching designs. This version would block you.');
  return compiled;
}

function keepOriginals(memory: EditMemory, building: Building) {
  const known = new Set(memory.originals.map((item) => `${item.kind}:${item.id}`));
  return [
    ...memory.originals,
    ...captureElements(building).filter((item) => !known.has(`${item.kind}:${item.id}`)),
  ];
}

export function saveDesign(state: DocumentState, name: string): DocumentState {
  const designs = append(state.memory.designs ?? { items: [] }, state.compiled.building, name);
  if (designs.comparison) designs.comparison.checkpointId = designs.items.at(-1)!.id;
  return checkPortable({ ...state, memory: { ...state.memory, designs } });
}

export function viewDesign(state: DocumentState, id: string, player?: NavigationPoint) {
  const existing = state.memory.designs,
    saved = existing?.items.find((item) => item.id === id);
  if (!existing || !saved) throw new Error('This saved design is no longer available.');
  const compiled = compileDesign(state, saved.building, player),
    { history, preserved } = preservePreview(existing, state.compiled.building),
    comparison = history.comparison ?? {
      checkpointId: id,
      working: structuredClone(state.compiled.building),
      past: structuredClone(state.past),
      future: structuredClone(state.future),
      transitions: structuredClone(state.memory.transitions),
      turns: structuredClone(state.memory.turns),
    },
    designs = readHistory({
      ...history,
      comparison: { ...comparison, checkpointId: id },
    });
  // A viewed version starts its own context; the working design retains its exact undo and chat.
  const document = checkPortable({
    compiled,
    past: [],
    future: [],
    memory: {
      ...state.memory,
      originals: keepOriginals(state.memory, compiled.building),
      transitions: [],
      turns: [],
      designs,
    },
  });
  return { document, preserved };
}

export function returnToWorking(state: DocumentState, player?: NavigationPoint) {
  const comparison = state.memory.designs?.comparison;
  if (!comparison) throw new Error('Your working design is already open.');
  const compiled = compileDesign(state, comparison.working, player),
    { history, preserved } = preservePreview(state.memory.designs!, state.compiled.building),
    designs = { ...history };
  delete designs.comparison;
  const document = checkPortable({
    compiled,
    past: structuredClone(comparison.past),
    future: structuredClone(comparison.future),
    memory: {
      ...state.memory,
      originals: keepOriginals(state.memory, compiled.building),
      transitions: structuredClone(comparison.transitions),
      turns: structuredClone(comparison.turns),
      designs,
    },
  });
  return { document, preserved };
}

export function removeDesign(state: DocumentState, id: string): DocumentState {
  const designs = state.memory.designs;
  if (!designs?.items.some((item) => item.id === id))
    throw new Error('This saved design is no longer available.');
  if (designs.comparison?.checkpointId === id)
    throw new Error('Return to your working design before removing this version.');
  return checkPortable({
    ...state,
    memory: {
      ...state.memory,
      designs: { ...designs, items: designs.items.filter((item) => item.id !== id) },
    },
  });
}
