import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { MovementPad } from '@/components/navigation/movement-pad';

vi.mock('@/shared/scene/scene-store', () => ({
  useProject: () => ({ mode: 'walk', selection: null, interacting: false }),
}));
vi.mock('@/shared/scene/experience-store', () => ({
  useExperience: (select: (state: { stage: string }) => unknown) => select({ stage: 'ready' }),
}));
vi.mock('@/shared/navigation/navigation-store', () => ({
  useNavigation: (select: (state: { mapOpen: boolean }) => unknown) => select({ mapOpen: false }),
}));

it('keeps direct movement, turning and the joystick available inside the house', () => {
  const html = renderToStaticMarkup(createElement(MovementPad));
  for (const label of [
    'Walk forward',
    'Walk backward',
    'Walk left',
    'Walk right',
    'Turn left',
    'Turn right',
    'Drag to move in any direction',
  ])
    expect(html).toContain(`aria-label="${label}"`);
});
