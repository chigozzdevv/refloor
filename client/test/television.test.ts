import { afterEach, expect, it, vi } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import {
  mediaPlayers,
  playbackFor,
  playMedia,
  prepareMediaCommand,
  releasePlayback,
  stopMedia,
  usePlayback,
} from '@/shared/behaviours/television';

class Video {
  src = '';
  paused = true;
  readyState = 0;
  muted = true;
  volume = 1;
  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  load = vi.fn();
  getAttribute = () => this.src || null;
  removeAttribute = () => {
    this.src = '';
  };
}
function register(id = 'tv') {
  const video = new Video();
  mediaPlayers.set(id, video as unknown as HTMLVideoElement);
  return video;
}
afterEach(() => {
  mediaPlayers.clear();
  usePlayback.setState({ players: {} });
});

it('leaves the video source unset while off and starts it in the direct command call', async () => {
  const house = createHouse({ id: 'video', name: 'Video', storeys: 1 }),
    object = house.objects.find((value) => value.kind === 'television')!,
    state = object.behaviours.find((value) => value.kind === 'television')!.state,
    video = register(object.id),
    commands = [{ type: 'set-television' as const, objectId: object.id, state: { powered: true } }];
  prepareMediaCommand(commands, house);
  expect(video.src).toBe('');
  expect(video.play).not.toHaveBeenCalled();
  state.powered = true;
  state.muted = false;
  state.volume = 0.4;
  prepareMediaCommand(commands, house);
  expect(video.src).toBe('/media/tv-demo.mp4');
  expect(video.play).toHaveBeenCalledOnce();
  expect(video.muted).toBe(false);
  expect(video.volume).toBe(0.4);
  await Promise.resolve();
  expect(playbackFor(object.id).status).toBe('playing');
});

it('switches sources on the same player and resumes its clip after power off', async () => {
  const video = register();
  playMedia('tv', 'asset:spring');
  await Promise.resolve();
  stopMedia('tv');
  expect(video.paused).toBe(true);
  expect(playbackFor('tv').status).toBe('off');
  expect(video.src).toBe('/media/tv-demo.mp4');
  playMedia('tv', 'https://example.com/another.mp4');
  await Promise.resolve();
  expect(video.src).toBe('https://example.com/another.mp4');
  expect(playbackFor('tv').status).toBe('playing');
});

it('ignores a pending play rejection after power off or player disposal', async () => {
  const video = register();
  let reject!: (error: Error) => void;
  video.play.mockImplementation(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      }),
  );
  playMedia('tv', null);
  stopMedia('tv');
  reject(new DOMException('User gesture required', 'NotAllowedError'));
  await Promise.resolve();
  await Promise.resolve();
  expect(playbackFor('tv').status).toBe('off');
  playMedia('tv', null);
  releasePlayback('tv', video as unknown as HTMLVideoElement);
  reject(new Error('Disposed'));
  await Promise.resolve();
  await Promise.resolve();
  expect(usePlayback.getState().players).toEqual({});
});

it('reports blocked playback and rejects an invalid source without retaining the old clip', async () => {
  const video = register();
  video.play.mockRejectedValue(new DOMException('User gesture required', 'NotAllowedError'));
  playMedia('tv', null);
  await Promise.resolve();
  await Promise.resolve();
  expect(playbackFor('tv').status).toBe('blocked');
  playMedia('tv', 'javascript:bad');
  expect(video.paused).toBe(true);
  expect(video.src).toBe('');
  expect(video.load).toHaveBeenCalledOnce();
  expect(playbackFor('tv').status).toBe('failed');
});
