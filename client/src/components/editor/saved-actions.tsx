import { useState } from 'react';
import { ChevronDown, Trash2, Zap } from 'lucide-react';
import type { Building, SceneAction, SceneEvent } from '@refloor/scene';
import { useProject } from '@/shared/scene/scene-store';
import { targetIdentity } from '@/shared/editor/identity';

function eventLabel(building: Building, event: SceneEvent) {
  if (event.kind === 'room-enter')
    return `Enter ${building.floors.flatMap((floor) => floor.rooms).find((room) => room.id === event.roomId)?.name ?? 'room'}`;
  if (event.kind === 'door')
    return `${targetIdentity(building, { kind: 'door', id: event.doorId })?.label ?? 'Door'} ${event.open ? 'opens' : 'closes'}`;
  const object = building.objects.find((value) => value.id === event.objectId);
  return event.kind === 'object-click'
    ? `Click ${object?.label ?? 'item'}`
    : `${object?.label ?? 'Device'} turns ${event.powered ? 'on' : 'off'}`;
}
function actionLabel(building: Building, action: SceneAction) {
  const label =
    'objectId' in action
      ? (building.objects.find((object) => object.id === action.objectId)?.label ?? 'item')
      : '';
  if (action.type === 'set-door')
    return `${action.open ? 'Open' : 'Close'} ${targetIdentity(building, { kind: 'door', id: action.doorId })?.label ?? 'door'}`;
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
  if (action.type === 'set-light' || action.type === 'set-television') {
    const values = Object.entries(action.state).map(([key, value]) =>
      key === 'powered' ? (value ? 'on' : 'off') : `${key}: ${String(value)}`,
    );
    return `${label}: ${values.join(', ')}`;
  }
  return `${action.type.replaceAll('-', ' ')} ${label}`.trim();
}
export function SavedActions() {
  const [open, setOpen] = useState(false);
  const { compiled, edit } = useProject(),
    building = compiled.building,
    rules = building.rules ?? [];
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
                  aria-label={`Remove ${rule.label}`}
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
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
