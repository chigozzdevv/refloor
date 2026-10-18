import { useState } from 'react';
import {
  Armchair,
  BedDouble,
  Crosshair,
  LampCeiling,
  Monitor,
  Plus,
  Sprout,
  Table2,
  X,
} from 'lucide-react';
import { catalogue } from '@refloor/catalogue';
import { useProject } from '@/shared/scene/scene-store';

export function FurniturePicker({ close }: { close: () => void }) {
  const { compiled, floorId, selection, select, addFurniture, focusObject } = useProject(),
    floor = compiled.building.floors.find((value) => value.id === floorId)!;
  const [roomId, setRoomId] = useState(floor.rooms[0]!.id),
    [adding, setAdding] = useState(false);
  const room = floor.rooms.find((value) => value.id === roomId) ?? floor.rooms[0]!;
  return (
    <aside className="library-panel" aria-label="Furniture library">
      <div className="panel-heading">
        <h2>Furniture</h2>
        <button className="icon-button" onClick={close} aria-label="Close furniture library">
          <X size={18} />
        </button>
      </div>
      <label className="field-caption">
        ROOM
        <select
          aria-label="Choose room"
          value={room.id}
          onChange={(event) => setRoomId(event.target.value)}
        >
          {floor.rooms.map((value) => (
            <option key={value.id} value={value.id}>
              {value.name}
            </option>
          ))}
        </select>
      </label>
      <div className="library-tabs">
        <button className={!adding ? 'selected' : ''} onClick={() => setAdding(false)}>
          In this room
        </button>
        <button className={adding ? 'selected' : ''} onClick={() => setAdding(true)}>
          <Plus size={13} /> Add furniture
        </button>
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
                    select({ kind: 'object', id: object.id });
                    close();
                  }}
                >
                  {object.label}
                  <small>{object.kind}</small>
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
            <p>This room is ready for something new.</p>
          )}
        </div>
      ) : (
        <div className="catalogue-grid">
          {catalogue.map((entry) => {
            const Icon =
              entry.kind === 'bed'
                ? BedDouble
                : entry.kind === 'television'
                  ? Monitor
                  : entry.kind === 'light'
                    ? LampCeiling
                    : entry.kind === 'decor'
                      ? Sprout
                      : entry.kind === 'table' || entry.kind === 'storage'
                        ? Table2
                        : Armchair;
            return (
              <button
                key={entry.assetId}
                className="catalogue-card"
                onClick={() => {
                  if (addFurniture(entry.assetId, room.id)) close();
                }}
              >
                <Icon size={27} strokeWidth={1.3} />
                <strong>{entry.label}</strong>
                <small>
                  {entry.dimensions.width} × {entry.dimensions.depth} m
                </small>
                <span>+ Add to room</span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}
