import React from 'react';
import {View} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import type {TrendsRangeDistribution} from '../../modules/trends';
import type {StoredDailyOverviewPreferences} from '../personalization/types';
import {dailyOverviewCardStyles as styles} from './dailyOverviewCardStyles';

export const RANGE_COLORS = [
  '#FF6C81',
  '#FFA4AF',
  '#68DFC7',
  '#F4C276',
  '#E19650',
] as const;
export const RANGE_KEYS = [
  'veryLowPercent',
  'lowPercent',
  'targetPercent',
  'highPercent',
  'veryHighPercent',
] as const;
export const RANGE_LABELS = [
  'veryLow',
  'low',
  'target',
  'high',
  'veryHigh',
] as const;
export const RangeGraphic = ({
  ranges,
  variant,
  miniature = false,
  dark = false,
  size = 152,
}: {
  readonly ranges: TrendsRangeDistribution;
  readonly variant: StoredDailyOverviewPreferences['rangeStyle'];
  readonly miniature?: boolean;
  readonly dark?: boolean;
  readonly size?: number;
}) => {
  const total = RANGE_KEYS.reduce((sum, key) => sum + ranges[key], 0);
  if (variant === 'ring') {
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    return (
      <Svg
        width={miniature ? 38 : size}
        height={miniature ? 38 : size}
        viewBox="0 0 152 152"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Circle
          cx={76}
          cy={76}
          r={radius}
          stroke={dark ? '#34445B' : '#E6EEEB'}
          strokeWidth={14}
          fill="none"
        />
        {RANGE_KEYS.map((key, index) => {
          const length = total > 0 ? (ranges[key] / total) * circumference : 0;
          const start = offset;
          offset += length;
          return length > 0 ? (
            <Circle
              key={key}
              cx={76}
              cy={76}
              r={radius}
              fill="none"
              stroke={RANGE_COLORS[index]!}
              strokeWidth={14}
              strokeDasharray={`${length} ${circumference}`}
              strokeDashoffset={-start}
              rotation={-90}
              origin="76, 76"
            />
          ) : null;
        })}
      </Svg>
    );
  }
  if (variant === 'bar') {
    return (
      <View
        style={[styles.rangeBar, miniature && styles.miniBar]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {RANGE_KEYS.map((key, index) =>
          ranges[key] > 0 ? (
            <View
              key={key}
              style={[
                styles.rangeSegment,
                {
                  flex: ranges[key],
                  backgroundColor: RANGE_COLORS[index],
                },
              ]}
            />
          ) : null,
        )}
      </View>
    );
  }
  return (
    <View
      style={styles.miniList}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {RANGE_COLORS.slice(1, 4).map(color => (
        <View key={color} style={styles.miniListRow}>
          <View style={[styles.dot, {backgroundColor: color}]} />
          <View style={styles.miniLine} />
        </View>
      ))}
    </View>
  );
};
