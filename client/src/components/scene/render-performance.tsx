import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { FrameBudget, renderBudget } from '@/shared/scene/render-budget';
import { useRenderSettings } from '@/shared/scene/render-settings';
import { useProject } from '@/shared/scene/scene-store';
import { useExperience } from '@/shared/scene/experience-store';

export function RenderPerformance() {
  const gl = useThree((state) => state.gl),
    size = useThree((state) => state.size),
    setDpr = useThree((state) => state.setDpr),
    quality = useProject((state) => state.quality),
    [reduction, setReduction] = useState(0),
    frames = useMemo(() => new FrameBudget(), []),
    report = useRef(0);
  const settings = useMemo(
    () =>
      renderBudget({
        ...size,
        devicePixelRatio: window.devicePixelRatio,
        maxSamples: gl.capabilities.maxSamples,
        maxTextureSize: gl.capabilities.maxTextureSize,
        quality,
        reduction,
      }),
    [size, gl, quality, reduction],
  );
  useLayoutEffect(() => {
    setDpr(settings.dpr);
    useRenderSettings.setState(settings);
  }, [settings, setDpr]);
  useEffect(() => {
    const resume = () => frames.reset(performance.now());
    resume();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, [frames, quality, size]);
  useEffect(() => {
    const autoReset = gl.info.autoReset;
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = autoReset;
      delete gl.domElement.dataset.renderMetrics;
    };
  }, [gl]);
  useFrame(() => gl.info.reset(), -100);
  useFrame((_state, delta) => {
    const now = performance.now();
    if (
      document.hidden ||
      !useProject.getState().sceneReady ||
      useExperience.getState().stage === 'prompt'
    ) {
      frames.reset(now);
      return;
    }
    const sample = frames.sample(delta * 1000, now);
    if (!sample) return;
    if (sample.reduction !== reduction) setReduction(sample.reduction);
    if (now - report.current < 1500) return;
    report.current = now;
    gl.domElement.dataset.renderMetrics = JSON.stringify({
      fps: Math.round(sample.fps),
      frameMilliseconds: Math.round(sample.mean * 10) / 10,
      p90Milliseconds: Math.round(sample.p90 * 10) / 10,
      reduction: sample.reduction,
      compact: settings.compact,
      dpr: gl.getPixelRatio(),
      width: gl.domElement.width,
      height: gl.domElement.height,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      textures: gl.info.memory.textures,
      geometries: gl.info.memory.geometries,
      programs: gl.info.programs?.length ?? 0,
      multisampling: settings.multisampling,
      sunlightResolution: settings.sunlightResolution,
      mirrorResolution: settings.mirrorResolution,
    });
  }, 3);
  return null;
}
