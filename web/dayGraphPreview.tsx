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

import {MINUTE_MS, previewModel} from './dayGraphPreviewFixture';

// Explicitly expose synthetic scenario/theme controls for static browser QA.
// The normal production performance fixture keeps the same minimal chrome.
const fixtureControlsEnabled = import.meta.env.DEV ||
  new URLSearchParams(window.location.search).get('qa') === '1';

const PreviewApp = () => {
  const [locale, setLocale] = useState<DestinationLocale>('en');
  const [themeId, setThemeId] = useState<AppThemeId>('calmBlue');
  const theme = useMemo(() => getThemeById(themeId), [themeId]);
  const [visit, setVisit] = useState(0);
  const [scenario, setScenario] = useState<
    'full' | 'loads-only' | 'unavailable'
  >('full');
  const model = useMemo(() => {
    if (scenario === 'full') {
      return previewModel;
    }
    return buildDayGraph({
      period: previewModel.period,
      expectedSampleIntervalMs: 5 * MINUTE_MS,
      glucoseSamples:
        scenario === 'loads-only' ? [] : previewModel.glucoseSamples,
      activeLoadSamples:
        scenario === 'loads-only' ? previewModel.activeLoadSamples : [],
      timelineItems: [],
      ...(scenario === 'unavailable'
        ? {
            dataAvailability: {
              treatments: 'unavailable',
              deviceStatus: 'unavailable',
              profile: 'unavailable',
            },
          }
        : {}),
    });
  }, [scenario]);
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
        {fixtureControlsEnabled && (
          <>
            <div
              hidden
              data-testid="preview-theme-palette"
              data-basal={theme.chart.basal}
              data-bolus={theme.chart.bolus}
              data-iob={theme.chart.iob}
              data-cob={theme.chart.cob}
            />
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
            <View style={styles.themeGroup}>
              {(['full', 'loads-only', 'unavailable'] as const).map(option => (
                <button
                  key={option}
                  type="button"
                  data-testid={`preview-scenario-${option}`}
                  aria-pressed={scenario === option}
                  onClick={() => setScenario(option)}>
                  {
                    {
                      full: 'All synthetic sources',
                      'loads-only': 'IOB / COB without glucose',
                      unavailable: 'Sources unavailable',
                    }[option]
                  }
                </button>
              ))}
            </View>
          </>
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
          model={model}
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
document.documentElement.dataset.chartBuildMode = import.meta.env.PROD
  ? 'production'
  : 'development';
// Synthetic preview only: the application runtime never imports this entry.
declare global {
  interface Window {
    chartRenderMetrics?: {commits: number; totalMs: number; maxMs: number};
  }
}
createRoot(rootElement).render(
  <React.Profiler
    id="day-graph-preview"
    onRender={(_id, _phase, actualDuration) => {
      const metrics = window.chartRenderMetrics;
      if (metrics) {
        metrics.commits++;
        metrics.totalMs += actualDuration;
        metrics.maxMs = Math.max(metrics.maxMs, actualDuration);
      }
    }}>
    <PreviewApp />
  </React.Profiler>,
);
