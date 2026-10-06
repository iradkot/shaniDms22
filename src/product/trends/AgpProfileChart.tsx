import React, {useMemo, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {LayoutChangeEvent} from 'react-native';
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import type {AgpProfile} from '../../modules/trends/domain/agp';
import type {DestinationLocale} from '../destinations';
import {productUiTokens} from '../ui';
import {buildAgpChartGeometry} from './agpChartGeometry';
import type {AgpChartThresholds} from './agpChartGeometry';

const COPY = {
  en: {
    caption:
      'Readings from all selected days are grouped by local clock hour. Shading shows the 10–90% and 25–75% percentile bands; the line shows the median. Missing hours remain gaps.',
    target: 'Target',
    median: 'Median',
    outer: '10–90%',
    inner: '25–75%',
    time: 'Local clock time',
    empty: 'No readings to plot for this period.',
    accessible:
      '24-hour AGP chart. Median and 10–90% and 25–75% percentile bands in mg/dL. Missing hours remain gaps. Hourly values are listed below.',
  },
  he: {
    caption:
      'הקריאות מכל הימים שנבחרו מקובצות לפי שעת השעון המקומית. ההצללה מציגה את טווחי האחוזונים 10–90% ו־25–75%, והקו מציג את החציון. שעות ללא קריאות נשארות כפערים.',
    target: 'טווח יעד',
    median: 'חציון',
    outer: '10–90%',
    inner: '25–75%',
    time: 'שעת שעון מקומית',
    empty: 'אין קריאות להצגה בגרף בתקופה הזו.',
    accessible:
      'גרף AGP לאורך היממה. חציון וטווחי אחוזונים 10 עד 90 ו־25 עד 75 ביחידות mg/dL. שעות ללא קריאות נשארות כפערים. הערכים לפי שעה מופיעים בהמשך.',
  },
} as const;

const COLORS = {
  median: '#245D8C',
  outer: '#D5E5F2',
  inner: '#8DB8D9',
  target: '#E8F5ED',
  targetLine: '#609E7B',
  grid: '#E5EBF0',
  axis: '#596F80',
} as const;

// Isolate number ranges from Hebrew paragraph direction. A bare RTL Text can
// otherwise display 10–90% as 90%–10, changing the visible percentile meaning.
const isolateNumericRuns = (text: string): string =>
  text.replace(
    /\d+(?:\.\d+)?(?:–\d+(?:\.\d+)?)?%?/g,
    number => `\u2066${number}\u2069`,
  );

export interface AgpProfileChartProps {
  readonly profile: AgpProfile;
  readonly locale: DestinationLocale;
  readonly thresholds: AgpChartThresholds;
}

export const AgpProfileChart = ({
  profile,
  locale,
  thresholds,
}: AgpProfileChartProps) => {
  const [width, setWidth] = useState(320);
  const geometry = useMemo(
    () => buildAgpChartGeometry(profile, thresholds, width),
    [profile, thresholds, width],
  );
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const onLayout = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.width;
    if (Number.isFinite(measured) && measured > 0) {
      setWidth(measured);
    }
  };
  const targetTop = geometry.yAtMgDl(thresholds.targetMaxMgDl);
  const targetBottom = geometry.yAtMgDl(thresholds.targetMinMgDl);

  return (
    <View style={styles.card} testID="agp-profile-chart">
      {geometry.segments.length === 0 ? (
        <Text
          style={[styles.caption, rtl && styles.rtl]}
          testID="agp-profile-chart-empty">
          {copy.empty}
        </Text>
      ) : (
        <>
          <View
            onLayout={onLayout}
            style={styles.plot}
            accessible
            accessibilityRole="image"
            accessibilityLabel={copy.accessible}
            testID="agp-profile-chart-plot">
            <Svg
              width={geometry.width}
              height={geometry.height}
              viewBox={`0 0 ${geometry.width} ${geometry.height}`}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              <Rect
                x={geometry.plot.left}
                y={targetTop}
                width={geometry.plot.width}
                height={Math.max(0, targetBottom - targetTop)}
                fill={COLORS.target}
                testID="agp-target-band"
              />
              {geometry.yTicks.map(value => (
                <G key={`y-${value}`}>
                  <Line
                    x1={geometry.plot.left}
                    x2={geometry.plot.right}
                    y1={geometry.yAtMgDl(value)}
                    y2={geometry.yAtMgDl(value)}
                    stroke={COLORS.grid}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={geometry.plot.left - 7}
                    y={geometry.yAtMgDl(value) + 4}
                    fill={COLORS.axis}
                    textAnchor="end"
                    fontSize={11}>
                    {value}
                  </SvgText>
                </G>
              ))}
              {[0, 6, 12, 18, 24].map(hour => (
                <G key={`x-${hour}`}>
                  <Line
                    x1={geometry.xAtHour(hour)}
                    x2={geometry.xAtHour(hour)}
                    y1={geometry.plot.top}
                    y2={geometry.plot.bottom}
                    stroke={COLORS.grid}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={geometry.xAtHour(hour)}
                    y={geometry.plot.bottom + 20}
                    fill={COLORS.axis}
                    textAnchor={
                      hour === 0 ? 'start' : hour === 24 ? 'end' : 'middle'
                    }
                    fontSize={11}>
                    {`${String(hour).padStart(2, '0')}:00`}
                  </SvgText>
                </G>
              ))}
              {geometry.segments.map(segment => {
                const first = segment.points[0]!;
                return segment.points.length === 1 ? (
                  <G key={first.hour} testID={`agp-single-hour-${first.hour}`}>
                    <Line
                      x1={first.x}
                      x2={first.x}
                      y1={first.p90Y}
                      y2={first.p10Y}
                      stroke={COLORS.outer}
                      strokeWidth={9}
                      strokeLinecap="round"
                    />
                    <Line
                      x1={first.x}
                      x2={first.x}
                      y1={first.p75Y}
                      y2={first.p25Y}
                      stroke={COLORS.inner}
                      strokeWidth={5}
                      strokeLinecap="round"
                    />
                    <Circle
                      cx={first.x}
                      cy={first.medianY}
                      r={3}
                      fill={COLORS.median}
                    />
                  </G>
                ) : (
                  <G key={first.hour}>
                    <Path
                      d={segment.outerPath!}
                      fill={COLORS.outer}
                      testID={`agp-outer-band-${first.hour}`}
                    />
                    <Path
                      d={segment.innerPath!}
                      fill={COLORS.inner}
                      testID={`agp-inner-band-${first.hour}`}
                    />
                    <Path
                      d={segment.medianPath!}
                      fill="none"
                      stroke={COLORS.median}
                      strokeWidth={2.5}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      testID={`agp-median-${first.hour}`}
                    />
                  </G>
                );
              })}
              {[thresholds.targetMinMgDl, thresholds.targetMaxMgDl].map(
                (value, index) => (
                  <Line
                    key={`target-${index}`}
                    x1={geometry.plot.left}
                    x2={geometry.plot.right}
                    y1={geometry.yAtMgDl(value)}
                    y2={geometry.yAtMgDl(value)}
                    stroke={COLORS.targetLine}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                ),
              )}
              <SvgText
                x={geometry.plot.left}
                y={13}
                fill={COLORS.axis}
                fontSize={11}>
                mg/dL
              </SvgText>
            </Svg>
          </View>
          <Text style={styles.time}>{copy.time}</Text>
          <View style={[styles.legend, rtl && styles.reverse]}>
            {[
              {
                key: 'median',
                label: copy.median,
                color: COLORS.median,
                numeric: false,
              },
              {
                key: 'inner',
                label: copy.inner,
                color: COLORS.inner,
                numeric: true,
              },
              {
                key: 'outer',
                label: copy.outer,
                color: COLORS.outer,
                numeric: true,
              },
              {
                key: 'target',
                label: `${copy.target} ${thresholds.targetMinMgDl}–${thresholds.targetMaxMgDl}`,
                color: COLORS.targetLine,
                numeric: false,
              },
            ].map(item => (
              <View
                key={item.key}
                style={[styles.legendItem, rtl && styles.reverse]}>
                <View style={[styles.swatch, {backgroundColor: item.color}]} />
                <Text
                  style={[
                    styles.legendText,
                    item.numeric ? styles.numeric : rtl && styles.rtl,
                  ]}
                  testID={`agp-legend-${item.key}`}>
                  {rtl ? isolateNumericRuns(item.label) : item.label}
                </Text>
              </View>
            ))}
          </View>
          <Text
            style={[styles.caption, rtl && styles.rtl]}
            testID="agp-profile-chart-caption">
            {rtl ? isolateNumericRuns(copy.caption) : copy.caption}
          </Text>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: productUiTokens.colors.surface,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: productUiTokens.colors.border,
    gap: 8,
  },
  plot: {width: '100%', overflow: 'hidden', direction: 'ltr'},
  time: {textAlign: 'center', fontSize: 11, color: COLORS.axis},
  legend: {flexDirection: 'row', flexWrap: 'wrap', gap: 12},
  legendItem: {flexDirection: 'row', alignItems: 'center', gap: 5},
  swatch: {width: 12, height: 8, borderRadius: 2},
  legendText: {fontSize: 12, color: productUiTokens.colors.textMuted},
  numeric: {writingDirection: 'ltr', textAlign: 'left'},
  caption: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  reverse: {flexDirection: 'row-reverse'},
  rtl: {textAlign: 'right', writingDirection: 'rtl'},
});
