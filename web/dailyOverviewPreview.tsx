import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {View} from 'react-native';
import {DailyOverviewModuleView} from '../src/product/dailyOverview';
import {
  DEFAULT_DAILY_OVERVIEW_PREFERENCES,
  type StoredDailyOverviewPreferences,
} from '../src/product/personalization/types';
import {parseStoredLayoutProfile} from '../src/product/personalization/validation';
import {createDefaultProductPersonalization} from '../src/product/personalization/presets';
import {selectLayoutProfile} from '../src/product/personalization/updates';
import type {
  DailyOverviewDataSource,
  DailyInsulinSourceSummary,
} from '../src/modules/dailyOverview';
import {
  buildDailyInsulinComparison,
  getDailyInsulinComparisonWindows,
} from '../src/modules/dailyOverview';
import './styles.css';

const key = 'shani.daily-overview.development-preview';
const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
};
const now = () => new Date(2026, 8, 28, 10, 56).getTime();
const scenarioName = () =>
  new URLSearchParams(window.location.search).get('scenario') ?? 'recorded';
const fixtureInsulin = (
  durationMs: number,
  historicalIndex?: number,
): DailyInsulinSourceSummary => {
  const scenario = scenarioName();
  if (scenario === 'empty') {
    return {quality: 'unavailable'};
  }
  const bolusUnits =
    historicalIndex === undefined ? 5.1 : 4.8 + historicalIndex * 0.2;
  if (scenario === 'partial' || scenario === 'bolus-only') {
    const coverage = scenario === 'bolus-only' ? 0 : 32;
    return {
      quality: 'partial',
      ...(coverage ? {basalUnits: 2.1} : {}),
      bolusUnits,
      basalEvidence: 'recorded',
      basalCoveredMs: Math.round((durationMs * coverage) / 100),
      basalCoveragePercent: coverage,
    };
  }
  return {
    quality: 'available',
    basalUnits:
      historicalIndex === undefined ? 7.35 : 6.8 + historicalIndex * 0.1,
    bolusUnits,
    basalEvidence: 'recorded',
    basalCoveredMs: durationMs,
    basalCoveragePercent: 100,
  };
};
const source: DailyOverviewDataSource = {
  async loadDailyOverview(period, options) {
    const scenario = scenarioName();
    const durationMs = Math.max(
      0,
      Math.min(period.endMs, options?.asOfMs ?? now()) - period.startMs,
    );
    return {
      glucoseSamples:
        scenario === 'empty'
          ? []
          : Array.from(
              {length: Math.ceil(durationMs / (5 * 60 * 1000))},
              (_, index) => ({
                timestampMs: period.startMs + index * 5 * 60 * 1000,
                valueMgDl:
                  index < 6
                    ? 48
                    : index < 14
                    ? 64
                    : index < 264
                    ? 118 + Math.round(Math.sin(index / 18) * 28)
                    : index < 280
                    ? 195
                    : 265,
              }),
            ),
      insulinSummary: fixtureInsulin(durationMs),
    };
  },
  async loadDailyInsulinComparison(request) {
    const scenario = scenarioName();
    if (scenario === 'history-loading') {
      return new Promise(() => {});
    }
    if (scenario === 'history-error') {
      throw new Error('Synthetic history failure');
    }
    const windows = getDailyInsulinComparisonWindows(request);
    return buildDailyInsulinComparison(
      windows,
      windows.previousDays.map((period, index) =>
        fixtureInsulin(period.endMs - period.startMs, index),
      ),
    );
  },
};
const initial = (): StoredDailyOverviewPreferences => {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) {
      return DEFAULT_DAILY_OVERVIEW_PREFERENCES;
    }
    return (
      parseStoredLayoutProfile({
        ...selectLayoutProfile(createDefaultProductPersonalization(), 'phone'),
        dailyOverview: JSON.parse(stored),
      }).dailyOverview ?? DEFAULT_DAILY_OVERVIEW_PREFERENCES
    );
  } catch {
    return DEFAULT_DAILY_OVERVIEW_PREFERENCES;
  }
};
function Preview() {
  const [value, setValue] = useState(initial);
  const locale =
    new URLSearchParams(window.location.search).get('locale') === 'en'
      ? 'en'
      : 'he';
  return (
    <View style={{height: '100%'}}>
      <div
        style={{
          padding: '6px 12px',
          textAlign: 'center',
          color: '#627A8C',
          fontSize: 11,
          background: '#EAF1F8',
        }}>
        {locale === 'he'
          ? 'תצוגת פיתוח · נתוני דמה בלבד'
          : 'Development preview · Synthetic data only'}
      </div>
      <DailyOverviewModuleView
        locale={locale}
        dataSource={source}
        thresholds={thresholds}
        now={now}
        layoutPreferences={{
          scopeKey: 'development-preview',
          layout: 'phone',
          value,
          onSave: async next => {
            localStorage.setItem(key, JSON.stringify(next));
            setValue(next);
          },
        }}
      />
    </View>
  );
}
createRoot(document.getElementById('root')!).render(<Preview />);
