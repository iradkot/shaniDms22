import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {TrendsEvidenceMetadata} from '../../modules/trends';
import type {DestinationLocale} from '../destinations';
import {ResponsiveGrid, productUiTokens} from '../ui';

const MINUTE_MS = 60 * 1000;

const COPY = {
  en: {
    period: 'Evidence period',
    timeZone: 'Timezone',
    targetRange: 'Target range',
    daysWithData: 'Days with data',
    coverage: 'Coverage',
    lastData: 'Last data',
    current: 'Complete to the period end',
    noData: 'No latest reading',
    beforeEnd: 'before period end',
  },
  he: {
    period: 'תקופת הראיות',
    timeZone: 'אזור זמן',
    targetRange: 'טווח יעד',
    daysWithData: 'ימים עם נתונים',
    coverage: 'כיסוי',
    lastData: 'נתון אחרון',
    current: 'מלא עד סוף התקופה',
    noData: 'אין קריאה אחרונה',
    beforeEnd: 'לפני סוף התקופה',
  },
} as const;

export interface TrendsEvidenceMetadataViewProps {
  readonly locale: DestinationLocale;
  readonly metadata: TrendsEvidenceMetadata;
}

const dateLabel = (
  timestampMs: number,
  locale: DestinationLocale,
  timeZoneOffsetMinutes: number,
): string =>
  new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(timestampMs + timeZoneOffsetMinutes * MINUTE_MS));

const dateTimeLabel = (
  timestampMs: number,
  locale: DestinationLocale,
  timeZoneOffsetMinutes: number,
): string =>
  new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(timestampMs + timeZoneOffsetMinutes * MINUTE_MS));

const offsetLabel = (offsetMinutes: number): string => {
  const sign = offsetMinutes >= 0 ? '+' : '−';
  const absolute = Math.abs(offsetMinutes);
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(
    2,
    '0',
  )}:${String(absolute % 60).padStart(2, '0')}`;
};

const ageLabel = (
  metadata: TrendsEvidenceMetadata,
  locale: DestinationLocale,
): string => {
  const copy = COPY[locale];
  if (metadata.ageAtPeriodEndMs === undefined) {
    return copy.noData;
  }
  if (metadata.freshness === 'current') {
    return copy.current;
  }
  const minutes = Math.max(
    1,
    Math.round(metadata.ageAtPeriodEndMs / MINUTE_MS),
  );
  return locale === 'he'
    ? `${minutes} דקות ${copy.beforeEnd}`
    : `${minutes} min ${copy.beforeEnd}`;
};

const EvidenceFact = ({
  label,
  locale,
  value,
  testID,
}: {
  readonly label: string;
  readonly locale: DestinationLocale;
  readonly value: string;
  readonly testID: string;
}) => (
  <View style={styles.fact} testID={testID}>
    <Text style={[styles.label, locale === 'he' && styles.rtlText]}>
      {label}
    </Text>
    <Text style={[styles.value, locale === 'he' && styles.rtlText]}>
      {value}
    </Text>
  </View>
);

/** Shared period, coverage and freshness presentation for Trends evidence. */
export const TrendsEvidenceMetadataView = ({
  locale,
  metadata,
}: TrendsEvidenceMetadataViewProps) => {
  const timeZoneOffsetMinutes = metadata.timeZoneOffsetMinutes;
  const copy = COPY[locale];
  return (
    <ResponsiveGrid locale={locale} testID="trends-evidence-metadata">
      <EvidenceFact
        label={copy.period}
        locale={locale}
        testID="trends-evidence-period"
        value={`${dateLabel(
          metadata.period.startMs,
          locale,
          timeZoneOffsetMinutes,
        )} – ${dateLabel(
          metadata.period.endMs,
          locale,
          timeZoneOffsetMinutes,
        )}`}
      />
      <EvidenceFact
        label={copy.timeZone}
        locale={locale}
        testID="trends-evidence-timezone"
        value={offsetLabel(metadata.timeZoneOffsetMinutes)}
      />
      <EvidenceFact
        label={copy.targetRange}
        locale={locale}
        testID="trends-evidence-target-range"
        value={`${metadata.targetRange.minMgDl}–${metadata.targetRange.maxMgDl} mg/dL`}
      />
      <EvidenceFact
        label={copy.daysWithData}
        locale={locale}
        testID="trends-evidence-days-with-data"
        value={String(metadata.daysWithData)}
      />
      <EvidenceFact
        label={copy.coverage}
        locale={locale}
        testID="trends-evidence-coverage"
        value={`${metadata.coveragePercent}%`}
      />
      <EvidenceFact
        label={copy.lastData}
        locale={locale}
        testID="trends-evidence-freshness"
        value={
          metadata.lastReadingTimestampMs === undefined
            ? ageLabel(metadata, locale)
            : `${dateTimeLabel(
                metadata.lastReadingTimestampMs,
                locale,
                metadata.timeZoneOffsetMinutes,
              )} · ${ageLabel(metadata, locale)}`
        }
      />
    </ResponsiveGrid>
  );
};

const styles = StyleSheet.create({
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  fact: {
    backgroundColor: productUiTokens.colors.surfaceInfo,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    minHeight: 78,
    padding: productUiTokens.spacing.md,
    width: '100%',
  },
  label: {color: productUiTokens.colors.textMuted, fontSize: 12},
  value: {
    color: productUiTokens.colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: productUiTokens.spacing.xs,
  },
});
