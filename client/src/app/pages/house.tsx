import { useProject } from '@/shared/scene/scene-store';
import { JourneyControls } from '@/components/navigation/journey-controls';
import { FurniturePicker } from '@/components/editor/furniture-picker';

export type HousePageProps = {
  libraryOpen: boolean;
  closeLibrary: () => void;
};

export function HousePage({ libraryOpen, closeLibrary }: HousePageProps) {
  const { mode, floorId, projectEpoch } = useProject();
  return (
    <>
      {mode === 'walk' && <JourneyControls key={projectEpoch} />}
      {libraryOpen && <FurniturePicker key={floorId} close={closeLibrary} />}
    </>
  );
}
