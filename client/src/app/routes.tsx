import { useProject } from '@/shared/scene/scene-store';
import { HomePage } from '@/app/pages/home';
import { HousePage } from '@/app/pages/house';
import type { HousePageProps } from '@/app/pages/house';

export function StudioRoutes(props: HousePageProps) {
  const mode = useProject((state) => state.mode);
  return mode === 'entry' ? <HomePage /> : <HousePage {...props} />;
}
