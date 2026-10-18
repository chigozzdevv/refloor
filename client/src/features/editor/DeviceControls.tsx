import { useState } from 'react';
import { Play, Power, Volume2, VolumeX } from 'lucide-react';
import type { SceneObject } from '@refloor/scene';
import { useProject } from '@/features/projects/project-store';
import { mediaPlayers, playMedia, usePlayback } from '@/runtime/media/playback';

export function DeviceControls({ object }: { object: SceneObject }) {
  const edit = useProject((state) => state.edit),
    tv = object.behaviours.find((value) => value.kind === 'television'),
    light = object.behaviours.find((value) => value.kind === 'light');
  const playback = usePlayback((state) => state.players[object.id]),
    [source, setSource] = useState(tv?.state.source?.startsWith('http') ? tv.state.source : '');
  if (tv)
    return (
      <section className="device-controls" aria-label="Television controls">
        <div className="device-heading">
          <span className="field-caption">TELEVISION</span>
          <span className={`device-state ${tv.state.powered ? 'on' : ''}`}>
            {tv.state.powered ? (playback?.status ?? 'loading') : 'off'}
          </span>
        </div>
        <div className="device-actions">
          <button
            className={`tool-button ${tv.state.powered ? 'selected' : ''}`}
            onClick={() => {
              const video = mediaPlayers.get(object.id);
              if (!tv.state.powered && video) {
                video.muted = tv.state.muted;
                playMedia(object.id);
              }
              edit([
                {
                  type: 'set-television',
                  objectId: object.id,
                  state: {
                    powered: !tv.state.powered,
                    source: tv.state.source ?? 'asset:waterfall',
                  },
                },
              ]);
            }}
          >
            <Power size={14} />
            {tv.state.powered ? 'Turn off' : 'Turn on'}
          </button>
          <button
            className="tool-button"
            disabled={!tv.state.powered}
            onClick={() => {
              const video = mediaPlayers.get(object.id);
              if (video) {
                video.muted = !tv.state.muted;
                playMedia(object.id);
              }
              edit([
                { type: 'set-television', objectId: object.id, state: { muted: !tv.state.muted } },
              ]);
            }}
          >
            {tv.state.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}{' '}
            {tv.state.muted ? 'Unmute' : 'Mute'}
          </button>
        </div>
        {tv.state.powered && playback?.status === 'blocked' && (
          <button className="button compact outline" onClick={() => playMedia(object.id)}>
            <Play size={13} /> Play video
          </button>
        )}
        {tv.state.powered && playback?.message && (
          <p role="status" className="helper-text">
            {playback.message}
          </p>
        )}
        <form
          className="device-form"
          onSubmit={(event) => {
            event.preventDefault();
            edit([
              {
                type: 'set-television',
                objectId: object.id,
                state: { source: source.trim() || 'asset:waterfall' },
              },
            ]);
          }}
        >
          <label className="field-caption">
            VIDEO SOURCE
            <input
              type="url"
              aria-label="Video source URL"
              placeholder="Included waterfall clip"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            />
          </label>
          <button className="button compact outline">Set video</button>
          <p className="helper-text">
            Blank uses the included clip. Custom links must point to a browser-playable video with
            cross-origin access.
          </p>
        </form>
        <label className="field-caption">
          VOLUME
          <input
            key={tv.state.volume}
            aria-label="TV volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            defaultValue={tv.state.volume}
            onPointerUp={(event) =>
              edit([
                {
                  type: 'set-television',
                  objectId: object.id,
                  state: { volume: event.currentTarget.valueAsNumber },
                },
              ])
            }
            onKeyUp={(event) =>
              edit([
                {
                  type: 'set-television',
                  objectId: object.id,
                  state: { volume: event.currentTarget.valueAsNumber },
                },
              ])
            }
          />
        </label>
      </section>
    );
  if (light)
    return (
      <section className="device-controls" aria-label="Light controls">
        <div className="device-heading">
          <span className="field-caption">LIGHT</span>
          <span className={`device-state ${light.state.powered ? 'on' : ''}`}>
            {light.state.powered ? 'on' : 'off'}
          </span>
        </div>
        <button
          className="tool-button"
          onClick={() =>
            edit([
              { type: 'set-light', objectId: object.id, state: { powered: !light.state.powered } },
            ])
          }
        >
          <Power size={14} />
          {light.state.powered ? 'Turn off light' : 'Turn on light'}
        </button>
        <label className="field-caption">
          BRIGHTNESS
          <input
            key={light.state.intensity}
            aria-label="Light brightness"
            type="range"
            min={0}
            max={10}
            step={0.25}
            defaultValue={light.state.intensity}
            onPointerUp={(event) =>
              edit([
                {
                  type: 'set-light',
                  objectId: object.id,
                  state: { intensity: event.currentTarget.valueAsNumber },
                },
              ])
            }
            onKeyUp={(event) =>
              edit([
                {
                  type: 'set-light',
                  objectId: object.id,
                  state: { intensity: event.currentTarget.valueAsNumber },
                },
              ])
            }
          />
        </label>
        <div className="light-colours">
          {[
            ['Warm', '#ffe6bf'],
            ['Neutral', '#fff4e0'],
            ['Cool', '#dfedff'],
          ].map(([name, color]) => (
            <button
              className={`tool-button ${light.state.color === color ? 'selected' : ''}`}
              key={color}
              onClick={() =>
                edit([{ type: 'set-light', objectId: object.id, state: { color: color! } }])
              }
            >
              {name}
            </button>
          ))}
        </div>
      </section>
    );
  return null;
}
