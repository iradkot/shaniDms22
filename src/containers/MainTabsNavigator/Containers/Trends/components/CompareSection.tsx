// /Trends/components/CompareSection.tsx
import React, {useMemo, useState} from 'react';
import {
  View,
  Button,
  ActivityIndicator,
  Dimensions,
  Text,
  DimensionValue,
} from 'react-native';
import {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {
  CompareBox,
  ExplanationText,
  ComparisonTitle,
  ComparisonSubtitle,
  ComparisonDateRange,
} from '../styles/Trends.styles';
import {calculateTrendsMetrics} from '../utils/trendsCalculations';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {Lang, t as tr} from 'app/i18n/translations';
import {BgSample} from 'app/types/day_bgs.types';
import {useAGPData} from 'app/components/charts/AGPGraph/hooks/useAGPData';
import AGPChart from 'app/components/charts/AGPGraph/components/AGPChart';
import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';
import {addOpacity} from 'app/style/styling.utils';
import {AgpComparisonInsightsPanel} from './AgpComparisonInsightsPanel';
import {useAgpComparisonInsights} from '../hooks/useAgpComparisonInsights';

interface CompareSectionProps {
  showComparison: boolean;
  comparing: boolean;
  handleCompare: () => void;
  rangeDays: number;
  currentDateRange: {start: Date; end: Date};
  currentBgData: BgSample[];
  previousBgData: BgSample[];
  currentMetrics: ReturnType<typeof calculateTrendsMetrics>;
  previousMetrics: ReturnType<typeof calculateTrendsMetrics> | null;
  comparisonDateRange: {start: Date; end: Date} | null;
  changeComparisonPeriod: (direction: 'back' | 'forward') => void;
  hideComparison: () => void;
}

const ComparisonAgpChart: React.FC<{
  title: string;
  periodRange: {start: Date; end: Date};
  requestedDays: number;
  bgData: BgSample[];
  language: Lang;
  activeTimeOfDay: number | null;
  onActiveTimeOfDayChange: (timeOfDay: number | null) => void;
}> = ({
  title,
  periodRange,
  requestedDays,
  bgData,
  language,
  activeTimeOfDay,
  onActiveTimeOfDayChange,
}) => {
  const theme = useTheme() as ThemeType;
  const {agpData, isLoading, error} = useAGPData(bgData);

  const chartWidth = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    return Math.max(260, Math.floor(screenWidth - theme.spacing.lg * 4));
  }, [theme.spacing.lg]);

  const muted = addOpacity(theme.textColor, 0.68);
  const periodLabel = formatDateRange(periodRange, language);

  return (
    <View
      style={{
        backgroundColor: theme.white,
        borderColor: addOpacity(theme.textColor, 0.12),
        borderRadius: 6,
        borderWidth: 1,
        marginBottom: theme.spacing.sm + 2,
        padding: theme.spacing.sm + 2,
      }}>
      <Text style={{color: theme.textColor, fontSize: 15, fontWeight: '700'}}>
        {title}
      </Text>
      <Text
        style={{
          color: muted,
          fontSize: 12,
          marginBottom: theme.spacing.xs + 1,
        }}>
        {periodLabel} · {requestedDaysLabel(language, requestedDays)}
      </Text>

      {isLoading ? (
        <ActivityIndicator size="small" color={theme.accentColor} />
      ) : error || !agpData ? (
        <Text style={{color: muted}}>No AGP data for this period.</Text>
      ) : (
        <>
          <AGPChart
            agpData={agpData}
            width={chartWidth}
            height={190}
            targetRange={cgmRange.TARGET}
            activeTimeOfDay={activeTimeOfDay}
            onActiveTimeOfDayChange={onActiveTimeOfDayChange}
            enableTouch={false}
          />
          <Text style={{color: muted, fontSize: 12, textAlign: 'center'}}>
            {dataCoverageLabel(
              language,
              agpData.statistics.daysWithData,
              requestedDays,
              agpData.statistics.totalReadings,
            )}
          </Text>
        </>
      )}
    </View>
  );
};

type ComparisonCell = {
  value: string;
  numeric?: number;
};

type ComparisonMetricRow = {
  key: string;
  label: string;
  current: ComparisonCell;
  previous: ComparisonCell;
  lowerIsBetter?: boolean;
};

