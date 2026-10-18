import { create } from 'zustand';

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
  if (!source || source === 'asset:waterfall') return '/media/tv-demo.mp4';
  if (/^https?:\/\//i.test(source)) return source;
  return null;
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
          ? 'Tap play to allow video and sound in this browser.'
          : 'This video could not play. Check the direct video URL, codec and cross-origin access.',
      });
    });
}
