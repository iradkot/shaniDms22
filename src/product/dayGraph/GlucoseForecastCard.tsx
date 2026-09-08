import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTheme} from 'styled-components/native';
import type {GlucoseForecastSnapshot} from '../../modules/glucoseForecast';
import type {ThemeType} from '../../types/theme';
import {addOpacity} from '../../style/styling.utils';
import {
  FORECAST_APPEARANCE,
  forecastAppearance,
  forecastSourceLabel,
  type ForecastSeriesId,
} from '../../components/charts/glucoseForecastPresentation';

const SOURCES: readonly ForecastSeriesId[] = ['loop', 'nightscout', 'personalized', 'ensemble'];
const HORIZONS = [5, 15, 30] as const;
const FEATURE_LABELS: Readonly<Record<string, readonly [string, string]>> = {
  glucose: ['glucose', 'סוכר'], trend: ['trend', 'מגמה'],
  'time-of-day': ['time of day', 'שעה ביום'], 'day-of-week': ['day of week', 'יום בשבוע'],
  iob: ['active insulin', 'אינסולין פעיל'], cob: ['active carbs', 'פחמימות פעילות'],
  meal: ['meals', 'ארוחות'], activity: ['activity', 'פעילות'],
};

export const GlucoseForecastCard = ({
  locale,
  snapshot,
  status,
}: {
  readonly locale: 'en' | 'he';
  readonly snapshot?: GlucoseForecastSnapshot | undefined;
  readonly status: 'loading' | 'error' | 'stale' | 'ready';
}) => {
  const theme = useTheme() as ThemeType;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const he = locale === 'he';
  const textStyle = [styles.text, he && styles.rtl];
  const series = snapshot?.series ?? [];
  const emptyText = status === 'loading'
    ? he ? 'טוען תחזיות…' : 'Loading forecasts…'
    : status === 'error'
    ? he ? 'התחזית אינה זמינה כרגע.' : 'Forecast is currently unavailable.'
    : status === 'stale' || snapshot?.unavailableReason === 'stale-glucose'
    ? he ? 'התחזית הוסתרה: נדרשות קריאות סוכר עדכניות.' : 'Forecast hidden: recent glucose readings are needed.'
    : he ? 'עדיין אין מספיק קריאות לתחזית.' : 'There are not enough readings for a forecast yet.';
  return (
    <View style={styles.card} testID="glucose-forecast-card">
      <View style={[styles.header, he && styles.reverse]}>
        <Text style={[styles.title, he && styles.rtl]}>
          {he ? 'הסוכר הקרוב' : 'Upcoming glucose'}
        </Text>
        <Text style={styles.badge}>{he ? 'תחזית · mg/dL' : 'Forecast · mg/dL'}</Text>
      </View>
      {series.length === 0 ? <Text style={textStyle}>{emptyText}</Text> : (
        <>
          <Text style={[styles.detail, he && styles.rtl]}>
            {he ? 'דקות מהקריאה האחרונה ב־' : 'Minutes from the last reading at '}
            {new Date(snapshot!.glucoseTimestampMs).toLocaleTimeString(he ? 'he-IL' : 'en-GB', {hour: '2-digit', minute: '2-digit'})}
          </Text>
          <View style={styles.row}>
            <Text style={[styles.source, styles.muted]}>{he ? 'מקור' : 'Source'}</Text>
            {HORIZONS.map(minutes => (
              <Text key={minutes} style={[styles.value, styles.muted]}>
                +{minutes}{he ? ' דק׳' : ' min'}
              </Text>
            ))}
          </View>
          {SOURCES.map(id => {
            const item = series.find(value => value.id === id);
            if (!item) {
              return null;
            }
            const calibration = item.calibration;
            const calibrated = calibration.status === 'calibrated' &&
              calibration.within20Percent !== undefined;
            return (
              <View key={id} style={[styles.series, id === 'ensemble' && styles.combined]}>
                <View style={styles.row} testID={`glucose-forecast-summary-${id}`}>
                  <Text style={[styles.source, {color: forecastAppearance(id, theme.dark).color}]}>
                    {FORECAST_APPEARANCE[id].symbol} {forecastSourceLabel(id, locale)}
                  </Text>
                  {HORIZONS.map(minutes => {
                    const target = snapshot!.glucoseTimestampMs + minutes * 60_000;
                    const point = item.points.find(value => Math.abs(value.ts - target) <= 60_000);
                    return (
                      <Text key={minutes} style={[styles.value, id === 'ensemble' && styles.strong]}>
                        {point ? Math.round(point.sgv) : '—'}
                      </Text>
                    );
                  })}
                </View>
                <Text style={[styles.detail, he && styles.rtl]}>
                  {calibrated
                    ? he
                      ? `דיוק היסטורי ל־30 דק׳: ${Math.round(calibration.within20Percent!)}% בטווח ±20 mg/dL · ${calibration.sampleCount} בדיקות`
                      : `30-min historical accuracy: ${Math.round(calibration.within20Percent!)}% within ±20 mg/dL · ${calibration.sampleCount} checks`
                    : he ? 'טרם נמדד דיוק אישי מספיק' : 'Personal accuracy has not been measured sufficiently'}
                </Text>
                {calibration.coveragePercent !== undefined && item.points.some(point => point.lower !== undefined && point.upper !== undefined) ? (
                  <Text style={[styles.detail, he && styles.rtl]}>
                    {he
                      ? `הטווח המוצל כיסה ${Math.round(calibration.coveragePercent)}% מהבדיקות ההיסטוריות`
                      : `Shaded range covered ${Math.round(calibration.coveragePercent)}% of historical checks`}
                  </Text>
                ) : null}
              </View>
            );
          })}
          <Text style={textStyle}>
            {he ? 'אינסולין פעיל' : 'Active insulin'}: {snapshot?.context.iobUnits === undefined ? '—' : `${snapshot.context.iobUnits.toFixed(2)} U`}
            {' · '}{he ? 'פחמימות פעילות' : 'Active carbs'}: {snapshot?.context.cobGrams === undefined ? '—' : `${Math.round(snapshot.context.cobGrams)} g`}
          </Text>
          <Text style={[styles.detail, he && styles.rtl]}>
            {he
              ? `${snapshot!.context.historyDays} ימי היסטוריה · ${snapshot!.context.matchedExamples} מצבים דומים`
              : `${snapshot!.context.historyDays} history days · ${snapshot!.context.matchedExamples} similar situations`}
          </Text>
          {snapshot!.context.features.length ? (
            <Text style={[styles.detail, he && styles.rtl]}>
              {he ? 'נתונים בשימוש: ' : 'Inputs used: '}
              {snapshot!.context.features.flatMap(feature => FEATURE_LABELS[feature]
                ? [FEATURE_LABELS[feature]![he ? 1 : 0]] : []).join(' · ')}
            </Text>
          ) : null}
        </>
      )}
      {series.length > 0 && SOURCES.slice(0, 3).some(id => !series.some(item => item.id === id)) ? (
        <Text style={[styles.detail, he && styles.rtl]}>
          {he ? 'אין תחזית זמינה: ' : 'No forecast available: '}
          {SOURCES.slice(0, 3).filter(id => !series.some(item => item.id === id))
            .map(id => forecastSourceLabel(id, locale)).join(' · ')}
        </Text>
      ) : null}
      <Text style={[styles.detail, he && styles.rtl]}>
        {he
          ? 'אין גיל מתועד או היסטוריה שנתית מספקת; הם אינם בשימוש. האחוזים מתארים בדיקות עבר, לא ודאות לגבי הקריאה הבאה.'
          : 'No recorded age or sufficient annual history is available; neither is used. Percentages describe past checks, not certainty about the next reading.'}
      </Text>
      <Text style={[styles.detail, he && styles.rtl]}>
        {he ? 'תחזית ניסיונית; אינה הנחיית מינון.' : 'Experimental forecast; not dosing guidance.'}
      </Text>
    </View>
  );
};

