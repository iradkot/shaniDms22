import {reorderCopy as sharedCopy} from '../ui/reorder/reorder';
import type {ReorderListProps} from '../ui/reorder/reorder';

export {
  edgeScrollVelocity,
  makePositions,
  movePosition,
  REORDER_CARD_HEIGHT,
  REORDER_ROW_HEIGHT,
  REORDER_VIEWPORT_HEIGHT,
  reorderIds,
} from '../ui/reorder/reorder';
export type {ReorderItem as DailyOverviewReorderItem} from '../ui/reorder/reorder';
export type DailyOverviewReorderListProps = Omit<
  ReorderListProps,
  'testIDPrefix' | 'listAccessibilityLabel'
>;

export const reorderCopy = {
  en: {...sharedCopy.en, list: 'Arrange daily overview cards'},
  he: {...sharedCopy.he, list: 'סידור הכרטיסים במבט היומי'},
} as const;
