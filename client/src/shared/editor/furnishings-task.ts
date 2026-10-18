import type { SceneCommand } from '@refloor/scene';
import type { CompiledBuilding, NavigationPoint } from '@refloor/engine';

export function planFurnishings(compiled: CompiledBuilding, player?: NavigationPoint) {
  const worker = new Worker(new URL('./furnishings-worker.ts', import.meta.url), {
    type: 'module',
  });
  return new Promise<{ commands: SceneCommand[]; skipped: number }>((resolve, reject) => {
    const timeout = window.setTimeout(
      () =>
        finish(new Error('This house took too long to furnish. Try a smaller room arrangement.')),
      45000,
    );
    const finish = (error?: Error, result?: { commands: SceneCommand[]; skipped: number }) => {
      window.clearTimeout(timeout);
      worker.terminate();
      if (error) reject(error);
      else if (result) resolve(result);
    };
    worker.onmessage = (
      event: MessageEvent<{
        result?: { commands: SceneCommand[]; skipped: number };
        error?: string;
      }>,
    ) => {
      if (event.data.error) finish(new Error(event.data.error));
      else finish(undefined, event.data.result);
    };
    worker.onerror = () => finish(new Error('Furnishings could not be completed.'));
    worker.postMessage({
      building: compiled.building,
      options: compiled.options,
      ...(player ? { player } : {}),
    });
  });
}
