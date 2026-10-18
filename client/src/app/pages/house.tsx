import { useProject } from '@/shared/scene/scene-store';
import { TouchControls } from '@/components/navigation/touch-controls';
import { FloorSelector } from '@/components/navigation/floor-selector';
import { EditorPanel } from '@/components/editor/editor-panel';
import { FurniturePicker } from '@/components/editor/furniture-picker';
import { ObjectToolbar } from '@/components/editor/object-toolbar';

export type HousePageProps = {
  libraryOpen: boolean;
  toggleLibrary: () => void;
  closeLibrary: () => void;
};

export function HousePage({ libraryOpen, toggleLibrary, closeLibrary }: HousePageProps) {
  const { mode, floorId } = useProject();
  return (
    <>
      {mode !== 'walk' && (
        <section className="space-heading">
          <span className="eyebrow">A SPACE TO MAKE YOUR OWN</span>
          <h1>
            Good spaces.
            <br />
            <em>Better living.</em>
          </h1>
          <p>
            Look around. Find your angle.
            <br />
            Make yourself at home.
          </p>
        </section>
      )}
      <FloorSelector />
      {mode === 'walk' && <TouchControls />}
      <ObjectToolbar openLibrary={toggleLibrary} />
      <EditorPanel />
      {libraryOpen && <FurniturePicker key={floorId} close={closeLibrary} />}
    </>
  );
}
