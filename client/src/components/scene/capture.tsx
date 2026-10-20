import { useFrame } from '@react-three/fiber';
import { useCapture } from '@/shared/scene/capture';
import { useProject } from '@/shared/scene/scene-store';

export function SceneCapture() {
  useFrame(({ gl }) => {
    if (!useCapture.getState().pending) return;
    useCapture.setState({ pending: false, capturing: true });
    const state = useProject.getState(),
      name = state.compiled.building.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'house';
    try {
      gl.domElement.toBlob((blob) => {
        try {
          if (!blob) throw new Error('The image could not be created. Please try again.');
          const url = URL.createObjectURL(blob),
            link = document.createElement('a');
          link.href = url;
          link.download = `${name}-${new Date().toISOString().slice(0, 10)}.png`;
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          state.notify('View saved as an image.');
        } catch (error) {
          state.notify(error instanceof Error ? error.message : 'The image could not be saved.');
        } finally {
          useCapture.setState({ capturing: false });
        }
      }, 'image/png');
    } catch {
      useCapture.setState({ capturing: false });
      state.notify('The image could not be saved. Please try again.');
    }
  }, 2);
  return null;
}
