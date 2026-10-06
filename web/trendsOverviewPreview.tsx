import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {StyleSheet, View} from 'react-native';
import type {TrendsDataSource} from '../src/modules/trends';
import {AgpModuleView, TrendsOverviewModuleView} from '../src/product/trends';
import './styles.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const SAMPLE_MS = 5 * 60 * 1000;
const now = () => Date.UTC(2026, 8, 8, 18);
const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
};
const params = new URLSearchParams(window.location.search);
const scenario = params.get('scenario');
const locale = params.get('locale') === 'en' ? 'en' : 'he';
const source: TrendsDataSource = {
  async loadGlucoseSamples(period) {
    if (scenario === 'empty') {
      return [];
    }
    if (scenario === 'error') {
      throw new Error('Development preview load failure');
    }
    const duration = period.endMs - period.startMs;
    const count = scenario === 'partial' ? 24 : duration / SAMPLE_MS;
    return Array.from({length: count}, (_, index) => {
      const timestampMs = period.startMs + index * SAMPLE_MS;
      const day = Math.floor((timestampMs + 180 * 60 * 1000) / DAY_MS);
      return {
        timestampMs,
        valueMgDl:
          index % 113 === 0
            ? 48
            : index % 61 === 0
            ? 62
            : index % 89 === 0
            ? 269
            : Math.round(
                136 +
                  Math.sin(index / 20) * 46 +
                  Math.sin(day * 2) * 18 +
                  (period.endMs === now() ? 0 : 12),
              ),
      };
    }).filter(sample => {
      // Keep one missing day and one sparse day visible in the demo.
      const day = Math.floor((sample.timestampMs + 180 * 60 * 1000) / DAY_MS);
      const latestDay = Math.floor((period.endMs + 180 * 60 * 1000) / DAY_MS);
      return (
        day !== latestDay - 3 &&
        (day !== latestDay - 5 ||
          sample.timestampMs % DAY_MS < 3 * 60 * 60 * 1000)
      );
    });
  },
};

function Preview() {
  const [navigationMessage, setNavigationMessage] = useState('');
  return (
    <View style={styles.root}>
      <div style={bannerStyle}>
        {navigationMessage ||
          (locale === 'he'
            ? 'תצוגת פיתוח · נתוני דמה בלבד'
            : 'Development preview · Synthetic data only')}
      </div>
      {params.get('screen') === 'agp' ? (
        <AgpModuleView
          locale={locale}
          dataSource={source}
          thresholds={thresholds}
          now={now}
          timeZoneOffsetMinutes={180}
          onOpenDay={() =>
            setNavigationMessage(
              locale === 'he' ? 'דמו: פתיחת גרף היום' : 'Demo: Open day graph',
            )
          }
        />
      ) : (
        <TrendsOverviewModuleView
          locale={locale}
          dataSource={source}
          thresholds={thresholds}
          now={now}
          timeZoneOffsetMinutes={180}
          showGri={params.get('gri') === '1'}
          onOpenHypoInvestigation={() =>
            setNavigationMessage(
              locale === 'he'
                ? 'דמו: מעבר לחקירת סוכר נמוך'
                : 'Demo: Open low-glucose investigation',
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({root: {height: '100%'}});
const bannerStyle: React.CSSProperties = {
  padding: '6px 12px',
  textAlign: 'center',
  color: '#627A8C',
  fontSize: 11,
  background: '#EAF1F8',
};

createRoot(document.getElementById('root')!).render(<Preview />);
