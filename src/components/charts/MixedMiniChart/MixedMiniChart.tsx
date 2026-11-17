import React, {useCallback, useMemo} from 'react';
import {StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import Svg, {G, Line, Text as SvgText} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import type {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import type {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {getChartPalette} from '../chartPalette';
import {
  buildMiniBasalSegments,
  basalChartStatus,
  emptyMiniChartText,
  buildMiniLoadSegmentsByKind,
  formatMiniTime,
  formatMiniValue,
  findMiniLoadSample,
  niceMiniAxis,
  resolveMiniDomain,
  resolveMiniLoadSamples,
  type MiniChartProps,
  type ChartDataAvailability,
} from '../miniChartData';
import {BasalOverlayMarks, LoadOverlayMarks} from './OverlayMarks';

type Props = MiniChartProps & {
  showTimeLabels?: boolean;
  insulinData?: InsulinDataEntry[] | undefined;
  basalProfileData?: BasalProfile | undefined;
  dataAvailability?: ChartDataAvailability | undefined;
};

const COPY = {
  en: {
    title: 'Insulin and active carbs',
    basal: 'Basal · U/hr',
    basalShort: 'Basal',
    iob: 'Active insulin · U',
    cob: 'Active carbs · g',
    scales: 'Each series has its own scale. Compare timing, not line heights.',
    basalKey:
      'Solid step: temporary / suspended. Dashed step: scheduled profile.',
    range: 'Scale',
    noData: 'No data in this range',
    noDataShort: 'No data',
    unavailableShort: 'Unavailable',
    staleShort: 'No saved data',
    empty: 'No basal, active insulin or active carbs data in this time range.',
    incomplete: 'Some data could not be loaded. Refresh the day to try again.',
  },
  he: {
    title: 'אינסולין ופחמימות פעילות',
    basal: 'בזאל · U/hr',
    basalShort: 'בזאל',
    iob: 'אינסולין פעיל · U',
    cob: 'פחמימות פעילות · g',
    scales: 'לכל סדרה סולם משלה. משווים את הזמנים, לא את גובה הקווים.',
    basalKey: 'מדרגה רציפה: בזאל זמני / השהיה. מקווקוות: פרופיל מתוכנן.',
    range: 'סולם',
    noData: 'אין נתונים בטווח הזה',
    noDataShort: 'אין נתונים',
    unavailableShort: 'לא נטען',
    staleShort: 'אין מידע שמור',
    empty: 'אין נתוני בזאל, אינסולין פעיל או פחמימות פעילות בטווח הזה.',
    incomplete: 'חלק מהנתונים לא נטענו. אפשר לרענן את היום כדי לנסות שוב.',
  },
} as const;

/**
 * One time plot with independent scales for rates, units and grams.
 * Compact height includes its three-column legend; font scaling grows the
 * legend while retaining the data plot's height.
 */
const MixedMiniChart: React.FC<Props> = props => {
  const {
    testID,
    height,
    width,
    bgSamples,
    loadSamples,
    dataAvailability,
    insulinData,
    basalProfileData,
    cursorTimeMs,
    locale = 'en',
    xDomain,
    compact = false,
    showTimeLabels = true,
  } = props;
  const theme = useTheme();
  const palette = getChartPalette(theme);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const fontScale = Math.max(1, useWindowDimensions().fontScale);
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const samples = useMemo(
    () => resolveMiniLoadSamples(bgSamples, loadSamples),
    [bgSamples, loadSamples],
  );
  const domain = useMemo(
    () => resolveMiniDomain(samples.length ? samples : bgSamples, xDomain),
    [samples, bgSamples, xDomain],
  );
  const basal = useMemo(
    () => buildMiniBasalSegments(basalProfileData, insulinData, domain),
    [basalProfileData, insulinData, domain],
  );
  const {iob, cob} = useMemo(
    () => buildMiniLoadSegmentsByKind(samples, domain),
    [samples, domain],
  );
  const axes = useMemo(
    () => ({
      basal: niceMiniAxis([0, Math.max(0.5, ...basal.map(item => item.rate))]),
      iob: niceMiniAxis([
        Math.min(0, ...iob.flat().map(point => point.y)),
        Math.max(0.5, ...iob.flat().map(point => point.y)),
      ]),
      cob: niceMiniAxis([0, Math.max(1, ...cob.flat().map(point => point.y))]),
    }),
    [basal, iob, cob],
  );
  const series = [
    {
      key: 'basal',
      title: copy.basal,
      shortTitle: copy.basalShort,
      unit: 'U/hr',
      symbol: '┏━',
      hasData: basal.length > 0,
    },
    {
      key: 'iob',
      title: copy.iob,
      shortTitle: 'IOB',
      unit: 'U',
      symbol: '━',
      hasData: iob.length > 0,
    },
    {
      key: 'cob',
      title: copy.cob,
      shortTitle: 'COB',
      unit: 'g',
      symbol: '┄┄',
      hasData: cob.length > 0,
    },
  ] as const;
  const hasData = series.some(item => item.hasData);
  const sourceStatuses = {
    basal: basalChartStatus(dataAvailability),
    iob: dataAvailability?.deviceStatus ?? 'available',
    cob: dataAvailability?.deviceStatus ?? 'available',
  } as const;
  const complete = Object.values(sourceStatuses).every(
    status => status === 'available',
  );
  const left = props.margin?.left ?? 44;
  const right = props.margin?.right ?? 16;
  const plotWidth = Math.max(1, width - left - right);
  const baseLegendHeight =
    styles.compactValue.lineHeight * 3 + theme.spacing.xs * 2;
  const wrapCompactText = compact && fontScale > 1;
  const compactTextLines = wrapCompactText ? 2 : 1;
  const compactTextHeight = Math.ceil(
    styles.compactValue.lineHeight * fontScale * compactTextLines,
  );
  const compactScaleHeight = Math.ceil(
    styles.compactValue.lineHeight *
      fontScale *
      (width < 300 || wrapCompactText ? 2 : 1),
  );
  const legendHeight =
    compactTextHeight * 2 + compactScaleHeight + theme.spacing.xs * 2;
  const compactHeight = Math.max(128, height) + legendHeight - baseLegendHeight;
  const svgHeight = compact
    ? compactHeight - legendHeight
    : Math.max(150, Math.min(240, height));
  const plotHeight = svgHeight - (showTimeLabels ? 34 : 12);
  const x = useCallback(
    (time: number) =>
      ((time - +domain[0]) / (+domain[1] - +domain[0])) * plotWidth,
    [domain, plotWidth],
  );
  const scales = useMemo(() => {
    const scale = (range: [number, number]) => (value: number) =>
      plotHeight - ((value - range[0]) / (range[1] - range[0])) * plotHeight;
    return {
      basal: scale(axes.basal.domain),
      iob: scale(axes.iob.domain),
      cob: scale(axes.cob.domain),
    };
  }, [axes, plotHeight]);
  const cursorVisible =
    cursorTimeMs != null &&
    Number.isFinite(cursorTimeMs) &&
    cursorTimeMs >= +domain[0] &&
    cursorTimeMs <= +domain[1];
  const loadPoints = useMemo(
    () => ({iob: compact ? iob.flat() : [], cob: compact ? cob.flat() : []}),
    [compact, iob, cob],
  );
  const latestLoadTime = useMemo(
    () =>
      compact
        ? samples.reduce(
            (latest, sample) =>
              sample.date >= +domain[0] && sample.date <= +domain[1]
                ? Math.max(latest, sample.date)
                : latest,
            Number.NEGATIVE_INFINITY,
          )
        : Number.NEGATIVE_INFINITY,
    [compact, samples, domain],
  );
  const selectedLoad = useMemo(
    () =>
      compact &&
      (cursorTimeMs == null ||
        (Number.isFinite(cursorTimeMs) &&
          cursorTimeMs >= +domain[0] &&
          cursorTimeMs <= +domain[1]))
        ? findMiniLoadSample(samples, cursorTimeMs ?? latestLoadTime, domain)
        : null,
    [compact, samples, cursorTimeMs, latestLoadTime, domain],
  );
  const latestBasalTime = useMemo(
    () =>
      Math.min(
        +domain[1],
        Math.max(
          +domain[0],
          ...bgSamples.map(sample => sample.date).filter(Number.isFinite),
        ),
      ),
    [bgSamples, domain],
  );
  const selectedBasal = useMemo(() => {
    if (!compact) {
      return undefined;
    }
    const time = cursorTimeMs ?? latestBasalTime;
    return basal.find(
      segment =>
        time >= segment.startMs &&
        (time < segment.endMs ||
          (time === +domain[1] && time === segment.endMs)),
    );
  }, [compact, basal, cursorTimeMs, latestBasalTime, domain]);
  const selectedIob = selectedLoad
    ? loadPoints.iob.find(point => point.x === selectedLoad.date)?.y
    : undefined;
  const selectedCob = selectedLoad
    ? loadPoints.cob.find(point => point.x === selectedLoad.date)?.y
    : undefined;
  const readout = {
    basal: selectedBasal ? formatMiniValue(selectedBasal.rate) : '—',
    iob: selectedIob == null ? '—' : formatMiniValue(selectedIob),
    cob: selectedCob == null ? '—' : formatMiniValue(selectedCob),
  };
  return (
    <View
      testID={testID}
      style={[
        styles.shell,
        compact && styles.compactShell,
        {width},
        compact && hasData ? {height: compactHeight} : undefined,
      ]}>
      {!compact ? (
        <Text style={[styles.title, rtl && styles.rtl]}>{copy.title}</Text>
      ) : null}
      <View
        testID={testID ? `${testID}.scales` : undefined}
        style={[
          styles.legend,
          compact && styles.compactLegend,
          compact ? {height: legendHeight} : undefined,
          rtl && styles.rowReverse,
        ]}>
        {series.map(item => (
          <View
            key={item.key}
            testID={testID ? `${testID}.metric-${item.key}` : undefined}
            style={[
              styles.scaleCard,
              compact && styles.compactScaleCard,
              compact && {backgroundColor: addOpacity(palette[item.key], 0.08)},
            ]}>
            {compact ? (
              <View
                style={[
                  styles.compactTitleRow,
                  {minHeight: compactTextHeight},
                ]}>
                <View
                  testID={testID ? `${testID}.swatch-${item.key}` : undefined}
                  accessible={false}
                  style={styles.swatch}>
                  {Array.from(
                    {
                      length:
                        item.key === 'iob' ? 1 : item.key === 'basal' ? 2 : 3,
                    },
                    (_, index) => (
                      <View
                        key={index}
                        style={[
                          styles.swatchMark,
                          {backgroundColor: palette[item.key]},
                        ]}
                      />
                    ),
                  )}
                </View>
                <Text
                  style={[
                    styles.seriesTitle,
                    styles.compactTitle,
                    {color: palette[item.key]},
                  ]}
                  accessibilityLabel={item.title}>
                  {item.shortTitle}
                </Text>
              </View>
            ) : (
              <Text
                style={[
                  styles.seriesTitle,
                  {color: palette[item.key]},
                  rtl && styles.rtl,
                ]}
                accessibilityLabel={item.title}>
                {`${item.symbol} ${item.title}`}
              </Text>
            )}
            {compact ? (
              <Text
                testID={testID ? `${testID}.value-${item.key}` : undefined}
                style={[
                  styles.compactValue,
                  {color: palette[item.key], minHeight: compactTextHeight},
                ]}
                {...(!wrapCompactText ? {numberOfLines: 1} : {})}>
                {readout[item.key]}
                <Text style={styles.compactUnit}>{` ${item.unit}`}</Text>
              </Text>
            ) : null}
            {compact && item.hasData ? (
              <View
                style={[
                  styles.compactScaleRow,
                  rtl && styles.rowReverse,
                  {minHeight: compactScaleHeight},
                ]}>
                <Text
                  style={[
                    styles.scale,
                    styles.compactScaleCaption,
                    rtl && styles.rtl,
                  ]}>
                  {copy.range}
                </Text>
                <Text
                  testID={testID ? `${testID}.scale-${item.key}` : undefined}
                  style={[styles.scale, styles.compactScale]}
                  accessibilityLabel={`${copy.range}: ${axes[item.key].domain
                    .map(formatMiniValue)
                    .join(' – ')}`}>
                  {axes[item.key].domain.map(formatMiniValue).join(' – ')}
                </Text>
              </View>
            ) : (
              <Text
                style={[
                  styles.scale,
                  rtl && styles.rtl,
                  compact && styles.compactScale,
                ]}
                {...(compact && !wrapCompactText ? {numberOfLines: 1} : {})}>
                {item.hasData
                  ? `${compact ? '' : `${copy.range}: `}${axes[item.key].domain
                      .map(formatMiniValue)
                      .join(' – ')}`
                  : compact
                  ? sourceStatuses[item.key] === 'unavailable'
                    ? copy.unavailableShort
                    : sourceStatuses[item.key] === 'stale'
                    ? copy.staleShort
                    : copy.noDataShort
                  : emptyMiniChartText(
                      locale,
                      sourceStatuses[item.key],
                      copy.noData,
                    )}
              </Text>
            )}
          </View>
        ))}
      </View>
      {hasData ? (
        <>
          {!compact ? (
            <Text style={[styles.hint, rtl && styles.rtl]}>{copy.scales}</Text>
          ) : null}
          <Svg
            width={width}
            height={svgHeight}
            viewBox={`0 0 ${width} ${svgHeight}`}>
            <G x={left} y={8}>
              {[0, 0.5, 1].map(fraction => (
                <Line
                  key={fraction}
                  x1={0}
                  x2={plotWidth}
                  y1={fraction * plotHeight}
                  y2={fraction * plotHeight}
                  stroke={palette.grid}
                  strokeWidth={1}
                />
              ))}
              {compact && axes.iob.domain[0] < 0 && axes.iob.domain[1] > 0 ? (
                <Line
                  testID="mixed-iob-zero-reference"
                  x1={0}
                  x2={plotWidth}
                  y1={scales.iob(0)}
                  y2={scales.iob(0)}
                  stroke={palette.iob}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.5}
                />
              ) : null}
              <BasalOverlayMarks
                segments={basal}
                x={x}
                y={scales.basal}
                color={palette.basal}
              />
              <LoadOverlayMarks
                kind="iob"
                segments={iob}
                x={x}
                y={scales.iob}
                color={palette.iob}
              />
              <LoadOverlayMarks
                kind="cob"
                segments={cob}
                x={x}
                y={scales.cob}
                color={palette.cob}
              />
              {cursorVisible ? (
                <Line
                  testID="mixed-time-cursor"
                  x1={x(cursorTimeMs!)}
                  x2={x(cursorTimeMs!)}
                  y1={0}
                  y2={plotHeight}
                  stroke={palette.selection}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              ) : null}
              {showTimeLabels
                ? [0, 0.5, 1].map(fraction => (
                    <SvgText
                      key={fraction}
                      x={fraction * plotWidth}
                      y={plotHeight + 18}
                      textAnchor={
                        fraction === 0
                          ? 'start'
                          : fraction === 1
                          ? 'end'
                          : 'middle'
                      }
                      fill={palette.mutedText}
                      fontSize={theme.typography.size.xs}
                      fontFamily={theme.fontFamily}>
                      {formatMiniTime(
                        +domain[0] + fraction * (+domain[1] - +domain[0]),
                      )}
                    </SvgText>
                  ))
                : null}
            </G>
          </Svg>
          {basal.length > 0 && !compact ? (
            <Text style={[styles.hint, rtl && styles.rtl]}>
              {copy.basalKey}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={[styles.hint, rtl && styles.rtl]}>
          {complete ? copy.empty : copy.incomplete}
        </Text>
      )}
    </View>
  );
};

const createStyles = (theme: ThemeType) =>
  StyleSheet.create({
    shell: {backgroundColor: theme.white, paddingVertical: theme.spacing.sm},
    compactShell: {paddingVertical: 0},
    compactLegend: {
      flexWrap: 'nowrap',
      gap: theme.spacing.xs,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: theme.spacing.xs,
    },
    compactScaleCard: {
      flex: 1,
      flexBasis: 0,
      minWidth: 0,
      padding: 0,
      paddingHorizontal: theme.spacing.xs,
      borderRadius: theme.borderRadius / 2,
    },
    compactTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.xs,
    },
    compactTitle: {textAlign: 'center', writingDirection: 'ltr', flexShrink: 1},
    swatch: {width: 14, flexDirection: 'row', gap: 2, flexShrink: 0},
    swatchMark: {height: 2, borderRadius: 1, flex: 1},
    compactScaleRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      alignContent: 'center',
      justifyContent: 'center',
      columnGap: theme.spacing.xs,
    },
    compactScaleCaption: {
      color: getChartPalette(theme).mutedText,
    },
    compactValue: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.sm,
      lineHeight: Math.ceil(
        theme.typography.size.xs * theme.typography.lineHeight.normal,
      ),
      fontWeight: '700',
      writingDirection: 'ltr',
      textAlign: 'center',
    },
    compactUnit: {
      fontSize: theme.typography.size.xs,
      fontWeight: '500',
    },
    compactScale: {
      writingDirection: 'ltr',
      textAlign: 'center',
      color: getChartPalette(theme).mutedText,
    },
    title: {
      color: theme.textColor,
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.sm,
      fontWeight: '700',
      paddingHorizontal: theme.spacing.md,
    },
    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
      padding: theme.spacing.sm,
    },
    scaleCard: {
      flexBasis: 112,
      flexGrow: 1,
      flexShrink: 1,
      padding: theme.spacing.sm,
      borderRadius: theme.borderRadius,
      backgroundColor: theme.secondaryColor,
    },
    seriesTitle: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.xs,
      fontWeight: '700',
      lineHeight: Math.ceil(
        theme.typography.size.xs * theme.typography.lineHeight.normal,
      ),
    },
    scale: {
      color: theme.textColor,
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.xs,
      lineHeight: Math.ceil(
        theme.typography.size.xs * theme.typography.lineHeight.normal,
      ),
    },
    hint: {
      color: getChartPalette(theme).mutedText,
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.xs,
      lineHeight: Math.ceil(
        theme.typography.size.xs * theme.typography.lineHeight.normal,
      ),
      paddingHorizontal: theme.spacing.md,
      paddingBottom: theme.spacing.xs,
    },
    rtl: {textAlign: 'right', writingDirection: 'rtl'},
    rowReverse: {flexDirection: 'row-reverse'},
  });

export default React.memo(MixedMiniChart);
