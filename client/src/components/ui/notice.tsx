import { useProject } from '@/shared/scene/scene-store';

export function Notice() {
  const notice = useProject((state) => state.notice);
  return notice ? (
    <div className="notice" role="status">
      {notice}
    </div>
  ) : null;
}
