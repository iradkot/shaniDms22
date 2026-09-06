import React, {useMemo} from 'react';
import {StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import Svg, {G, Line, Text as SvgText} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import type {ThemeType} from 'app/types/theme';
import {getChartPalette} from './chartPalette';
import {
  formatMiniValue,
  emptyMiniChartText,
  niceMiniAxis,
  type MiniChartProps,
} from './miniChartData';

type Plot = {
  width: number;
  height: number;
  x: (time: number) => number;
  y: (value: number) => number;
};
type Props = Pick<
  MiniChartProps,
  | 'width'
  | 'height'
  | 'margin'
  | 'cursorTimeMs'
  | 'locale'
  | 'testID'
  | 'compact'
  | 'dataStatus'
> & {
  title: string;
  color: string;
  emptyText: string;
  hasData: boolean;
  domain: [Date, Date];
  yDomain: [number, number];
  valueText: string;
  detailText?: string | undefined;
  hint?: string | undefined;
  children: (plot: Plot) => React.ReactNode;
};

/** Native text can wrap/scale on phones without colliding inside the plot. */
export default function MiniChartLane(props: Props) {
  const {
    width,
    height,
    title,
    color,
    hasData,
    emptyText,
    domain,
    yDomain,
    valueText,
    detailText,
    hint,
    children,
    cursorTimeMs,
    locale,
    testID,
    compact = false,
    dataStatus = 'available',
  } = props;
  const theme = useTheme();
  const palette = getChartPalette(theme);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const fontScale = Math.max(1, useWindowDimensions().fontScale);
  const left = props.margin?.left ?? 44;
  const right = props.margin?.right ?? 16;
  const titleLineHeight = styles.title.lineHeight;
  const detailLineHeight = styles.detail.lineHeight;
  const baseHeaderHeight =
    theme.spacing.xs +
    titleLineHeight +
    (compact ? 0 : detailLineHeight) +
    (hint && hasData ? detailLineHeight + theme.spacing.xs : 0) +
    theme.spacing.sm;
  const headerHeight = Math.ceil(baseHeaderHeight * fontScale);
  const baseLaneHeight = compact
    ? hint
      ? 110
      : 90
    : Math.max(hint ? 124 : 110, height);
  const laneHeight = hasData
    ? baseLaneHeight + headerHeight - baseHeaderHeight
    : Math.ceil((compact ? 64 : 80) * fontScale);
  const svgHeight = laneHeight - headerHeight;
  const plotWidth = Math.max(1, width - left - right);
  const plotHeight = Math.max(1, svgHeight - 16);
  const x = (time: number) =>
    ((time - +domain[0]) / (+domain[1] - +domain[0])) * plotWidth;
  const axis = niceMiniAxis(yDomain);
  const y = (value: number) =>
    plotHeight -
    ((value - axis.domain[0]) / (axis.domain[1] - axis.domain[0])) * plotHeight;
  const ticks = axis.ticks;
  const cursorVisible =
    cursorTimeMs != null &&
    Number.isFinite(cursorTimeMs) &&
    cursorTimeMs >= +domain[0] &&
    cursorTimeMs <= +domain[1];
  const rtl = locale === 'he';
  return (
    <View
      testID={testID}
      style={{
        width,
        height: hasData ? laneHeight : undefined,
        minHeight: hasData ? undefined : laneHeight,
        backgroundColor: palette.surface,
      }}>
      <View
        style={[styles.header, {height: headerHeight, paddingRight: right}]}>
        <View style={[styles.headingRow, rtl ? styles.rowRtl : styles.rowLtr]}>
          <Text
            style={[
              styles.title,
              {color},
              rtl ? styles.textRtl : styles.textLtr,
            ]}>
            {title}
          </Text>
          {hasData ? (
            <View style={styles.readout}>
              <Text style={[styles.value, {color: palette.text}]}>
                {valueText}
              </Text>
              {detailText && !compact ? (
                <Text style={[styles.detail, {color: palette.mutedText}]}>
                  {detailText}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        {hint && hasData ? (
          <Text
            style={[
              styles.hint,
              {color: palette.mutedText},
              rtl ? styles.textRtl : styles.textLtr,
            ]}>
            {hint}
          </Text>
        ) : null}
      </View>
      {!hasData ? (
        <Text
          style={[
            styles.empty,
            {color: palette.mutedText},
            rtl ? styles.textRtl : styles.textLtr,
          ]}>
          {emptyMiniChartText(locale, dataStatus, emptyText)}
        </Text>
      ) : (
        <Svg
          width={width}
          height={svgHeight}
          viewBox={`0 0 ${width} ${svgHeight}`}>
          <G x={left} y={6}>
            {ticks.map(value => (
              <G key={value}>
                <Line
                  x1={0}
                  y1={y(value)}
                  x2={plotWidth}
                  y2={y(value)}
                  stroke={palette.grid}
                  strokeWidth={1}
                />
                <SvgText
                  x={-8}
                  y={y(value) + 4}
                  fontSize={theme.typography.size.xs}
                  fontFamily={theme.fontFamily}
                  fill={palette.mutedText}
                  textAnchor="end">
                  {formatMiniValue(value)}
                </SvgText>
              </G>
            ))}
            {yDomain[0] < 0 && yDomain[1] > 0 ? (
              <Line
                x1={0}
                y1={y(0)}
                x2={plotWidth}
                y2={y(0)}
                stroke={palette.mutedText}
                strokeDasharray="3 3"
              />
            ) : null}
            {children({width: plotWidth, height: plotHeight, x, y})}
            {cursorVisible ? (
              <Line
                x1={x(cursorTimeMs!)}
                y1={0}
                x2={x(cursorTimeMs!)}
                y2={plotHeight}
                stroke={palette.selection}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            ) : null}
          </G>
        </Svg>
      )}
    </View>
  );
}

const createStyles = (theme: ThemeType) =>
  StyleSheet.create({
    header: {paddingTop: theme.spacing.xs, paddingLeft: theme.spacing.sm},
    rowRtl: {flexDirection: 'row-reverse'},
    rowLtr: {flexDirection: 'row'},
    textRtl: {textAlign: 'right'},
    textLtr: {textAlign: 'left'},
    headingRow: {alignItems: 'flex-start', gap: theme.spacing.sm},
    title: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.sm,
      lineHeight: Math.ceil(
        theme.typography.size.sm * theme.typography.lineHeight.tight,
      ),
      fontWeight: '700',
      flex: 1,
      flexShrink: 1,
    },
    readout: {alignItems: 'flex-end', flexShrink: 0},
    value: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.sm,
      lineHeight: Math.ceil(
        theme.typography.size.sm * theme.typography.lineHeight.tight,
      ),
      fontWeight: '700',
      writingDirection: 'ltr',
    },
    detail: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.xs,
      lineHeight: Math.ceil(
        theme.typography.size.xs * theme.typography.lineHeight.tight,
      ),
      writingDirection: 'ltr',
    },
    hint: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.xs,
      lineHeight: Math.ceil(
        theme.typography.size.xs * theme.typography.lineHeight.tight,
      ),
      marginTop: theme.spacing.xs,
    },
    empty: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.xs,
      lineHeight: Math.ceil(
        theme.typography.size.xs * theme.typography.lineHeight.normal,
      ),
      paddingHorizontal: theme.spacing.md,
      paddingBottom: theme.spacing.sm,
    },
  });
