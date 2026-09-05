import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  AgpDailyProfile,
  AgpHourBucket,
  AgpProfile,
} from '../../modules/trends/domain/agp';
import {
  buildAgpProfile,
  buildTrendsEvidenceMetadata,
} from '../../modules/trends';
import type {
  TrendsDataSource,
  TrendsPeriod,
  TrendsRangeThresholds,
} from '../../modules/trends';
import type {DestinationLocale} from '../destinations';
import {
  ProductPage,
  ProductSection,
  ResponsiveGrid,
  productUiTokens,
} from '../ui';
import {TrendsEvidenceMetadataView} from './TrendsEvidenceMetadataView';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DEFAULT_SAMPLE_INTERVAL_MS = 5 * MINUTE_MS;
const RANGE_DAYS = [7, 14, 30] as const;
const DISPLAY_MIN_MG_DL = 40;
const DISPLAY_MAX_MG_DL = 400;

type RangeDays = (typeof RANGE_DAYS)[number];

const COPY = {
  en: {
    title: 'AGP & daily patterns',
    subtitle:
      'Hourly glucose distributions across the selected period, without filling data gaps.',
    range: 'Period',
    days: 'days',
    loading: 'Loading the selected AGP period…',
    failed: 'The AGP data could not be loaded.',
    retry: 'Try again',
    quality: 'Data quality',
    coverage: 'coverage',
    representative: 'Representative',
    view: 'view',
    short:
      'Short view — a representative AGP needs at least 14 consecutive days.',
    partial: 'Partial view — data coverage is below 70%.',
    noData: 'No valid readings are available for this period.',
    readings: 'readings',
    daysWithData: 'days with data',
    excluded: 'excluded',
    duplicates: 'duplicates removed',
    periodLabel: 'Date range',
    utcOffset: 'UTC offset',
    hourly: 'Hourly percentile bands',
    outerBand: '10–90%',
    innerBand: '25–75%',
    median: 'Median',
    noReadings: 'No readings',
    evidence: 'Evidence details',
    individualDays: 'Individual daily profiles',
    individualDaysNote:
      'Each day remains visible so exceptions and missing data are not hidden by the aggregate.',
    largestGap: 'Largest visible gap',
    openDay: 'Open day',
  },
  he: {
    title: 'AGP ודפוסים יומיים',
    subtitle: 'התפלגות סוכר לפי שעות בתקופה שנבחרה, ללא השלמת פערים.',
    range: 'תקופה',
    days: 'ימים',
    loading: 'טוען את תקופת ה־AGP שנבחרה…',
    failed: 'לא הצלחנו לטעון את נתוני ה־AGP.',
    retry: 'ניסיון נוסף',
    quality: 'איכות הנתונים',
    coverage: 'כיסוי',
    representative: 'תצוגה מייצגת של',
    view: 'ימים',
    short: 'תצוגה קצרה — AGP מייצג דורש לפחות 14 ימים רצופים.',
    partial: 'תצוגה חלקית — כיסוי הנתונים נמוך מ־70%.',
    noData: 'אין קריאות תקינות בתקופה הזו.',
    readings: 'קריאות',
    daysWithData: 'ימים עם נתונים',
    excluded: 'הוחרגו',
    duplicates: 'כפילויות הוסרו',
    periodLabel: 'טווח תאריכים',
    utcOffset: 'הפרש מ־UTC',
    hourly: 'טווחי אחוזונים לפי שעה',
    outerBand: '10–90%',
    innerBand: '25–75%',
    median: 'חציון',
    noReadings: 'אין קריאות',
    evidence: 'פרטי הראיות',
    individualDays: 'פרופילים של ימים בודדים',
    individualDaysNote:
      'כל יום נשאר גלוי, כך שהממוצע לא מסתיר חריגות או חוסרים בנתונים.',
    largestGap: 'הפער הגלוי הגדול ביותר',
    openDay: 'פתיחת היום',
  },
} as const;

type LoadState =
  | {readonly kind: 'loading'}
  | {readonly kind: 'error'}
  | {readonly kind: 'ready'; readonly profile: AgpProfile};

