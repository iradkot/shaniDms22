import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {StyleSheet, Text, View} from 'react-native';
import {PersonalHomeView} from '../src/product/home/PersonalHomeView';
import {
  DEFAULT_HOME_PREFERENCES,
  createDefaultProductPersonalization,
  parseStoredLayoutProfile,
  selectLayoutProfile,
  type StoredHomePreferences,
} from '../src/product/personalization';
import type {HomeDataSources} from '../src/product/home/homeData';
import {
  buildDailyInsulinComparison,
  getDailyInsulinComparisonWindows,
} from '../src/modules/dailyOverview';
import './styles.css';

const key = 'shani.home.development-preview';
const params = new URLSearchParams(window.location.search);
const scenario = params.get('scenario');
const now = () => new Date(2026, 8, 8, 18, 30).getTime();
const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
};
const readings = (startMs: number, endMs: number) => {
  if (scenario === 'error') {
    throw new Error('Synthetic error');
  }
  if (scenario === 'empty') {
    return [];
  }
  return Array.from(
    {length: Math.floor((endMs - startMs) / 300000)},
    (_, i) => ({
      timestampMs: startMs + i * 300000,
      valueMgDl: Math.round(128 + 44 * Math.sin(i / 20) + 23 * Math.cos(i / 9)),
    }),
  ).filter(
    p =>
      new Date(p.timestampMs).getDate() !== 4 &&
      new Date(p.timestampMs).getHours() !== 15 &&
      (scenario !== 'partial' || new Date(p.timestampMs).getHours() < 2),
  );
};
const sources: HomeDataSources = {
  dailyOverview: {
    loadDailyOverview: async period => ({
      glucoseSamples: readings(period.startMs, period.endMs),
      insulinSummary:
        scenario === 'empty' || new Date(period.startMs).getDate() === 4
          ? {quality: 'unavailable'}
          : scenario === 'recorded-bolus'
          ? {
              quality: 'partial',
              bolusUnits: 8.2,
              basalCoveredMs: 0,
              basalCoveragePercent: 0,
            }
          : scenario === 'estimated-total' || scenario === 'recorded-subtotal'
          ? {
              quality: 'partial', bolusUnits: 8.2, basalUnits: 4.8,
              basalEvidence: 'recorded', basalCoveredMs: 6 * 3_600_000,
              basalCoveragePercent: 32.4,
              ...(scenario === 'estimated-total' ? {estimatedBasalUnits: 18.6, estimatedTotalUnits: 26.8} : {}),
            }
          : {
              quality: 'available',
              basalUnits: ((period.endMs - period.startMs) / 3600000) * 0.81,
              bolusUnits:
                17.200000000000003 + new Date(period.startMs).getDate() / 2,
            },
    }),
    loadDailyInsulinComparison: async request =>
      buildDailyInsulinComparison(
        getDailyInsulinComparisonWindows(request),
        Array.from({length: 7}, (_, index) =>
          scenario === 'empty'
            ? {quality: 'unavailable' as const}
            : scenario === 'recorded-bolus'
            ? {
                quality: 'partial' as const,
                bolusUnits: index === 0 ? 6.2 : 7.2,
                basalCoveredMs: 0,
                basalCoveragePercent: 0,
              }
            : scenario === 'estimated-total' || scenario === 'recorded-subtotal'
            ? {
                quality: 'partial' as const, bolusUnits: 8.2, basalUnits: index === 0 ? 3.8 : 4.2,
                basalEvidence: 'recorded' as const, basalCoveredMs: 6 * 3_600_000,
                basalCoveragePercent: 32.4,
                ...(scenario === 'estimated-total' ? {estimatedBasalUnits: index === 0 ? 17.6 : 18, estimatedTotalUnits: index === 0 ? 25.8 : 26.2} : {}),
              }
            : {
                quality: 'available' as const,
                basalUnits: 14.5,
                bolusUnits: 19.5,
              },
        ),
      ),
  },
  trends: {
    loadGlucoseSamples: async period => readings(period.startMs, period.endMs),
  },
};
function initial(): StoredHomePreferences {
  try {
    const stored = localStorage.getItem(key);
    return stored
      ? parseStoredLayoutProfile({
          ...selectLayoutProfile(
            createDefaultProductPersonalization(),
            'phone',
          ),
          home: JSON.parse(stored),
        }).home ?? DEFAULT_HOME_PREFERENCES
      : DEFAULT_HOME_PREFERENCES;
  } catch {
    return DEFAULT_HOME_PREFERENCES;
  }
}
function Preview() {
  const [value, setValue] = useState(initial);
  const [opened, setOpened] = useState('');
  const locale = params.get('locale') === 'en' ? 'en' : 'he';
  return (
    <View style={styles.root}>
      <div style={bannerStyle}>
        תצוגת פיתוח · נתוני דמה בלבד · Synthetic data only
      </div>
      <PersonalHomeView
        locale={locale}
        scopeKey="preview"
        value={value}
        hydrated
        sources={sources}
        thresholds={thresholds}
        now={now}
        chatReady
        onSave={async next => {
          if (scenario === 'slow-save') {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          if (scenario === 'save-error') {
            throw new Error('Synthetic save failure');
          }
          localStorage.setItem(key, JSON.stringify(next));
          setValue(next);
        }}
        onOpenWidget={(id, dayStartMs) =>
          setOpened(dayStartMs === undefined ? id : `${id}:${dayStartMs}`)
        }
        modules={<Text testID="home-preview-tools">כל הכלים · All tools</Text>}
      />
      {opened ? <Text testID="home-preview-opened">{opened}</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create({root: {height: '100%'}});
const bannerStyle: React.CSSProperties = {
  padding: 5,
  textAlign: 'center',
  fontSize: 11,
  background: '#EAF1F8',
  color: '#627A8C',
};
createRoot(document.getElementById('root')!).render(<Preview />);
