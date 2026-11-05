import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { FrameBudget, renderBudget } from '@/shared/scene/render-budget';
import { useRenderSettings } from '@/shared/scene/render-settings';
import { useProject } from '@/shared/scene/scene-store';
import { useExperience } from '@/shared/scene/experience-store';
import { renderActivity } from '@/shared/scene/render-activity';

export function RenderPerformance() {
  const gl = useThree((state) => state.gl),
    size = useThree((state) => state.size),
    setDpr = useThree((state) => state.setDpr),
    quality = useProject((state) => state.quality),
    [reduction, setReduction] = useState(0),
    frames = useMemo(() => new FrameBudget(), []),
    report = useRef(0),
    intervals = useRef<number[]>([]);
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
      intervals.current = [];
      report.current = now;
      return;
    }
    // An intentional idle interval is not a slow GPU frame.
    if (!renderActivity.continuous) frames.reset(now);
    else {
      const sample = frames.sample(delta * 1000, now);
      if (sample && sample.reduction !== reduction) setReduction(sample.reduction);
    }
    intervals.current.push(delta * 1000);
    if (now - report.current < 1500) return;
    report.current = now;
    const sorted = intervals.current.sort((a, b) => a - b),
      mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
      p90 = sorted[Math.floor((sorted.length - 1) * 0.9)] ?? mean;
    intervals.current = [];
    gl.domElement.dataset.renderMetrics = JSON.stringify({
      fps: Math.round(1000 / mean),
      frameMilliseconds: Math.round(mean * 10) / 10,
      p90Milliseconds: Math.round(p90 * 10) / 10,
      idle: !renderActivity.continuous,
      reduction: frames.reduction,
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
      ambientOcclusion: settings.ambientOcclusion,
      bloom: settings.bloom,
    });
  }, 3);
  return null;
}