export interface AgpModuleViewProps {
  readonly locale: DestinationLocale;
  readonly dataSource: TrendsDataSource;
  readonly expectedSampleIntervalMs?: number;
  readonly now?: () => number;
  readonly timeZoneOffsetMinutes?: number;
  readonly onOpenDay?: (period: {
    readonly dayStartMs: number;
    readonly dayEndMs: number;
  }) => void;
  readonly thresholds?: Pick<
    TrendsRangeThresholds,
    'targetMinMgDl' | 'targetMaxMgDl'
  >;
}

const systemNow = (): number => Date.now();
const systemTimeZoneOffsetMinutes = (): number =>
  -new Date().getTimezoneOffset();

const clockLabel = (hour: number): string =>
  `${String(hour).padStart(2, '0')}:00`;

const formatDate = (
  timestampMs: number,
  timeZoneOffsetMinutes: number,
  locale: DestinationLocale,
): string =>
  new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(timestampMs + timeZoneOffsetMinutes * MINUTE_MS));

const formatOffset = (timeZoneOffsetMinutes: number): string => {
  const sign = timeZoneOffsetMinutes >= 0 ? '+' : '−';
  const absolute = Math.abs(timeZoneOffsetMinutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(
    absolute % 60,
  ).padStart(2, '0')}`;
};

const scalePosition = (valueMgDl: number): number =>
  Math.max(
    0,
    Math.min(
      100,
      ((valueMgDl - DISPLAY_MIN_MG_DL) /
        (DISPLAY_MAX_MG_DL - DISPLAY_MIN_MG_DL)) *
        100,
    ),
  );

const bandStyle = (lowMgDl: number, highMgDl: number) => {
  const left = scalePosition(lowMgDl);
  const right = scalePosition(highMgDl);
  return {
    left: `${left}%` as const,
    width: `${Math.max(1, right - left)}%` as const,
  };
};

const percentileAccessibilityLabel = (
  bucket: AgpHourBucket,
  locale: DestinationLocale,
): string => {
  const time = clockLabel(bucket.hour);
  if (
    bucket.p10MgDl === undefined ||
    bucket.p25MgDl === undefined ||
    bucket.medianMgDl === undefined ||
    bucket.p75MgDl === undefined ||
    bucket.p90MgDl === undefined
  ) {
    return locale === 'he' ? `${time}. אין קריאות.` : `${time}. No readings.`;
  }
  return locale === 'he'
    ? `${time}. ${bucket.sampleCount} קריאות. אחוזון 10 עד 90: ${bucket.p10MgDl} עד ${bucket.p90MgDl} mg/dL. אחוזון 25 עד 75: ${bucket.p25MgDl} עד ${bucket.p75MgDl} mg/dL. חציון ${bucket.medianMgDl} mg/dL.`
    : `${time}. ${bucket.sampleCount} readings. 10th to 90th percentile ${bucket.p10MgDl} to ${bucket.p90MgDl} mg/dL. 25th to 75th percentile ${bucket.p25MgDl} to ${bucket.p75MgDl} mg/dL. Median ${bucket.medianMgDl} mg/dL.`;
};

const PercentileRow = ({
  bucket,
  locale,
}: {
  readonly bucket: AgpHourBucket;
  readonly locale: DestinationLocale;
}) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const hasData =
    bucket.p10MgDl !== undefined &&
    bucket.p25MgDl !== undefined &&
    bucket.medianMgDl !== undefined &&
    bucket.p75MgDl !== undefined &&
    bucket.p90MgDl !== undefined;

  return (
    <View
      accessibilityLabel={percentileAccessibilityLabel(bucket, locale)}
      accessible
      style={styles.hourCard}
      testID={`agp-hour-${String(bucket.hour).padStart(2, '0')}`}>
      <View style={[styles.hourHeader, rtl && styles.rowReverse]}>
        <Text style={styles.hourLabel}>{clockLabel(bucket.hour)}</Text>
        <Text style={[styles.sampleCount, rtl && styles.rtlText]}>
          {bucket.sampleCount} {copy.readings}
        </Text>
      </View>
      {hasData ? (
        <>
          <View accessibilityElementsHidden style={styles.bandTrack}>
            <View
              style={[
                styles.outerBand,
                bandStyle(bucket.p10MgDl!, bucket.p90MgDl!),
              ]}
            />
            <View
              style={[
                styles.innerBand,
                bandStyle(bucket.p25MgDl!, bucket.p75MgDl!),
              ]}
            />
            <View
              style={[
                styles.medianMarker,
                {left: `${scalePosition(bucket.medianMgDl!)}%`},
              ]}
            />
          </View>
          <Text style={[styles.percentileText, rtl && styles.rtlText]}>
            {copy.outerBand} {bucket.p10MgDl}–{bucket.p90MgDl} ·{' '}
            {copy.innerBand} {bucket.p25MgDl}–{bucket.p75MgDl} · {copy.median}{' '}
            {bucket.medianMgDl} mg/dL
          </Text>
        </>
      ) : (
        <Text style={[styles.noReadings, rtl && styles.rtlText]}>
          {copy.noReadings}
        </Text>
      )}
    </View>
  );
};

const gapLabel = (gapMs: number, locale: DestinationLocale): string => {
  const hours = Math.floor(gapMs / (60 * MINUTE_MS));
  const minutes = Math.round((gapMs % (60 * MINUTE_MS)) / MINUTE_MS);
  if (hours === 0) {
    return locale === 'he' ? `${minutes} דקות` : `${minutes} min`;
  }
  return locale === 'he'
    ? `${hours} שעות${minutes > 0 ? ` ו־${minutes} דקות` : ''}`
    : `${hours} hr${minutes > 0 ? ` ${minutes} min` : ''}`;
};

const DailyProfileCard = ({
  locale,
  onOpen,
  profile,
  timeZoneOffsetMinutes,
}: {
  readonly locale: DestinationLocale;
  readonly onOpen?: () => void;
  readonly profile: AgpDailyProfile;
  readonly timeZoneOffsetMinutes: number;
}) => {
  const copy = COPY[locale];
  const date = formatDate(profile.dayStartMs, timeZoneOffsetMinutes, locale);
  const dayIndex = Math.floor(
    (profile.dayStartMs + timeZoneOffsetMinutes * MINUTE_MS) / DAY_MS,
  );
  const noReadings = profile.sampleCount === 0;
  const accessibilityLabel = noReadings
    ? `${date}. ${copy.noReadings}. ${copy.largestGap}: ${gapLabel(
        profile.largestGapMs,
        locale,
      )}.`
    : `${date}. ${profile.coveragePercent}% ${copy.coverage}. ${
        profile.sampleCount
      } ${copy.readings}. ${copy.largestGap}: ${gapLabel(
        profile.largestGapMs,
        locale,
      )}.`;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onOpen ? 'button' : undefined}
      accessible
      disabled={onOpen === undefined}
      onPress={onOpen}
      style={({pressed}) => [
        styles.dayCard,
        pressed && onOpen !== undefined && styles.pressed,
      ]}
      testID={`agp-day-${dayIndex}`}>
      <Text style={[styles.dayDate, locale === 'he' && styles.rtlText]}>
        {date}
      </Text>
      <Text style={[styles.dayCoverage, locale === 'he' && styles.rtlText]}>
        {noReadings
          ? copy.noReadings
          : `${profile.coveragePercent}% ${copy.coverage}`}
      </Text>
      <View accessibilityElementsHidden style={styles.dayPlot}>
        {profile.points.map(point => (
          <View
            key={point.timestampMs}
            style={[
              styles.dayPoint,
              {
                left: `${Math.min(98, (point.minuteOfDay / (24 * 60)) * 100)}%`,
                bottom: `${Math.min(
                  94,
                  Math.max(
                    2,
                    ((point.valueMgDl - DISPLAY_MIN_MG_DL) /
                      (DISPLAY_MAX_MG_DL - DISPLAY_MIN_MG_DL)) *
                      100,
                  ),
                )}%`,
              },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.dayDetail, locale === 'he' && styles.rtlText]}>
        {copy.largestGap}: {gapLabel(profile.largestGapMs, locale)}
      </Text>
      {onOpen ? (
        <Text style={[styles.dayOpen, locale === 'he' && styles.rtlText]}>
          {copy.openDay}
        </Text>
      ) : null}
    </Pressable>
  );
};

export const AgpModuleView = ({
  locale,
  dataSource,
  expectedSampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  now = systemNow,
  timeZoneOffsetMinutes = systemTimeZoneOffsetMinutes(),
  onOpenDay,
  thresholds = {targetMinMgDl: 70, targetMaxMgDl: 180},
}: AgpModuleViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const [rangeDays, setRangeDays] = useState<RangeDays>(14);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<LoadState>({kind: 'loading'});
  const requestSequence = useRef(0);
  const period = useMemo<TrendsPeriod>(() => {
    const endMs = now();
    return {startMs: endMs - rangeDays * DAY_MS, endMs};
  }, [now, rangeDays]);

  useEffect(() => {
    const request = requestSequence.current + 1;
    requestSequence.current = request;
    let active = true;
    setState({kind: 'loading'});
    dataSource
      .loadGlucoseSamples(period)
      .then(samples => {
        if (!active || requestSequence.current !== request) {
          return;
        }
        setState({
          kind: 'ready',
          profile: buildAgpProfile({
            period,
            expectedSampleIntervalMs,
            timeZoneOffsetMinutes,
            samples,
          }),
        });
      })
      .catch(() => {
        if (!active || requestSequence.current !== request) {
          return;
        }
        setState({kind: 'error'});
      });
    return () => {
      active = false;
    };
  }, [
    dataSource,
    expectedSampleIntervalMs,
    period,
    reload,
    timeZoneOffsetMinutes,
  ]);

  return (
    <ProductPage
      locale={locale}
      subtitle={copy.subtitle}
      testID="agp-module-view"
      title={copy.title}>
      <ProductSection locale={locale} title={copy.range}>
        <View style={[styles.rangeSelector, rtl && styles.rowReverse]}>
          {RANGE_DAYS.map(days => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{selected: days === rangeDays}}
              key={days}
              onPress={() => setRangeDays(days)}
              style={({pressed}) => [
                styles.rangeButton,
                days === rangeDays && styles.rangeButtonSelected,
                pressed && styles.pressed,
              ]}
              testID={`agp-range-${days}`}>
              <Text
                style={[
                  styles.rangeButtonText,
                  days === rangeDays && styles.rangeButtonTextSelected,
                ]}>
                {days} {copy.days}
              </Text>
            </Pressable>
          ))}
        </View>
      </ProductSection>

      {state.kind === 'loading' ? (
        <View style={styles.stateCard} testID="agp-loading">
          <ActivityIndicator color={productUiTokens.colors.action} />
          <Text style={[styles.stateText, rtl && styles.rtlText]}>
            {copy.loading}
          </Text>
        </View>
      ) : state.kind === 'error' ? (
        <View style={styles.stateCard} testID="agp-error">
          <Text style={[styles.errorText, rtl && styles.rtlText]}>
            {copy.failed}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setReload(value => value + 1)}
            style={({pressed}) => [
              styles.retryButton,
              pressed && styles.pressed,
            ]}
            testID="agp-retry">
            <Text style={styles.retryText}>{copy.retry}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ProductSection locale={locale} title={copy.evidence}>
            <TrendsEvidenceMetadataView
              locale={locale}
              metadata={buildTrendsEvidenceMetadata({
                period: state.profile.period,
                coveragePercent: state.profile.quality.coveragePercent,
                coverageQuality: state.profile.quality.coverageQuality,
                daysWithData: state.profile.quality.daysWithData,
                expectedSampleIntervalMs,
                lastReadingTimestampMs:
                  state.profile.quality.lastReadingTimestampMs,
                targetRange: {
                  minMgDl: thresholds.targetMinMgDl,
                  maxMgDl: thresholds.targetMaxMgDl,
                },
                timeZoneOffsetMinutes,
              })}
            />
          </ProductSection>

          <ProductSection locale={locale} title={copy.quality}>
            <View style={styles.qualityCard} testID="agp-data-quality">
              <Text style={styles.coverageValue}>
                {state.profile.quality.coveragePercent}% {copy.coverage}
              </Text>
              <Text style={[styles.qualityDetail, rtl && styles.rtlText]}>
                {state.profile.quality.validSampleCount} /{' '}
                {state.profile.quality.expectedSampleCount} {copy.readings} ·{' '}
                {state.profile.quality.daysWithData} {copy.daysWithData}
              </Text>
              <Text style={[styles.qualityDetail, rtl && styles.rtlText]}>
                {copy.periodLabel}:{' '}
                {formatDate(period.startMs, timeZoneOffsetMinutes, locale)} –{' '}
                {formatDate(period.endMs, timeZoneOffsetMinutes, locale)} ·{' '}
                {copy.utcOffset} {formatOffset(timeZoneOffsetMinutes)}
              </Text>
              {state.profile.quality.excludedSampleCount > 0 ||
              state.profile.quality.duplicateSampleCount > 0 ? (
                <Text style={[styles.qualityDetail, rtl && styles.rtlText]}>
                  {state.profile.quality.excludedSampleCount} {copy.excluded} ·{' '}
                  {state.profile.quality.duplicateSampleCount} {copy.duplicates}
                </Text>
              ) : null}
              <Text
                style={[
                  styles.qualityMessage,
                  state.profile.quality.interpretationQuality !==
                    'representative' && styles.warningText,
                  rtl && styles.rtlText,
                ]}>
                {state.profile.quality.interpretationQuality ===
                'representative'
                  ? locale === 'he'
                    ? `${copy.representative} ${rangeDays} ${copy.view}`
                    : `${copy.representative} ${rangeDays}-day ${copy.view}`
                  : state.profile.quality.interpretationQuality === 'no-data'
                  ? copy.noData
                  : state.profile.quality.durationQuality === 'short'
                  ? copy.short
                  : copy.partial}
              </Text>
            </View>
          </ProductSection>

          <ProductSection locale={locale} title={copy.individualDays}>
            <Text style={[styles.sectionNote, rtl && styles.rtlText]}>
              {copy.individualDaysNote}
            </Text>
            <ResponsiveGrid locale={locale} testID="agp-daily-profiles-grid">
              {state.profile.dailyProfiles.map(profile => (
                <DailyProfileCard
                  key={profile.dayStartMs}
                  locale={locale}
                  {...(onOpenDay === undefined
                    ? {}
                    : {
                        onOpen: () =>
                          onOpenDay({
                            dayStartMs: profile.dayStartMs,
                            dayEndMs: profile.dayEndMs,
                          }),
                      })}
                  profile={profile}
                  timeZoneOffsetMinutes={timeZoneOffsetMinutes}
                />
              ))}
            </ResponsiveGrid>
          </ProductSection>

          <ProductSection locale={locale} title={copy.hourly}>
            <View style={[styles.legend, rtl && styles.rowReverse]}>
              <View style={styles.legendOuter} />
              <Text style={styles.legendText}>{copy.outerBand}</Text>
              <View style={styles.legendInner} />
              <Text style={styles.legendText}>{copy.innerBand}</Text>
              <View style={styles.legendMedian} />
              <Text style={styles.legendText}>{copy.median}</Text>
            </View>
            <ResponsiveGrid locale={locale} testID="agp-hourly-grid">
              {state.profile.buckets.map(bucket => (
                <PercentileRow
                  bucket={bucket}
                  key={bucket.hour}
                  locale={locale}
                />
              ))}
            </ResponsiveGrid>
          </ProductSection>
        </>
      )}
    </ProductPage>
  );
};

const styles = StyleSheet.create({
  rowReverse: {flexDirection: 'row-reverse'},
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  pressed: {opacity: productUiTokens.opacity.pressed},
  rangeSelector: {flexDirection: 'row', flexWrap: 'wrap'},
  rangeButton: {
    alignItems: 'center',
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: productUiTokens.spacing.sm,
    marginEnd: productUiTokens.spacing.sm,
    minHeight: 42,
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  rangeButtonSelected: {backgroundColor: productUiTokens.colors.action},
  rangeButtonText: {color: productUiTokens.colors.text, fontWeight: '700'},
  rangeButtonTextSelected: {color: productUiTokens.colors.actionText},
  stateCard: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.surface,
    borderRadius: productUiTokens.radii.card,
    marginTop: productUiTokens.spacing.lg,
    padding: productUiTokens.spacing.xl,
  },
  stateText: {
    color: productUiTokens.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: productUiTokens.spacing.sm,
  },
  errorText: {color: productUiTokens.colors.danger, fontWeight: '700'},
  retryButton: {
    backgroundColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    marginTop: productUiTokens.spacing.md,
    paddingHorizontal: productUiTokens.spacing.lg,
    paddingVertical: productUiTokens.spacing.md,
  },
  retryText: {color: productUiTokens.colors.actionText, fontWeight: '700'},
  qualityCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    padding: productUiTokens.spacing.lg,
  },
  coverageValue: {color: '#047857', fontSize: 25, fontWeight: '800'},
  qualityDetail: {
    color: productUiTokens.colors.textMuted,
    marginTop: productUiTokens.spacing.xs,
  },
  qualityMessage: {color: '#047857', fontWeight: '700', marginTop: 8},
  warningText: {color: '#9A3412'},
  legend: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.md,
  },
  legendOuter: {
    backgroundColor: '#BFDBFE',
    borderRadius: 3,
    height: 8,
    marginHorizontal: 5,
    width: 22,
  },
  legendInner: {
    backgroundColor: '#60A5FA',
    borderRadius: 3,
    height: 8,
    marginHorizontal: 5,
    width: 22,
  },
  legendMedian: {
    backgroundColor: '#1D4ED8',
    height: 14,
    marginHorizontal: 5,
    width: 3,
  },
  legendText: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    marginEnd: productUiTokens.spacing.sm,
  },
  hourCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    minHeight: 100,
    padding: productUiTokens.spacing.md,
    width: '100%',
  },
  hourHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hourLabel: {color: productUiTokens.colors.text, fontWeight: '800'},
  sampleCount: {color: productUiTokens.colors.textMuted, fontSize: 11},
  bandTrack: {
    backgroundColor: '#EFF6FF',
    borderRadius: 5,
    height: 22,
    marginTop: productUiTokens.spacing.sm,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  outerBand: {
    backgroundColor: '#BFDBFE',
    borderRadius: 4,
    height: 10,
    position: 'absolute',
    top: 6,
  },
  innerBand: {
    backgroundColor: '#60A5FA',
    borderRadius: 4,
    height: 14,
    position: 'absolute',
    top: 4,
  },
  medianMarker: {
    backgroundColor: '#1D4ED8',
    height: 22,
    position: 'absolute',
    top: 0,
    width: 3,
  },
  percentileText: {
    color: productUiTokens.colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 5,
  },
  noReadings: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    marginTop: productUiTokens.spacing.md,
  },
  sectionNote: {
    color: productUiTokens.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: productUiTokens.spacing.md,
  },
  dayCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    minHeight: 154,
    padding: productUiTokens.spacing.md,
    width: '100%',
  },
  dayDate: {color: productUiTokens.colors.text, fontWeight: '800'},
  dayCoverage: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    marginTop: productUiTokens.spacing.xs,
  },
  dayPlot: {
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    height: 54,
    marginTop: productUiTokens.spacing.sm,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  dayPoint: {
    backgroundColor: '#2563EB',
    borderRadius: 3,
    height: 5,
    position: 'absolute',
    width: 5,
  },
  dayDetail: {
    color: productUiTokens.colors.textMuted,
    fontSize: 11,
    marginTop: productUiTokens.spacing.sm,
  },
  dayOpen: {
    color: productUiTokens.colors.action,
    fontSize: 12,
    fontWeight: '800',
    marginTop: productUiTokens.spacing.xs,
  },
});
