import { useProject } from '@/shared/scene/scene-store';
import { HousePage } from '@/app/pages/house';
import type { HousePageProps } from '@/app/pages/house';

export function StudioRoutes(props: HousePageProps) {
  const mode = useProject((state) => state.mode);
  return mode === 'entry' ? null : <HousePage {...props} />;
}