export const CompareSection: React.FC<CompareSectionProps> = ({
  showComparison,
  comparing,
  handleCompare,
  rangeDays,
  currentDateRange,
  currentBgData,
  previousBgData,
  currentMetrics,
  previousMetrics,
  comparisonDateRange,
  changeComparisonPeriod,
  hideComparison,
}) => {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();
  const [sharedAgpTimeOfDay, setSharedAgpTimeOfDay] = useState<number | null>(
    null,
  );

  const comparisonRows = useMemo(
    () =>
      previousMetrics
        ? buildComparisonRows({
            language,
            rangeDays,
            currentBgData,
            previousBgData,
            currentMetrics,
            previousMetrics,
          })
        : [],
    [
      currentBgData,
      currentMetrics,
      language,
      previousBgData,
      previousMetrics,
      rangeDays,
    ],
  );
  const agpInsights = useAgpComparisonInsights({
    currentDateRange,
    comparisonDateRange,
    currentBgData,
    previousBgData,
  });

  if (!currentMetrics.dailyDetails.length) return null;

  return (
    <View style={{marginVertical: theme.spacing.sm + 2}}>
      {!showComparison && !comparing && (
        <Button
          title={tr(language, 'trends.comparePrevious')}
          onPress={handleCompare}
          color={theme.accentColor}
        />
      )}
      {comparing && (
        <ActivityIndicator size="large" color={theme.accentColor} />
      )}

      {showComparison && previousMetrics && comparisonDateRange && (
        <CompareBox>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
            <ComparisonTitle>
              {tr(language, 'trends.comparison')}
            </ComparisonTitle>
            <Button
              title={tr(language, 'trends.hide')}
              onPress={hideComparison}
              color={theme.belowRangeColor}
            />
          </View>
          <ComparisonSubtitle>
            {comparisonTitle(language, rangeDays)}
          </ComparisonSubtitle>
          <ComparisonDateRange>
            {comparisonDatesLabel(
              language,
              currentDateRange,
              comparisonDateRange,
            )}
          </ComparisonDateRange>

          <AgpComparisonInsightsPanel
            canRun={agpInsights.canRun}
            status={agpInsights.status}
            progress={agpInsights.progress}
            error={agpInsights.error}
            result={agpInsights.result}
            onRun={agpInsights.run}
          />

          <View style={{marginBottom: theme.spacing.sm + 2}}>
            <ComparisonAgpChart
              title={language === 'he' ? 'AGP נוכחי' : 'Current AGP'}
              periodRange={currentDateRange}
              requestedDays={rangeDays}
              bgData={currentBgData}
              language={language}
              activeTimeOfDay={sharedAgpTimeOfDay}
              onActiveTimeOfDayChange={setSharedAgpTimeOfDay}
            />
            <ComparisonAgpChart
              title={
                language === 'he'
                  ? 'AGP של התקופה הקודמת'
                  : 'Previous-period AGP'
              }
              periodRange={comparisonDateRange}
              requestedDays={rangeDays}
              bgData={previousBgData}
              language={language}
              activeTimeOfDay={sharedAgpTimeOfDay}
              onActiveTimeOfDayChange={setSharedAgpTimeOfDay}
            />
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-around',
              marginBottom: theme.spacing.sm + 2,
            }}>
            <Button
              title={tr(language, 'trends.shiftBack')}
              onPress={() => changeComparisonPeriod('back')}
            />
            <Button
              title={tr(language, 'trends.shiftForward')}
              onPress={() => changeComparisonPeriod('forward')}
            />
          </View>

          <Text
            style={{
              color: theme.textColor,
              fontSize: 16,
              fontWeight: '700',
              marginBottom: theme.spacing.xs + 1,
            }}>
            {language === 'he' ? 'טבלת השוואה' : 'Comparison table'}
          </Text>

          <ComparisonTable rows={comparisonRows} language={language} />

          <ExplanationText style={{marginTop: theme.spacing.lg - 1}}>
            {tr(language, 'trends.compareInsight')}
          </ExplanationText>
        </CompareBox>
      )}
    </View>
  );
};