const createStyles = (theme: ThemeType) => StyleSheet.create({
  card: {marginTop: theme.spacing.sm, padding: theme.spacing.md, gap: 7,
    borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.14), borderRadius: 14,
    backgroundColor: addOpacity(FORECAST_APPEARANCE.ensemble.color, 0.05)},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap'},
  title: {fontSize: 16, fontWeight: '700', color: theme.textColor},
  badge: {fontSize: 11, color: theme.textColor, opacity: 0.7},
  row: {flexDirection: 'row', alignItems: 'center', gap: 4},
  source: {width: '34%', fontSize: 12, fontWeight: '600', color: theme.textColor},
  value: {flex: 1, textAlign: 'center', fontSize: 14, color: theme.textColor, fontVariant: ['tabular-nums']},
  muted: {fontSize: 11, opacity: 0.65},
  strong: {fontWeight: '800', fontSize: 17},
  series: {paddingVertical: 5, gap: 4},
  combined: {backgroundColor: addOpacity(FORECAST_APPEARANCE.ensemble.color, 0.1), borderRadius: 8, paddingHorizontal: 5},
  text: {fontSize: 12, color: theme.textColor, lineHeight: 18},
  detail: {fontSize: 11, color: theme.textColor, opacity: 0.7, lineHeight: 16},
  reverse: {flexDirection: 'row-reverse'},
  rtl: {textAlign: 'right', writingDirection: 'rtl'},
});
