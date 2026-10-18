import { DoorOpen } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';
import { entryPose } from '@/shared/navigation/entry';

export function HomePage() {
  const enterHome = useProject((state) => state.enterHome);
  const compiled = useProject((state) => state.compiled);
  const open = compiled.doors.find((door) => door.id === entryPose(compiled).doorId)?.open;
  return (
    <section className="entry-actions">
      <button className="button primary" onClick={enterHome}>
        <DoorOpen size={16} /> {open ? 'Enter house' : 'Open door'}
      </button>
    </section>
  );
}