const ComparisonTable: React.FC<{
  rows: ComparisonMetricRow[];
  language: Lang;
}> = ({rows, language}) => {
  const theme = useTheme() as ThemeType;
  const isRTL = language === 'he';
  const borderColor = addOpacity(theme.textColor, 0.14);
  const headerBackground = addOpacity(theme.textColor, 0.06);

  const headerLabels =
    language === 'he'
      ? ['מדד', 'נוכחי', 'קודם', 'שינוי']
      : ['Metric', 'Current', 'Previous', 'Change'];

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor,
        borderRadius: 6,
        overflow: 'hidden',
        backgroundColor: theme.white,
      }}>
      <View
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          backgroundColor: headerBackground,
          borderBottomWidth: 1,
          borderBottomColor: borderColor,
        }}>
        {headerLabels.map((label, index) => (
          <TableCell
            key={label}
            text={label}
            width={columnWidth(index)}
            bold
            isRTL={isRTL}
          />
        ))}
      </View>

      {rows.map(row => (
        <ComparisonTableRow
          key={row.key}
          row={row}
          isRTL={isRTL}
          borderColor={borderColor}
        />
      ))}
    </View>
  );
};

const ComparisonTableRow: React.FC<{
  row: ComparisonMetricRow;
  isRTL: boolean;
  borderColor: string;
}> = ({row, isRTL, borderColor}) => {
  const theme = useTheme() as ThemeType;
  const diff =
    row.current.numeric !== undefined && row.previous.numeric !== undefined
      ? row.current.numeric - row.previous.numeric
      : null;
  const isImprovement =
    diff === null || Math.abs(diff) < 0.05
      ? null
      : row.lowerIsBetter
      ? diff < 0
      : diff > 0;

  const changeColor =
    isImprovement === null
      ? addOpacity(theme.textColor, 0.7)
      : isImprovement
      ? theme.inRangeColor
      : theme.belowRangeColor;

  const values = [
    row.label,
    row.current.value,
    row.previous.value,
    diff === null ? '-' : formatSigned(diff),
  ];

  return (
    <View
      style={{
        flexDirection: isRTL ? 'row-reverse' : 'row',
        borderBottomWidth: 1,
        borderBottomColor: borderColor,
      }}>
      {values.map((value, index) => (
        <TableCell
          key={`${row.key}-${index}`}
          text={value}
          width={columnWidth(index)}
          color={index === 3 ? changeColor : undefined}
          bold={index === 0}
          isRTL={isRTL}
        />
      ))}
    </View>
  );
};

const TableCell: React.FC<{
  text: string;
  width: DimensionValue;
  bold?: boolean;
  color?: string;
  isRTL: boolean;
}> = ({text, width, bold = false, color, isRTL}) => {
  const theme = useTheme() as ThemeType;

  return (
    <View
      style={{
        width,
        paddingHorizontal: theme.spacing.xs + 2,
        paddingVertical: theme.spacing.sm,
      }}>
      <Text
        style={{
          color: color ?? theme.textColor,
          fontSize: 12,
          fontWeight: bold ? '700' : '500',
          textAlign: isRTL ? 'right' : 'left',
        }}>
        {text}
      </Text>
    </View>
  );
};

function columnWidth(index: number): DimensionValue {
  const widths: DimensionValue[] = ['34%', '25%', '25%', '16%'];
  return widths[index] ?? '25%';
}

function comparisonTitle(language: string, days: number) {
  if (language === 'he') {
    return `השוואה בין שני טווחים של ${days} ימים`;
  }

  return `Comparing two ${days}-day periods`;
}

function comparisonDatesLabel(
  language: string,
  current: {start: Date; end: Date},
  previous: {start: Date; end: Date},
) {
  if (language === 'he') {
    return `נוכחי: ${formatDateRange(
      current,
      language,
    )}\nקודם: ${formatDateRange(previous, language)}`;
  }

  return `Current: ${formatDateRange(
    current,
    language,
  )}\nPrevious: ${formatDateRange(previous, language)}`;
}

function formatDateRange(range: {start: Date; end: Date}, language: string) {
  return `${formatShortDate(range.start, language)} - ${formatShortDate(
    range.end,
    language,
  )}`;
}

