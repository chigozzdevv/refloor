import { useState } from 'react';
import { ChevronDown, LoaderCircle, Pencil, Play, Trash2, X, Zap } from 'lucide-react';
import type { Building, SceneAction, SceneEvent } from '@refloor/scene';
import { useProject } from '@/shared/scene/scene-store';
import { targetIdentity } from '@/shared/editor/identity';
import { useLanguageEdit } from '@/shared/editor/use-language-edit';
import { savedActionCommands } from '@/shared/behaviours/saved-action';
import { householdOpenableLabel } from '@refloor/catalogue';
import { useCollaboration } from '@/shared/collaboration/store';

function eventLabel(building: Building, event: SceneEvent) {
  if (event.kind === 'room-enter')
    return `Enter ${building.floors.flatMap((floor) => floor.rooms).find((room) => room.id === event.roomId)?.name ?? 'room'}`;
  if (event.kind === 'door')
    return `${targetIdentity(building, { kind: 'door', id: event.doorId })?.label ?? 'Door'} ${event.open ? 'opens' : 'closes'}`;
  const object = building.objects.find((value) => value.id === event.objectId);
  if (event.kind === 'openable')
    return `${object?.label ?? 'Item'} · ${event.open ? 'opens' : 'closes'}`;
  return event.kind === 'object-click'
    ? `Click ${object?.label ?? 'item'}`
    : `${object?.label ?? 'Device'}${event.behaviour ? ` · ${event.behaviour === 'water' ? 'water' : event.behaviour}` : ''} turns ${event.powered ? 'on' : 'off'}`;
}
function actionLabel(building: Building, action: SceneAction) {
  const label =
    'objectId' in action
      ? (building.objects.find((object) => object.id === action.objectId)?.label ?? 'item')
      : '';
  if (action.type === 'set-door')
    return `${action.open ? 'Open' : 'Close'} ${targetIdentity(building, { kind: 'door', id: action.doorId })?.label ?? 'door'}`;
  if (action.type === 'set-opening')
    return `Door or window · ${action.width} × ${action.height} m · offset ${action.offset} m`;
  if (action.type === 'move-partition') return `Move partition to ${action.position} m`;
  if (action.type === 'translate-object') {
    const distance = Math.hypot(action.delta.x, action.delta.y, action.delta.z);
    return `Move ${label} ${Number((distance * 100).toFixed(1))} cm each time`;
  }
  if (action.type === 'turn-object')
    return `Turn ${label} ${Number(((action.radians * 180) / Math.PI).toFixed(1))}° each time`;
  if (action.type === 'adjust-light-intensity')
    return `${action.delta >= 0 ? 'Brighten' : 'Dim'} ${label} each time`;
  if (action.type === 'adjust-television-volume')
    return `${action.delta >= 0 ? 'Raise' : 'Lower'} ${label} volume ${Number((Math.abs(action.delta) * 100).toFixed(1))}% each time`;
  if (action.type === 'set-openable') {
    const object = building.objects.find((value) => value.id === action.objectId);
    return `${action.state.open ? 'Open' : 'Close'} ${label} · ${householdOpenableLabel(object?.assetId ?? '') ?? 'storage'}`;
  }
  if (action.type === 'ignite-cooker') return `Ignite ${label} using its current burner settings`;
  if (action.type === 'start-water') return `Turn on ${label} water using its current settings`;
  if (action.type === 'set-cooker-burner')
    return `${action.enabled ? 'Ignite' : 'Extinguish'} ${label} · ${['front left', 'front right', 'back left', 'back right'][action.burner]} burner`;
  if (action.type === 'adjust-cooker-heat' || action.type === 'adjust-water-flow')
    return `${action.delta >= 0 ? 'Increase' : 'Decrease'} ${label} ${action.type === 'adjust-cooker-heat' ? 'heat' : 'flow'} ${Math.round(Math.abs(action.delta) * 100)}% each time`;
  if (action.type === 'adjust-water-temperature')
    return `${action.delta >= 0 ? 'Warm' : 'Cool'} ${label} water by ${Math.abs(action.delta)}°C each time`;
  if (action.type === 'set-cooker' || action.type === 'set-water') {
    const values = Object.entries(action.state).map(([key, value]) =>
      key === 'powered'
        ? value
          ? 'on'
          : 'off'
        : key === 'heat' || key === 'flow'
          ? `${key} ${Math.round(Number(value) * 100)}%`
          : key === 'temperature'
            ? `${value}°C`
            : `burners: ${(value as boolean[]).flatMap((on, index) => (on ? [['front left', 'front right', 'back left', 'back right'][index]] : [])).join(', ') || 'off'}`,
    );
    return `${label} · ${action.type === 'set-water' ? 'water' : 'cooker'}: ${values.join(', ')}`;
  }
  if (action.type === 'set-light' || action.type === 'set-television') {
    const values = Object.entries(action.state).map(([key, value]) =>
      key === 'powered' ? (value ? 'on' : 'off') : `${key}: ${String(value)}`,
    );
    return `${label}: ${values.join(', ')}`;
  }
  if (action.type === 'set-wall-material' || action.type === 'set-wall-exterior-material')
    return `${targetIdentity(building, { kind: 'wall', id: action.wallId })?.label ?? 'Wall'} · ${action.type === 'set-wall-exterior-material' ? 'outside' : 'inside'} · ${action.type === 'set-wall-material' ? action.material.color : (action.material?.color ?? 'original finish')}`;
  if (action.type === 'set-object-material')
    return `${label} · ${action.slot} · ${action.material.color}`;
  if (action.type === 'set-site-material')
    return `${targetIdentity(building, { kind: 'surface', id: action.surfaceId })?.label ?? 'Exterior surface'} · ${action.material?.color ?? 'original finish'}`;
  if (action.type === 'set-roof-material') return `Roof · ${action.material.color}`;
  if (action.type === 'set-room-floor-material')
    return `${building.floors.flatMap((floor) => floor.rooms).find((room) => room.id === action.roomId)?.name ?? 'Room'} floor · ${action.material.color}`;
  if (action.type === 'move-object') return `Move ${label} to its saved position`;
  if (action.type === 'rotate-object')
    return `Turn ${label} to ${Math.round((action.rotation * 180) / Math.PI)}°`;
  if (action.type === 'resize-object') return `Resize ${label}`;
  if (action.type === 'replace-object') return `Replace ${label}`;
  if (action.type === 'remove-object') return `Remove ${label}`;
  if (action.type === 'add-object') return `Add ${action.object.label}`;
}
export function SavedActions() {
  const readonly = useCollaboration(
    (state) =>
      state.status !== 'idle' && (state.status !== 'live' || state.state?.self.role === 'viewer'),
  );
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    [instruction, setInstruction] = useState('');
  const { compiled, edit, notify } = useProject(),
    building = compiled.building,
    rules = building.rules ?? [];
  const { send, busy, reply } = useLanguageEdit({ kind: 'house', id: building.id });
  return (
    <div className="saved-actions">
      <button className="saved-actions-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Zap size={15} />
        <span>Saved actions{rules.length ? ` · ${rules.length}` : ''}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <section aria-label="Saved actions">
          {!rules.length && (
            <p>
              Describe a connection in house chat, such as “When I turn on the TV, dim the lounge
              lights.”
            </p>
          )}
          {rules.map((rule) => (
            <article key={rule.id}>
              <div className="saved-action-heading">
                <button
                  role="switch"
                  aria-checked={rule.enabled}
                  aria-label={`Enable ${rule.label}`}
                  className="action-switch"
                  disabled={readonly || busy}
                  onClick={() =>
                    edit(
                      [
                        {
                          type: 'set-rules',
                          rules: rules.map((item) =>
                            item.id === rule.id ? { ...item, enabled: !item.enabled } : item,
                          ),
                        },
                      ],
                      { label: `${rule.enabled ? 'Disable' : 'Enable'} ${rule.label}` },
                    )
                  }
                >
                  <i />
                </button>
                <strong>{rule.label}</strong>
                <button
                  className="icon-button"
                  aria-label={`Test actions for ${rule.label}`}
                  title="Test actions · undo to restore"
                  disabled={readonly || busy || !rule.enabled}
                  onClick={() => {
                    try {
                      if (
                        edit(savedActionCommands(building, rule.id), {
                          label: `Test ${rule.label}`,
                        })
                      )
                        notify('Actions applied. Undo restores the previous state.');
                    } catch (error) {
                      notify(
                        error instanceof Error ? error.message : 'This action could not be tested.',
                      );
                    }
                  }}
                >
                  <Play size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Edit ${rule.label}`}
                  disabled={readonly || busy}
                  onClick={() => {
                    setEditing(editing === rule.id ? null : rule.id);
                    setInstruction('');
                  }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Remove ${rule.label}`}
                  disabled={readonly || busy}
                  onClick={() =>
                    edit(
                      [{ type: 'set-rules', rules: rules.filter((item) => item.id !== rule.id) }],
                      { label: `Remove ${rule.label}` },
                    )
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <details>
                <summary>{eventLabel(building, rule.trigger)}</summary>
                <ul>
                  {rule.conditions.map((condition, index) => (
                    <li key={`condition:${index}`}>Only if {eventLabel(building, condition)}</li>
                  ))}
                  {rule.actions.map((action, index) => (
                    <li key={index}>{actionLabel(building, action)}</li>
                  ))}
                </ul>
              </details>
              {editing === rule.id && (
                <form
                  className="saved-action-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (instruction.trim())
                      void send(`Update saved action ${rule.id}: ${instruction.trim()}`).then(
                        (success) => {
                          if (success) setInstruction('');
                        },
                      );
                  }}
                >
                  <label htmlFor={`edit-rule-${rule.id}`}>Describe the change</label>
                  <textarea
                    id={`edit-rule-${rule.id}`}
                    rows={2}
                    maxLength={280}
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    placeholder="Also close the lounge door…"
                    disabled={readonly || busy}
                    onKeyDown={(event) => event.stopPropagation()}
                  />
                  <div className="saved-action-editor-buttons">
                    <button
                      className="button compact outline"
                      disabled={readonly || busy || !instruction.trim()}
                    >
                      {busy ? (
                        <LoaderCircle size={13} className="spinning" />
                      ) : (
                        <Pencil size={13} />
                      )}
                      Update action
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Close action editor"
                      onClick={() => setEditing(null)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {reply && <p role="status">{reply}</p>}
                </form>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
