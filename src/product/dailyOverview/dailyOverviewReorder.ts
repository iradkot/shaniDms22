import type {ReactNode} from 'react';

export interface DailyOverviewReorderItem {
  readonly id: string;
  readonly label: string;
  readonly preview: ReactNode;
}

export interface DailyOverviewReorderListProps {
  readonly items: readonly DailyOverviewReorderItem[];
  readonly onReorder: (ids: readonly string[]) => void;
  readonly locale: 'en' | 'he';
  readonly disabled?: boolean;
}

export const REORDER_CARD_HEIGHT = 112;
export const REORDER_ROW_HEIGHT = 124;
export const REORDER_VIEWPORT_HEIGHT = 390;

export function reorderIds(
  ids: readonly string[],
  id: string,
  target: number,
): string[] {
  const source = ids.indexOf(id);
  if (source < 0 || !Number.isFinite(target)) {
    return [...ids];
  }
  const result = [...ids];
  result.splice(source, 1);
  result.splice(
    Math.max(0, Math.min(result.length, Math.round(target))),
    0,
    id,
  );
  return result;
}

export function makePositions(ids: readonly string[]): Record<string, number> {
  return Object.fromEntries(ids.map((id, index) => [id, index]));
}

export function movePosition(
  positions: Record<string, number>,
  id: string,
  target: number,
): Record<string, number> {
  'worklet';
  const source = positions[id];
  if (source === undefined || source === target) {
    return positions;
  }
  const result = {...positions};
  for (const otherId of Object.keys(positions)) {
    const position = positions[otherId] ?? 0;
    if (otherId === id) {
      result[otherId] = target;
    } else if (source < target && position > source && position <= target) {
      result[otherId] = position - 1;
    } else if (source > target && position >= target && position < source) {
      result[otherId] = position + 1;
    }
  }
  return result;
}

/** Pixels per second. A stationary finger near an edge keeps scrolling. */
export function edgeScrollVelocity(
  fingerY: number,
  viewportHeight: number,
): number {
  'worklet';
  const edge = Math.min(64, viewportHeight / 3);
  if (fingerY < edge) {
    return -480 * Math.min(1, Math.max(0, (edge - fingerY) / edge));
  }
  if (fingerY > viewportHeight - edge) {
    return (
      480 * Math.min(1, Math.max(0, (fingerY - viewportHeight + edge) / edge))
    );
  }
  return 0;
}

export const reorderCopy = {
  en: {
    list: 'Arrange daily overview cards',
    drag: 'Drag to reorder',
    hint: 'Drag up or down. Hold near an edge to scroll.',
    up: 'Move up',
    down: 'Move down',
    moved: (label: string, position: number, count: number) =>
      `${label}, position ${position} of ${count}`,
  },
  he: {
    list: 'סידור הכרטיסים במבט היומי',
    drag: 'גרירה לשינוי הסדר',
    hint: 'גררו למעלה או למטה. החזיקו ליד הקצה כדי לגלול.',
    up: 'הזזה למעלה',
    down: 'הזזה למטה',
    moved: (label: string, position: number, count: number) =>
      `${label}, מיקום ${position} מתוך ${count}`,
  },
} as const;
