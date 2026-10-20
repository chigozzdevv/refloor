import type { CompiledBuilding } from '@refloor/engine';

type Waiting = {
  compiled: CompiledBuilding;
  after: number;
  affected: ReadonlySet<string> | undefined;
  resolve: () => void;
  reject: (error: Error) => void;
  dispose: () => void;
};

export class ScenePresentation {
  private committed: CompiledBuilding | null = null;
  private presented: CompiledBuilding | null = null;
  private commits = 0;
  private motions = new Map<symbol, { buildingId: string; entityId: string }>();
  private waiting = new Set<Waiting>();

  commit(compiled: CompiledBuilding) {
    this.commits++;
    this.committed = compiled;
    this.presented = null;
  }

  suspend(compiled: CompiledBuilding) {
    if (this.committed === compiled) this.committed = null;
    if (this.presented === compiled) this.presented = null;
  }

  motion(owner: symbol, buildingId: string, moving: boolean, entityId: string) {
    if (moving) this.motions.set(owner, { buildingId, entityId });
    else this.motions.delete(owner);
  }

  release(owner: symbol) {
    this.motions.delete(owner);
  }

  frame(compiled: CompiledBuilding) {
    if (this.committed !== compiled) return;
    // The renderer and compositor draw synchronously after their frame callbacks.
    queueMicrotask(() => {
      if (this.committed !== compiled) return;
      this.presented = compiled;
      for (const request of this.waiting)
        if (
          (compiled === request.compiled ||
            (this.commits > request.after && this.includes(compiled, request.compiled))) &&
          !this.moving(compiled.building.id, request.affected)
        )
          this.finish(request);
    });
  }

  waitFor(
    compiled: CompiledBuilding,
    signal: AbortSignal,
    affected?: ReadonlySet<string>,
  ): Promise<void> {
    if (signal.aborted) return Promise.reject(new Error('This space is no longer open.'));
    if (
      this.presented === compiled &&
      this.committed === compiled &&
      !this.moving(compiled.building.id, affected)
    )
      return Promise.resolve();
    return new Promise((resolve, reject) => {
      const abort = () => this.finish(request, new Error('This space is no longer open.')),
        request: Waiting = {
          compiled,
          after: this.commits,
          affected,
          resolve,
          reject,
          dispose: () => signal.removeEventListener('abort', abort),
        };
      this.waiting.add(request);
      signal.addEventListener('abort', abort, { once: true });
    });
  }

  fail(error: Error, buildingId?: string, entityId?: string) {
    for (const request of this.waiting)
      if (
        (!buildingId || request.compiled.building.id === buildingId) &&
        (!entityId || !request.affected || request.affected.has(entityId))
      )
        this.finish(request, error);
  }

  pending(buildingId: string) {
    return [...this.waiting].some((request) => request.compiled.building.id === buildingId);
  }

  private moving(buildingId: string, affected?: ReadonlySet<string>) {
    return [...this.motions.values()].some(
      (value) => value.buildingId === buildingId && (!affected || affected.has(value.entityId)),
    );
  }

  private includes(rendered: CompiledBuilding, requested: CompiledBuilding) {
    return (
      rendered.building.id === requested.building.id &&
      rendered.building.revision >= requested.building.revision
    );
  }

  private finish(request: Waiting, error?: Error) {
    this.waiting.delete(request);
    request.dispose();
    if (error) request.reject(error);
    else request.resolve();
  }
}

export const scenePresentation = new ScenePresentation();
