import { useEffect, useState } from 'react';
import { SRGBColorSpace, VideoTexture } from 'three';
import type { SceneObject } from '@refloor/scene';
import {
  mediaPlayers,
  mediaSource,
  playMedia,
  releasePlayback,
  setPlayback,
} from '@/shared/behaviours/television';

export function TelevisionScreen({ object }: { object: SceneObject }) {
  const state = object.behaviours.find((value) => value.kind === 'television')?.state;
  const [texture, setTexture] = useState<VideoTexture | null>(null);
  const source = state?.source ?? null;
  useEffect(() => {
    setTexture(null);
    const url = mediaSource(source);
    if (!url) {
      setPlayback(object.id, {
        status: 'failed',
        message: 'Choose the included clip or a direct MP4 video URL.',
      });
      return;
    }
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.muted = true;
    video.src = url;
    const screen = new VideoTexture(video);
    screen.colorSpace = SRGBColorSpace;
    mediaPlayers.set(object.id, video);
    const playing = () => setPlayback(object.id, { status: 'playing', message: null }),
      failed = () =>
        setPlayback(object.id, {
          status: 'failed',
          message: 'This video could not load. Check the direct video URL and cross-origin access.',
        });
    video.addEventListener('playing', playing);
    video.addEventListener('error', failed);
    setTexture(screen);
    return () => {
      video.removeEventListener('playing', playing);
      video.removeEventListener('error', failed);
      releasePlayback(object.id, video);
      video.pause();
      video.removeAttribute('src');
      video.load();
      screen.dispose();
    };
  }, [object.id, source]);
  useEffect(() => {
    const video = mediaPlayers.get(object.id);
    if (!video || !state) return;
    video.muted = state.muted;
    video.volume = state.volume;
    if (state.powered) playMedia(object.id);
    else {
      video.pause();
      setPlayback(object.id, { status: 'off', message: null });
    }
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
