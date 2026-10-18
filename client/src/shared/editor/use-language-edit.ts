import { useEffect, useRef, useState } from 'react';
import type { ChatTarget } from '@refloor/scene/chat';
import { editApi } from '@/shared/refloor/edits';
import { useProject } from '@/shared/scene/scene-store';
import { physicsSession } from '@/shared/navigation/physics-session';
import { walkInput } from '@/shared/navigation/input';
import { editingError } from '@/shared/editor/errors';

export function useLanguageEdit(target: ChatTarget) {
  const [busy, setBusy] = useState(false),
    [reply, setReply] = useState<string | null>(null);
  const mounted = useRef(true),
    pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const send = async (message: string) => {
    if (pending.current || !message.trim()) return false;
    pending.current = true;
    setBusy(true);
    setReply(null);
    const before = useProject.getState();
    try {
      const result = await editApi.interpret({
        requestId: crypto.randomUUID(),
        target,
        message,
        building: before.compiled.building,
        view: { ...walkInput.view },
        player: before.mode === 'walk' ? (physicsSession.current?.player ?? null) : null,
      });
      if (!mounted.current) return false;
      const current = useProject.getState();
      if (
        current.projectEpoch !== before.projectEpoch ||
        current.compiled.building !== before.compiled.building ||
        result.baseRevision !== current.compiled.building.revision
      )
        throw new Error('The space changed while I was working. Please try that again.');
      if (result.commands.length && !current.edit(result.commands))
        throw new Error(useProject.getState().notice ?? 'That change could not be applied.');
      setReply(result.message || 'Done.');
      return true;
    } catch (error) {
      if (mounted.current) setReply(editingError(error));
      return false;
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return { busy, reply, send };
}
