import { useEffect, useRef, useState } from 'react';
import { Crosshair, LoaderCircle, Plus, WandSparkles, X } from 'lucide-react';
import { catalogue, placementProfile } from '@refloor/catalogue';
import type { FurnitureRenderer } from '@refloor/catalogue/furniture';
import { useProject } from '@/shared/scene/scene-store';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { useCollaboration } from '@/shared/collaboration/store';
import { useFurnishings } from '@/shared/editor/use-furnishings';
import { currentRoom } from '@/shared/navigation/current-room';

const roomFurniture: Record<string, FurnitureRenderer[]> = {
  bedroom: ['bed', 'wardrobe', 'bedside'],
  kitchen: ['kitchen', 'fridge', 'island'],
  bathroom: ['vanity', 'toilet', 'shower', 'mirror'],
  living: ['sofa', 'chair', 'coffee-table', 'television', 'speaker'],
  dining: ['dining-table', 'dining-chair'],
  workspace: ['desk', 'chair', 'cabinet'],
};

export function FurniturePicker({
  close,
  initialAdding = false,
}: {
  close: () => void;
  initialAdding?: boolean;
}) {
  const { compiled, floorId, mode, selection, select, addFurniture, focusObject } = useProject();
  const floors = compiled.building.floors;
  const floor = floors.find((value) => value.id === floorId)!;
  const player = useNavigation((state) => state.player);
  const here = currentRoom(compiled, player);
  const [roomId, setRoomId] = useState(
    (mode === 'walk' ? here?.id : undefined) ?? floor.rooms[0]!.id,
  );
  const [adding, setAdding] = useState(initialAdding);
  const room =
    floors.flatMap((value) => value.rooms).find((value) => value.id === roomId) ?? floor.rooms[0]!;
  const readonly = useCollaboration(
    (state) =>
      state.status !== 'idle' && (state.status !== 'live' || state.state?.self.role === 'viewer'),
  );
  const { furnishing, complete } = useFurnishings();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
    };
  }, [close]);
  const relevant = (room.uses ?? [room.kind]).flatMap((use) => roomFurniture[use] ?? []);
  const entries = catalogue
    .filter((entry) => placementProfile(entry.assetId).location === 'interior')
    .toSorted(
      (a, b) => Number(relevant.includes(b.renderer)) - Number(relevant.includes(a.renderer)),
    );
  return (
    <aside ref={panel} className="library-panel" aria-label="Furniture library">
      <div className="library-heading">
        <div className="panel-heading">
          <h2>Furniture</h2>
          <button className="icon-button" onClick={close} aria-label="Close furniture library">
            <X size={18} />
          </button>
        </div>
        <select
          aria-label="Choose room"
          value={room.id}
          onChange={(event) => setRoomId(event.target.value)}
        >
          {floors.map((value) => (
            <optgroup key={value.id} label={value.name}>
              {value.rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="library-tabs">
          <button className={!adding ? 'selected' : ''} onClick={() => setAdding(false)}>
            In this room
          </button>
          <button
            className={adding ? 'selected' : ''}
            disabled={readonly}
            onClick={() => setAdding(true)}
          >
            <Plus size={13} />
            Add furniture
          </button>
        </div>
      </div>
      {!adding ? (
        <div className="room-objects">
          {compiled.building.objects
            .filter((value) => value.roomId === room.id)
            .map((object) => (
              <div
                className={`room-object ${selection?.id === object.id ? 'selected' : ''}`}
                key={object.id}
              >
                <button
                  onClick={() => {
                    if (object.floorId !== floorId) focusObject(object.id);
                    else select({ kind: 'object', id: object.id });
                    close();
                  }}
                >
                  {object.label}
                </button>
                <button
                  className="icon-button"
                  title={`Find ${object.label}`}
                  aria-label={`Find ${object.label}`}
                  onClick={() => {
                    focusObject(object.id);
                    close();
                  }}
                >
                  <Crosshair size={15} />
                </button>
              </div>
            ))}
          {!compiled.building.objects.some((value) => value.roomId === room.id) && (
            <p>No furniture yet.</p>
          )}
        </div>
      ) : (
        <div className="catalogue-grid">
          {entries.map((entry) => (
            <button
              key={entry.assetId}
              className="catalogue-card"
              disabled={readonly || furnishing}
              aria-label={`Add ${entry.label}`}
              onClick={() => {
                if (!addFurniture(entry.assetId, room.id)) return;
                const added = useProject.getState().selection;
                if (added && (mode !== 'walk' || here?.id !== room.id)) focusObject(added.id);
                close();
              }}
            >
              <img
                src={`/images/furniture/${entry.assetId.split('/').at(-1)}.webp`}
                alt=""
                width={320}
                height={240}
                loading="lazy"
                decoding="async"
              />
              <strong>{entry.label}</strong>
              <small>
                {entry.dimensions.width} × {entry.dimensions.depth} m
              </small>
            </button>
          ))}
        </div>
      )}
      {!readonly && (
        <details className="library-options">
          <summary>More</summary>
          <button className="file-action" disabled={furnishing} onClick={() => void complete()}>
            {furnishing ? (
              <LoaderCircle size={16} className="spinning" />
            ) : (
              <WandSparkles size={16} />
            )}
            {furnishing ? 'Furnishing…' : 'Auto furnish house'}
          </button>
        </details>
      )}
    </aside>
  );
}
