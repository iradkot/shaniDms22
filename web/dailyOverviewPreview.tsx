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
import type {DailyOverviewDataSource} from '../src/modules/dailyOverview';
import './styles.css';

const key = 'shani.daily-overview.development-preview';
const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
};
const now = () => new Date(2026, 8, 7, 21).getTime();
const source: DailyOverviewDataSource = {
  async loadDailyOverview(period) {
    const scenario = new URLSearchParams(window.location.search).get(
      'scenario',
    );
    return {
      glucoseSamples:
        scenario === 'empty'
          ? []
          : Array.from(
              {length: scenario === 'partial' ? 20 : 288},
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
      insulinSummary:
        scenario === 'empty'
          ? {quality: 'unavailable'}
          : {
              quality: 'available',
              basalUnits: 32.06189509722221,
              bolusUnits: 28.200000000000003,
            },
    };
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
