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
          : {
              quality: 'available',
              basalUnits: ((period.endMs - period.startMs) / 3600000) * 0.81,
              bolusUnits:
                17.200000000000003 + new Date(period.startMs).getDate() / 2,
            },
    }),
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
