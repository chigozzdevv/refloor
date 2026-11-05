import { useEffect, useState } from 'react';
import { SRGBColorSpace, VideoTexture } from 'three';
import type { SceneObject } from '@refloor/scene';
import {
  mediaPlayers,
  playbackFor,
  playMedia,
  releasePlayback,
  setPlayback,
  stopMedia,
} from '@/shared/behaviours/television';

export function TelevisionScreen({ object }: { object: SceneObject }) {
  const state = object.behaviours.find((value) => value.kind === 'television')?.state;
  const [texture, setTexture] = useState<VideoTexture | null>(null);
  const source = state?.source ?? null;
  useEffect(() => {
    setTexture(null);
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.playsInline = true;
    video.preload = 'none';
    video.muted = true;
    let screen: VideoTexture | null = null;
    mediaPlayers.set(object.id, video);
    const clearScreen = () => {
        screen?.dispose();
        screen = null;
        setTexture(null);
      },
      loaded = () => {
        screen?.dispose();
        screen = new VideoTexture(video);
        screen.colorSpace = SRGBColorSpace;
        screen.needsUpdate = true;
        setTexture(screen);
      },
      playing = () => {
        if (!video.paused) setPlayback(object.id, { status: 'playing', message: null });
      },
      failed = () => {
        if (video.getAttribute('src') && playbackFor(object.id).status !== 'off')
          setPlayback(object.id, {
            status: 'failed',
            message:
              'This video could not load. Check the direct video URL and cross-origin access.',
          });
      };
    video.addEventListener('playing', playing);
    video.addEventListener('error', failed);
    video.addEventListener('loadeddata', loaded);
    video.addEventListener('emptied', clearScreen);
    return () => {
      video.removeEventListener('playing', playing);
      video.removeEventListener('error', failed);
      video.removeEventListener('loadeddata', loaded);
      video.removeEventListener('emptied', clearScreen);
      releasePlayback(object.id, video);
      video.pause();
      video.removeAttribute('src');
      video.load();
      screen?.dispose();
    };
  }, [object.id]);
  useEffect(() => {
    const video = mediaPlayers.get(object.id);
    if (!video || !state) return;
    video.muted = state.muted;
    video.volume = state.volume;
    if (state.powered) playMedia(object.id, source);
    else stopMedia(object.id);
  }, [object.id, source, state?.powered, state?.muted, state?.volume]);
  return (
    <meshPhysicalMaterial
      color="#050505"
      map={texture}
      emissive="#ffffff"
      emissiveMap={texture}
      emissiveIntensity={state?.powered ? 1 : 0}
      roughness={0.12}
      metalness={0.15}
      clearcoat={1}
      toneMapped={false}
    />
  );
}
