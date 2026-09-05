import React, {useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {ThemeProvider} from 'styled-components/native';

import {APP_THEME_OPTIONS, getThemeById} from '../src/style/theme';
import type {AppThemeId} from '../src/style/theme';
import {buildDayGraph} from '../src/modules/dayGraph';
import {RichDayGraphChart} from '../src/product/dayGraph/RichDayGraphChart';
import type {DestinationLocale} from '../src/product/destinations';
import {
  DEFAULT_DAY_GRAPH_PREFERENCES,
  type PersonalizationLayout,
  type StoredDayGraphPreferences,
} from '../src/product/personalization/types';
import {getPersonalizationLayout} from '../src/product/personalization/layout';
import './styles.css';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_START_MS = new Date(2026, 8, 3).getTime();
const DAY_END_MS = DAY_START_MS + 24 * HOUR_MS;

const directionForDelta = (delta: number): string => {
  if (delta > 4) {
    return 'SingleUp';
  }
  if (delta > 1) {
    return 'FortyFiveUp';
  }
  if (delta < -4) {
    return 'SingleDown';
  }
  if (delta < -1) {
    return 'FortyFiveDown';
  }
  return 'Flat';
};

const glucoseAt = (hour: number): number => {
  const circadian = Math.sin((hour / 24) * Math.PI * 2) * 12;
  const breakfast = Math.max(0, 65 - Math.abs(hour - 8.5) * 38);
  const lunch = Math.max(0, 48 - Math.abs(hour - 13.5) * 30);
  const dinner = Math.max(0, 72 - Math.abs(hour - 19.5) * 34);
  return Math.round(105 + circadian + breakfast + lunch + dinner);
};

const activeAmount = (
  hour: number,
  eventHour: number,
  amount: number,
  durationHours: number,
): number => {
  const elapsed = hour - eventHour;
  return elapsed >= 0 && elapsed <= durationHours
    ? amount * (1 - elapsed / durationHours)
    : 0;
};

const previewModel = buildDayGraph({
  period: {dayStartMs: DAY_START_MS, dayEndMs: DAY_END_MS},
  expectedSampleIntervalMs: 5 * MINUTE_MS,
  glucoseSamples: Array.from({length: 288}, (_, index) => {
    const timestampMs = DAY_START_MS + index * 5 * MINUTE_MS;
    const hour = index / 12;
    const valueMgDl = glucoseAt(hour);
    const previousValue = glucoseAt(Math.max(0, hour - 5 / 60));
    return {
      identity: {sourceId: 'preview', recordId: `glucose-${index}`},
      timestampMs,
      valueMgDl,
      direction: directionForDelta(valueMgDl - previousValue),
      device: 'Development fixture',
    };
  }),
  activeLoadSamples: Array.from({length: 288}, (_, index) => {
    const timestampMs = DAY_START_MS + index * 5 * MINUTE_MS;
    const hour = index / 12;
    const bolusIobUnits =
      activeAmount(hour, 8, 4.2, 4) +
      activeAmount(hour, 13, 3.1, 4) +
      activeAmount(hour, 19, 5.3, 4);
    const basalIobUnits = 0.35 + Math.sin((hour / 24) * Math.PI * 4) * 0.2;
    const cobGrams =
      activeAmount(hour, 8.25, 42, 3) +
      activeAmount(hour, 13.25, 58, 3.5) +
      activeAmount(hour, 19.25, 68, 4);
    return {
      timestampMs,
      iobUnits: bolusIobUnits + basalIobUnits,
      bolusIobUnits,
      basalIobUnits,
      cobGrams,
    };
  }),
  timelineItems: [
    {hour: 8.25, grams: 42, name: 'Breakfast'},
    {hour: 13.25, grams: 58, name: 'Lunch'},
    {hour: 19.25, grams: 68, name: 'Dinner'},
  ].map((meal, index) => ({
    kind: 'journal-meal' as const,
    identity: {sourceId: 'preview', recordId: `meal-${index}`},
    sourceLabel: 'Journal',
    timestampMs: DAY_START_MS + meal.hour * HOUR_MS,
    title: meal.name,
    detail: `${meal.grams} g`,
    carbohydratesGrams: meal.grams,
  })),
  insulinEvents: [
    {kind: 'bolus', timestampMs: DAY_START_MS + 8 * HOUR_MS, units: 4.2},
    {kind: 'bolus', timestampMs: DAY_START_MS + 13 * HOUR_MS, units: 3.1},
    {kind: 'bolus', timestampMs: DAY_START_MS + 19 * HOUR_MS, units: 5.3},
    {
      kind: 'temp-basal',
      startMs: DAY_START_MS + 15 * HOUR_MS,
      endMs: DAY_START_MS + 16.5 * HOUR_MS,
      rateUnitsPerHour: 0.35,
    },
  ],
  basalSchedule: [
    {secondsFromMidnight: 0, rateUnitsPerHour: 0.72},
    {secondsFromMidnight: 6 * 3600, rateUnitsPerHour: 0.9},
    {secondsFromMidnight: 12 * 3600, rateUnitsPerHour: 0.78},
    {secondsFromMidnight: 18 * 3600, rateUnitsPerHour: 0.84},
  ],
});

const PreviewApp = () => {
  const [locale, setLocale] = useState<DestinationLocale>('en');
  const [themeId, setThemeId] = useState<AppThemeId>('calmBlue');
  const theme = useMemo(() => getThemeById(themeId), [themeId]);
  const [visit, setVisit] = useState(0);
  const [profiles, setProfiles] = useState<
    Partial<Record<PersonalizationLayout, StoredDayGraphPreferences>>
  >({});
  const {width} = useWindowDimensions();
  const layout = getPersonalizationLayout('web', width);
  const copy = useMemo(
    () =>
      locale === 'he'
        ? {
            title: 'תצוגת פיתוח — גרף יומי',
            note: 'נתוני דמה בלבד. ההעדפות זמניות ונשמרות רק לסשן ההדגמה.',
          }
        : {
            title: 'Development preview — Day graph',
            note: 'Synthetic data. Preferences last only for this preview session.',
          },
    [locale],
  );
  return (
    <ThemeProvider theme={theme}>
      <View style={[styles.page, {backgroundColor: theme.backgroundColor}]}>
        <View style={[styles.header, locale === 'he' && styles.rtl]}>
          <View style={styles.headingGroup}>
            <Text style={[styles.title, {color: theme.textColor}]}>
              {copy.title}
            </Text>
            <Text style={[styles.note, {color: theme.textColor}]}>
              {copy.note}
            </Text>
          </View>
          <View style={styles.languageGroup}>
            {(['en', 'he'] as const).map(option => (
              <button
                aria-pressed={locale === option}
                key={option}
                onClick={() => setLocale(option)}
                type="button">
                {option === 'he' ? 'עברית' : 'English'}
              </button>
            ))}
          </View>
        </View>
        {import.meta.env.DEV && (
          <View style={styles.themeGroup}>
            {APP_THEME_OPTIONS.map(option => (
              <button
                aria-pressed={themeId === option.id}
                data-testid={`preview-theme-${option.id}`}
                key={option.id}
                onClick={() => setThemeId(option.id)}
                type="button">
                {option.title}
              </button>
            ))}
          </View>
        )}
        <button
          data-testid="preview-reopen-chart"
          onClick={() => setVisit(current => current + 1)}
          type="button">
          {locale === 'he' ? 'פתיחת הגרף מחדש' : 'Reopen chart'}
        </button>
        <RichDayGraphChart
          key={visit}
          locale={locale}
          model={previewModel}
          preferences={{
            scopeKey: `preview:${layout}`,
            layout,
            value: profiles[layout] ?? DEFAULT_DAY_GRAPH_PREFERENCES,
            onSave: async value => {
              setProfiles(current => ({...current, [layout]: value}));
            },
          }}
        />
      </View>
    </ThemeProvider>
  );
};

const styles = StyleSheet.create({
  page: {
    alignSelf: 'center',
    maxWidth: 1180,
    padding: 24,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  rtl: {flexDirection: 'row-reverse'},
  headingGroup: {flexShrink: 1},
  title: {fontSize: 24, fontWeight: '900'},
  note: {fontSize: 13, marginTop: 4},
  languageGroup: {flexDirection: 'row'},
  themeGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('The preview root is missing.');
}
createRoot(rootElement).render(<PreviewApp />);
