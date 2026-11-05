import type { ProjectSummary } from '@refloor/scene/contracts';
import { House } from 'lucide-react';

const roomColors: Record<string, string> = {
  living: '#9aa98d',
  dining: '#b6a488',
  bedroom: '#98a6af',
  kitchen: '#b5a88f',
  bathroom: '#8ca9a7',
  workspace: '#a69bb3',
};

export function SavedHousePreview({ preview }: Pick<ProjectSummary, 'preview'>) {
  return preview ? (
    <svg
      className="saved-house-preview"
      viewBox={`-0.3 -0.3 ${preview.width + 0.6} ${preview.depth + 0.6}`}
      aria-hidden="true"
    >
      {preview.rooms.map((room, index) => (
        <rect
          key={index}
          x={room.x}
          y={room.z}
          width={room.width}
          height={room.depth}
          fill={roomColors[room.kind] ?? '#d0c6b3'}
          stroke="var(--panel)"
          strokeWidth={0.16}
        />
      ))}
    </svg>
  ) : (
    <House className="saved-house-preview" size={24} aria-hidden="true" />
  );
}
