import { useProject } from '@/shared/scene/scene-store';
import { MovementControl } from '@/components/navigation/movement-control';
import { FurniturePicker } from '@/components/editor/furniture-picker';

export type HousePageProps = {
  libraryOpen: boolean;
  closeLibrary: () => void;
};

export function HousePage({ libraryOpen, closeLibrary }: HousePageProps) {
  const { mode, floorId } = useProject();
  return (
    <>
      {mode === 'walk' && <MovementControl />}
      {libraryOpen && <FurniturePicker key={floorId} close={closeLibrary} />}
    </>
  );
}
