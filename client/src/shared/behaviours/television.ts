import { create } from 'zustand';
import type { Building, SceneCommand } from '@refloor/scene';

type PlaybackState = {
  status: 'off' | 'loading' | 'playing' | 'paused' | 'blocked' | 'failed';
  message: string | null;
};
const idle: PlaybackState = { status: 'off', message: null };
export const usePlayback = create<{ players: Record<string, PlaybackState> }>(() => ({
  players: {},
}));
export const mediaPlayers = new Map<string, HTMLVideoElement>();
export const playbackFor = (id: string) => usePlayback.getState().players[id] ?? idle;
export function setPlayback(id: string, state: PlaybackState) {
  usePlayback.setState((current) => ({ players: { ...current.players, [id]: state } }));
}
export function releasePlayback(id: string, video: HTMLVideoElement) {
  if (mediaPlayers.get(id) !== video) return;
  mediaPlayers.delete(id);
  usePlayback.setState((current) => ({
    players: Object.fromEntries(Object.entries(current.players).filter(([key]) => key !== id)),
  }));
}
export function mediaSource(source: string | null): string | null {
  if (!source || source === 'asset:waterfall')
    return '/media/tv-demo.mp4';
  if (/^https?:\/\//i.test(source)) return source;
  return null;
}
export function prepareMediaCommand(commands: SceneCommand[], building: Building) {
  const ids = new Set(
    commands.flatMap((command) => (command.type === 'set-television' ? [command.objectId] : [])),
  );
  for (const id of ids) {
    const video = mediaPlayers.get(id),
      state = building.objects
        .find((object) => object.id === id)
        ?.behaviours.find((value) => value.kind === 'television')?.state;
    if (!video || !state) continue;
    video.muted = state.muted;
    video.volume = state.volume;
    if (state.powered) playMedia(id);
    else video.pause();
  }
}

export function waitForPlayback(ids: string[], signal: AbortSignal): Promise<void> {
  if (!ids.length) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const finish = (error?: Error) => {
        unsubscribe();
        signal.removeEventListener('abort', abort);
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      },
      abort = () => finish(new Error('This space is no longer open.')),
      timer = setTimeout(
        () =>
          finish(
            new Error(
              'Video is still loading. Check its connection or source and send “turn on” to retry.',
            ),
          ),
        15000,
      ),
      check = () => {
        if (signal.aborted) {
          abort();
          return;
        }
        const states = ids.map(playbackFor),
          failed = states.find((state) => state.status === 'blocked' || state.status === 'failed');
        if (failed) finish(new Error(failed.message ?? 'The video could not play.'));
        else if (states.every((state) => state.status === 'playing')) finish();
      };
    unsubscribe = usePlayback.subscribe(check);
    signal.addEventListener('abort', abort, { once: true });
    check();
  });
}
export function playMedia(id: string) {
  const video = mediaPlayers.get(id);
  if (!video) return;
  if (video.paused || video.readyState < 3) setPlayback(id, { status: 'loading', message: null });
  void video
    .play()
    .then(() => {
      if (mediaPlayers.get(id) === video && !video.paused)
        setPlayback(id, { status: 'playing', message: null });
    })
    .catch((error: unknown) => {
      if (mediaPlayers.get(id) !== video) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const blocked = error instanceof DOMException && error.name === 'NotAllowedError';
      setPlayback(id, {
        status: blocked ? 'blocked' : 'failed',
        message: blocked
          ? 'Send “turn on” or “unmute the TV” to allow playback in this browser.'
          : 'This video could not play. Check the direct video URL, codec and cross-origin access.',
      });
    });
}
