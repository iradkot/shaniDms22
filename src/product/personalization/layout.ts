import type {DestinationPlatform} from '../destinations';
import type {PersonalizationLayout} from './types';

export const getPersonalizationLayout = (
  platform: DestinationPlatform,
  width: number,
  height?: number,
): PersonalizationLayout => {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 0;
  if (platform === 'web' && safeWidth >= 1100) {
    return 'desktop';
  }
  // A landscape phone is still a phone; browser profiles follow window width.
  const profileWidth =
    platform !== 'web' &&
    height !== undefined &&
    Number.isFinite(height) &&
    height > 0
      ? Math.min(safeWidth, height)
      : safeWidth;
  return profileWidth >= 760 ? 'tablet' : 'phone';
};
