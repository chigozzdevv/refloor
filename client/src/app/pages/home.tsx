import { MoveUpRight } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';

export function HomePage() {
  const enterHome = useProject((state) => state.enterHome);
  return (
    <section className="space-heading entry-heading">
      <span className="eyebrow">A SPACE TO MAKE YOUR OWN</span>
      <h1>
        Step inside.
        <br />
        <em>Make it yours.</em>
      </h1>
      <p>
        Your next chapter starts at the door.
        <br />
        Make yourself at home.
      </p>
      <div className="entry-actions">
        <button className="button primary" onClick={enterHome}>
          Open the door <MoveUpRight size={16} />
        </button>
        <span>Or drag the brass handle.</span>
      </div>
    </section>
  );
}