function formatShortDate(date: Date, language: string) {
  return date.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function requestedDaysLabel(language: string, days: number) {
  if (language === 'he') {
    return `נבחרו ${days} ימים`;
  }

  return `Selected ${days} ${days === 1 ? 'day' : 'days'}`;
}

function dataCoverageLabel(
  language: string,
  daysWithData: number,
  requestedDays: number,
  readings: number,
) {
  const hasMissingDays = daysWithData !== requestedDays;
  if (language === 'he') {
    return hasMissingDays
      ? `ימים עם נתונים: ${daysWithData}/${requestedDays} · ${readings} קריאות`
      : `ימים עם נתונים: ${daysWithData} · ${readings} קריאות`;
  }

  return hasMissingDays
    ? `Days with data: ${daysWithData}/${requestedDays} · ${readings} readings`
    : `Days with data: ${daysWithData} · ${readings} readings`;
}

export function buildComparisonRows({
  language,
  rangeDays,
  currentBgData,
  previousBgData,
  currentMetrics,
  previousMetrics,
}: {
  language: Lang;
  rangeDays: number;
  currentBgData: BgSample[];
  previousBgData: BgSample[];
  currentMetrics: ReturnType<typeof calculateTrendsMetrics>;
  previousMetrics: ReturnType<typeof calculateTrendsMetrics>;
}): ComparisonMetricRow[] {
  const current = buildPeriodStats(currentBgData, currentMetrics);
  const previous = buildPeriodStats(previousBgData, previousMetrics);

  return [
    {
      key: 'avg-bg',
      label: tr(language, 'trends.averageBg'),
      current: numberCell(current.averageBg, 'mg/dL'),
      previous: numberCell(previous.averageBg, 'mg/dL'),
      lowerIsBetter: true,
    },
    {
      key: 'tir',
      label: tr(language, 'trends.timeInRangeTir'),
      current: numberCell(currentMetrics.tir * 100, '%'),
      previous: numberCell(previousMetrics.tir * 100, '%'),
    },
    {
      key: 'severe-hypos',
      label: tr(language, 'trends.seriousHyposPerDay'),
      current: numberCell(currentMetrics.seriousHyposCount / rangeDays, '/day'),
      previous: numberCell(
        previousMetrics.seriousHyposCount / rangeDays,
        '/day',
      ),
      lowerIsBetter: true,
    },
    {
      key: 'severe-hypers',
      label: tr(language, 'trends.seriousHypersPerDay'),
      current: numberCell(
        currentMetrics.seriousHypersCount / rangeDays,
        '/day',
      ),
      previous: numberCell(
        previousMetrics.seriousHypersCount / rangeDays,
        '/day',
      ),
      lowerIsBetter: true,
    },
    {
      key: 'highest-hyper',
      label: language === 'he' ? 'ההיפר הכי חמור' : 'Worst high',
      current: numberCell(current.highestBg, 'mg/dL', 0),
      previous: numberCell(previous.highestBg, 'mg/dL', 0),
      lowerIsBetter: true,
    },
    {
      key: 'best-tir-day',
      label:
        language === 'he' ? 'היום עם הזמן בטווח הכי טוב' : 'Best day in range',
      current: textCell(formatDayTir(current.bestTirDay, language)),
      previous: textCell(formatDayTir(previous.bestTirDay, language)),
    },
    {
      key: 'most-balanced-hour',
      label: language === 'he' ? 'השעה הכי מאוזנת' : 'Most balanced hour',
      current: textCell(formatHourBucket(current.bestHour, language)),
      previous: textCell(formatHourBucket(previous.bestHour, language)),
    },
    {
      key: 'least-balanced-hour',
      label: language === 'he' ? 'השעה הכי לא מאוזנת' : 'Least balanced hour',
      current: textCell(formatHourBucket(current.worstHour, language)),
      previous: textCell(formatHourBucket(previous.worstHour, language)),
    },
    ...buildDayPartRows(language, current.dayParts, previous.dayParts),
    {
      key: 'meal-tir',
      label:
        language === 'he'
          ? 'ממוצע זמן בטווח סביב ארוחות'
          : 'Average meal-window TIR',
      current: {
        value: formatMealTir(current.mealTir, language),
        numeric: current.mealTir.average,
      },
      previous: {
        value: formatMealTir(previous.mealTir, language),
        numeric: previous.mealTir.average,
      },
    },
  ];
}

function buildPeriodStats(
  bgData: BgSample[],
  metrics: ReturnType<typeof calculateTrendsMetrics>,
) {
  const samples = validSamples(bgData);
  const highestBg = samples.length ? Math.max(...samples.map(s => s.sgv)) : 0;
  const averageBg = average(samples.map(s => s.sgv));
  const bestTirDay = metrics.dailyDetails
    .filter(isFiniteDayTir)
    .reduce<DayTir | null>(
      (best, day) => (!best || day.tir > best.tir ? day : best),
      null,
    );

  const hourly = buildHourlyBuckets(samples);
  const bestHour = hourly.reduce<HourBucket | null>(
    (best, hour) =>
      !best || hour.balanceScore > best.balanceScore ? hour : best,
    null,
  );
  const worstHour = hourly.reduce<HourBucket | null>(
    (worst, hour) =>
      !worst || hour.balanceScore < worst.balanceScore ? hour : worst,
    null,
  );

  return {
    highestBg,
    averageBg,
    bestTirDay,
    bestHour,
    worstHour,
    dayParts: buildDayPartStats(samples),
    mealTir: buildMealTir(samples),
  };
}

type DayTir = {dateString: string; tir: number};
type HourBucket = {
  hour: number;
  tir: number;
  avg: number;
  stdDev: number;
  count: number;
  balanceScore: number;
};
type MealTir = {
  breakfast: number | null;
  lunch: number | null;
  dinner: number | null;
  average: number;
};
type DayPartKey = 'morning' | 'noon' | 'evening' | 'night';
type DayPartStats = Record<
  DayPartKey,
  {
    tir: number | null;
    averageBg: number | null;
  }
>;

const inRangeMax = cgmRange[CGM_STATUS_CODES.VERY_HIGH] as number;

function validSamples(bgData: BgSample[]) {
  return bgData.filter(
    s => Number.isFinite(s.sgv) && s.sgv > 20 && s.sgv < 600,
  );
}

function isInRange(sgv: number) {
  return sgv >= cgmRange.TARGET.min && sgv <= inRangeMax;
}

function tirForSamples(samples: BgSample[]) {
  if (!samples.length) return null;
  const inRange = samples.filter(s => isInRange(s.sgv)).length;
  return (inRange / samples.length) * 100;
}

function buildHourlyBuckets(samples: BgSample[]): HourBucket[] {
  return Array.from({length: 24}, (_, hour) => {
    const hourSamples = samples.filter(
      s => new Date(s.date).getHours() === hour,
    );
    const values = hourSamples.map(s => s.sgv);
    const avg = average(values);
    const stdDev = standardDeviation(values, avg);
    const tir = tirForSamples(hourSamples) ?? 0;
    return {
      hour,
      count: hourSamples.length,
      tir,
      avg,
      stdDev,
      balanceScore: tir - stdDev * 0.3 - Math.abs(avg - 110) * 0.1,
    };
  }).filter(bucket => bucket.count >= 3);
}

function buildMealTir(samples: BgSample[]): MealTir {
  const breakfast = tirForWindow(samples, 6, 10);
  const lunch = tirForWindow(samples, 12, 15);
  const dinner = tirForWindow(samples, 18, 22);
  const values = [breakfast, lunch, dinner].filter(
    (value): value is number => value !== null,
  );

  return {
    breakfast,
    lunch,
    dinner,
    average: values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0,
  };
}

function buildDayPartRows(
  language: Lang,
  current: DayPartStats,
  previous: DayPartStats,
): ComparisonMetricRow[] {
  const rows: ComparisonMetricRow[] = [];
  dayPartDefinitions().forEach(part => {
    rows.push(
      {
        key: `${part.key}-tir`,
        label:
          language === 'he'
            ? `זמן בטווח - ${part.labelHe}`
            : `Time in range - ${part.labelEn}`,
        current: percentCell(current[part.key].tir),
        previous: percentCell(previous[part.key].tir),
      },
      {
        key: `${part.key}-avg-bg`,
        label:
          language === 'he'
            ? `ממוצע סוכר - ${part.labelHe}`
            : `Average glucose - ${part.labelEn}`,
        current: nullableNumberCell(current[part.key].averageBg, 'mg/dL'),
        previous: nullableNumberCell(previous[part.key].averageBg, 'mg/dL'),
        lowerIsBetter: true,
      },
    );
  });
  return rows;
}

function buildDayPartStats(samples: BgSample[]): DayPartStats {
  return dayPartDefinitions().reduce((stats, part) => {
    const partSamples = samplesForWindow(samples, part.startHour, part.endHour);
    const values = partSamples.map(s => s.sgv);
    stats[part.key] = {
      tir: tirForSamples(partSamples),
      averageBg: values.length ? average(values) : null,
    };
    return stats;
  }, {} as DayPartStats);
}

function dayPartDefinitions(): {
  key: DayPartKey;
  labelHe: string;
  labelEn: string;
  startHour: number;
  endHour: number;
}[] {
  return [
    {
      key: 'morning',
      labelHe: 'בוקר',
      labelEn: 'Morning',
      startHour: 6,
      endHour: 12,
    },
    {
      key: 'noon',
      labelHe: 'צהריים',
      labelEn: 'Noon',
      startHour: 12,
      endHour: 18,
    },
    {
      key: 'evening',
      labelHe: 'ערב',
      labelEn: 'Evening',
      startHour: 18,
      endHour: 24,
    },
    {key: 'night', labelHe: 'לילה', labelEn: 'Night', startHour: 0, endHour: 6},
  ];
}

function tirForWindow(samples: BgSample[], startHour: number, endHour: number) {
  return tirForSamples(samplesForWindow(samples, startHour, endHour));
}

function samplesForWindow(
  samples: BgSample[],
  startHour: number,
  endHour: number,
) {
  return samples.filter(s => {
    const hour = new Date(s.date).getHours();
    return hour >= startHour && hour < endHour;
  });
}

function numberCell(value: number, unit: string, decimals = 1): ComparisonCell {
  if (!Number.isFinite(value)) {
    return {value: '-'};
  }

  return {
    value: `${value.toFixed(decimals)} ${unit}`,
    numeric: value,
  };
}

function nullableNumberCell(
  value: number | null,
  unit: string,
  decimals = 1,
): ComparisonCell {
  return value === null ? {value: '-'} : numberCell(value, unit, decimals);
}

function percentCell(value: number | null): ComparisonCell {
  return value === null ? {value: '-'} : numberCell(value, '%');
}

function textCell(value: string): ComparisonCell {
  return {value};
}

function formatSigned(value: number) {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${value > 0 ? '+' : ''}${rounded}`;
}

function formatDayTir(day: DayTir | null, language: string) {
  if (!day) return language === 'he' ? 'אין נתונים' : 'No data';
  return `${formatDisplayDate(day.dateString, language)} · ${(
    day.tir * 100
  ).toFixed(1)}%`;
}

function isFiniteDayTir(day: DayTir) {
  return Number.isFinite(day.tir);
}

function formatDisplayDate(dateString: string, language: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
  });
}

function formatHourBucket(bucket: HourBucket | null, language: string) {
  if (!bucket)
    return language === 'he' ? 'אין מספיק נתונים' : 'Not enough data';
  const avgLabel =
    language === 'he'
      ? `ממוצע ${bucket.avg.toFixed(0)}`
      : `avg ${bucket.avg.toFixed(0)}`;
  return `${formatHour(bucket.hour)} · ${bucket.tir.toFixed(0)}% · ${avgLabel}`;
}

function formatHour(hour: number) {
  const start = `${String(hour).padStart(2, '0')}:00`;
  const end = `${String((hour + 1) % 24).padStart(2, '0')}:00`;
  return `${start}-${end}`;
}

function formatMealTir(mealTir: MealTir, language: string) {
  const empty = language === 'he' ? 'אין נתונים' : 'No data';
  const labels =
    language === 'he'
      ? ['בוקר', 'צהריים', 'ערב']
      : ['Breakfast', 'Lunch', 'Dinner'];
  const values = [mealTir.breakfast, mealTir.lunch, mealTir.dinner];
  const parts = values.map((value, index) => {
    const formatted = value === null ? empty : `${value.toFixed(0)}%`;
    return `${labels[index]} ${formatted}`;
  });
  return parts.join(' · ');
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], mean: number) {
  if (values.length < 2) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
