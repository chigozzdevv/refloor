import { useProject } from '@/shared/scene/scene-store';
import { JourneyControls } from '@/components/navigation/journey-controls';
import { FurniturePicker } from '@/components/editor/furniture-picker';
import { PortalDots } from '@/components/navigation/portal-dots';
import { MovementPad } from '@/components/navigation/movement-pad';

export type HousePageProps = {
  libraryOpen: boolean;
  panelOpen: boolean;
  addingFurniture: boolean;
  closeLibrary: () => void;
};

export function HousePage({
  libraryOpen,
  panelOpen,
  addingFurniture,
  closeLibrary,
}: HousePageProps) {
  const { mode, floorId, projectEpoch } = useProject();
  return (
    <>
      {mode === 'walk' && <JourneyControls key={projectEpoch} />}
      {!panelOpen && <PortalDots />}
      {mode === 'walk' && !panelOpen && <MovementPad />}
      {libraryOpen && (
        <FurniturePicker key={floorId} close={closeLibrary} initialAdding={addingFurniture} />
      )}
    </>
  );
}
