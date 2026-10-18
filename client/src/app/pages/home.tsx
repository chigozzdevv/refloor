import { DoorOpen } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';

export function HomePage() {
  const enterHome = useProject((state) => state.enterHome);
  return (
    <section className="entry-actions">
      <button className="button primary" onClick={enterHome}>
        <DoorOpen size={16} /> Open door
      </button>
    </section>
  );
}
