import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {G, Line, Text as SvgText} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import type {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import type {ThemeType} from 'app/types/theme';
import {getChartPalette} from '../chartPalette';
import {
  buildMiniBasalSegments,
  basalChartStatus,
  emptyMiniChartText,
  buildMiniLoadSegments,
  formatMiniTime,
  formatMiniValue,
  niceMiniAxis,
  resolveMiniDomain,
  resolveMiniLoadSamples,
  type MiniChartProps,
  type ChartDataAvailability,
} from '../miniChartData';
import {BasalOverlayMarks, LoadOverlayMarks} from './OverlayMarks';

type Props = MiniChartProps & {
  insulinData?: InsulinDataEntry[] | undefined;
  basalProfileData?: BasalProfile | undefined;
  dataAvailability?: ChartDataAvailability | undefined;
};

const COPY = {
  en: {
    title: 'Insulin and active carbs',
    basal: 'Basal · U/hr',
    iob: 'Active insulin · U',
    cob: 'Active carbs · g',
    scales: 'Each series has its own scale. Compare timing, not line heights.',
    basalKey:
      'Solid step: temporary / suspended. Dashed step: scheduled profile.',
    range: 'Scale',
    noData: 'No data in this range',
    empty: 'No basal, active insulin or active carbs data in this time range.',
    incomplete: 'Some data could not be loaded. Refresh the day to try again.',
  },
  he: {
    title: 'אינסולין ופחמימות פעילות',
    basal: 'בזאל · U/hr',
    iob: 'אינסולין פעיל · U',
    cob: 'פחמימות פעילות · g',
    scales: 'לכל סדרה סולם משלה. משווים את הזמנים, לא את גובה הקווים.',
    basalKey: 'מדרגה רציפה: בזאל זמני / השהיה. מקווקוות: פרופיל מתוכנן.',
    range: 'סולם',
    noData: 'אין נתונים בטווח הזה',
    empty: 'אין נתוני בזאל, אינסולין פעיל או פחמימות פעילות בטווח הזה.',
    incomplete: 'חלק מהנתונים לא נטענו. אפשר לרענן את היום כדי לנסות שוב.',
  },
} as const;

/** One time plot; labelled independent scales keep rates, units and grams distinct. */
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
  } = props;
  const theme = useTheme();
  const palette = getChartPalette(theme);
  const styles = useMemo(() => createStyles(theme), [theme]);
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
  const iob = useMemo(
    () => buildMiniLoadSegments(samples, domain, 'iob'),
    [samples, domain],
  );
  const cob = useMemo(
    () => buildMiniLoadSegments(samples, domain, 'cob'),
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
    {key: 'basal', title: copy.basal, symbol: '┏━', hasData: basal.length > 0},
    {key: 'iob', title: copy.iob, symbol: '━', hasData: iob.length > 0},
    {key: 'cob', title: copy.cob, symbol: '┄┄', hasData: cob.length > 0},
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
  const svgHeight = Math.max(150, Math.min(240, height));
  const plotHeight = svgHeight - 34;
  const x = (time: number) =>
    ((time - +domain[0]) / (+domain[1] - +domain[0])) * plotWidth;
  const scale = (range: [number, number]) => (value: number) =>
    plotHeight - ((value - range[0]) / (range[1] - range[0])) * plotHeight;
  const cursorVisible =
    cursorTimeMs != null &&
    Number.isFinite(cursorTimeMs) &&
    cursorTimeMs >= +domain[0] &&
    cursorTimeMs <= +domain[1];
  return (
    <View testID={testID} style={[styles.shell, {width}]}>
      <Text style={[styles.title, rtl && styles.rtl]}>{copy.title}</Text>
      <View style={[styles.legend, rtl && styles.rowReverse]}>
        {series.map(item => (
          <View key={item.key} style={styles.scaleCard}>
            <Text
              style={[
                styles.seriesTitle,
                {color: palette[item.key]},
                rtl && styles.rtl,
              ]}>{`${item.symbol} ${item.title}`}</Text>
            <Text style={[styles.scale, rtl && styles.rtl]}>
              {item.hasData
                ? `${copy.range}: ${axes[item.key].domain
                    .map(formatMiniValue)
                    .join(' – ')}`
                : emptyMiniChartText(
                    locale,
                    sourceStatuses[item.key],
                    copy.noData,
                  )}
            </Text>
          </View>
        ))}
      </View>
      {hasData ? (
        <>
          <Text style={[styles.hint, rtl && styles.rtl]}>{copy.scales}</Text>
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
              <BasalOverlayMarks
                segments={basal}
                x={x}
                y={scale(axes.basal.domain)}
                color={palette.basal}
              />
              <LoadOverlayMarks
                kind="iob"
                segments={iob}
                x={x}
                y={scale(axes.iob.domain)}
                color={palette.iob}
              />
              <LoadOverlayMarks
                kind="cob"
                segments={cob}
                x={x}
                y={scale(axes.cob.domain)}
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
              {[0, 0.5, 1].map(fraction => (
                <SvgText
                  key={fraction}
                  x={fraction * plotWidth}
                  y={plotHeight + 18}
                  textAnchor={
                    fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'
                  }
                  fill={palette.mutedText}
                  fontSize={theme.typography.size.xs}
                  fontFamily={theme.fontFamily}>
                  {formatMiniTime(
                    +domain[0] + fraction * (+domain[1] - +domain[0]),
                  )}
                </SvgText>
              ))}
            </G>
          </Svg>
          {basal.length > 0 ? (
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
