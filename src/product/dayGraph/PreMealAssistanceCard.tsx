import React, {useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {
  DayGraphPeriod,
} from '../../modules/dayGraph';
import {
  evaluatePreMealAssistance,
  type PreMealAssistanceSnapshot,
  type PreMealTrend,
} from '../../modules/preMealAssistance';
import type {DestinationLocale} from '../destinations';
import {productUiTokens} from '../ui';
import type {PreMealAssistanceRuntime} from './runtime';

const COPY = {
  en: {
    title: 'Before a meal',
    description: 'Latest factual context for the meal you are planning.',
    current: 'Current',
    stale: 'May be out of date',
    offline: 'Offline · saved values',
    noFacts: 'Current values are unavailable.',
    now: 'Now',
    minutesAgo: (minutes: number) => `${minutes} min ago`,
    glucose: 'Glucose',
    trend: 'Trend',
    iob: 'IOB',
    cob: 'COB',
    openMeals: 'Open Meals',
    openAi: 'Ask AI',
    end: 'End',
  },
  he: {
    title: 'לפני ארוחה',
    description: 'ההקשר העובדתי האחרון לארוחה שמתוכננת עכשיו.',
    current: 'עדכני',
    stale: 'ייתכן שהנתונים לא עדכניים',
    offline: 'אין חיבור · נתונים שמורים',
    noFacts: 'אין כרגע ערכים זמינים.',
    now: 'עכשיו',
    minutesAgo: (minutes: number) => `לפני ${minutes} דק׳`,
    glucose: 'סוכר',
    trend: 'מגמה',
    iob: 'IOB',
    cob: 'COB',
    openMeals: 'פתיחת ארוחות',
    openAi: 'שאלה ל־AI',
    end: 'סיום',
  },
} as const;

const TREND_COPY: Readonly<
  Record<PreMealTrend, Readonly<Record<DestinationLocale, string>>>
> = {
  'double-up': {en: '⇈ rising quickly', he: '⇈ עולה במהירות'},
  up: {en: '↑ rising', he: '↑ עולה'},
  'forty-five-up': {en: '↗ rising gently', he: '↗ עולה במתינות'},
  flat: {en: '→ steady', he: '→ יציב'},
  'forty-five-down': {en: '↘ falling gently', he: '↘ יורד במתינות'},
  down: {en: '↓ falling', he: '↓ יורד'},
  'double-down': {en: '⇊ falling quickly', he: '⇊ יורד במהירות'},
};

export interface PreMealAssistanceCardProps {
  readonly locale: DestinationLocale;
  readonly period: DayGraphPeriod;
  readonly runtime: PreMealAssistanceRuntime;
  readonly now?: () => number;
}

type ContextState =
  | {readonly kind: 'empty'}
  | {readonly kind: 'ready'; readonly snapshot: PreMealAssistanceSnapshot};

const systemNow = (): number => Date.now();

const formatNumber = (value: number, maximumFractionDigits: number): string =>
  new Intl.NumberFormat('en-US', {maximumFractionDigits}).format(value);

export const PreMealAssistanceCard = ({
  locale,
  period,
  runtime,
  now = systemNow,
}: PreMealAssistanceCardProps) => {
  const [state, setState] = useState<ContextState>({kind: 'empty'});
  const [, setClockTick] = useState(0);
  const requestSequence = useRef(0);
  const currentNowMs = now();
  const currentDay =
    currentNowMs >= period.dayStartMs && currentNowMs < period.dayEndMs;

  useEffect(() => {
    const request = requestSequence.current + 1;
    requestSequence.current = request;
    let active = true;
    setState({kind: 'empty'});
    if (!runtime.settings.enabled || !currentDay) {
      return () => {
        active = false;
      };
    }
    const requestedAtMs = now();
    runtime.dataSource
      .loadContext({nowMs: requestedAtMs, period})
      .then(snapshot => {
        if (active && requestSequence.current === request) {
          setState({kind: 'ready', snapshot});
        }
      })
      .catch(() => {
        if (active && requestSequence.current === request) {
          setState({kind: 'empty'});
        }
      });
    return () => {
      active = false;
    };
  }, [
    currentDay,
    now,
    period,
    runtime.dataSource,
    runtime.settings.enabled,
  ]);

  useEffect(() => {
    if (state.kind !== 'ready') {
      return undefined;
    }
    const interval = setInterval(() => setClockTick(value => value + 1), 30_000);
    return () => clearInterval(interval);
  }, [state.kind]);

  const eligibility =
    state.kind === 'ready'
      ? evaluatePreMealAssistance({
          nowMs: now(),
          period,
          settings: runtime.settings,
          snapshot: state.snapshot,
        })
      : undefined;

  if (!eligibility || eligibility.kind === 'hidden') {
    return null;
  }

  const copy = COPY[locale];
  const rtl = locale === 'he';
  const facts = eligibility.facts;
  const status = copy[eligibility.availability];
  const age =
    eligibility.ageMinutes === undefined
      ? undefined
      : eligibility.ageMinutes === 0
        ? copy.now
        : copy.minutesAgo(eligibility.ageMinutes);
  const metrics = [
    facts?.glucoseMgDl === undefined
      ? undefined
      : {label: copy.glucose, value: `${formatNumber(facts.glucoseMgDl, 0)} mg/dL`},
    facts?.trend === undefined
      ? undefined
      : {label: copy.trend, value: TREND_COPY[facts.trend][locale]},
    age === undefined ? undefined : {label: '', value: age},
    facts?.iobUnits === undefined
      ? undefined
      : {label: '', value: `IOB ${formatNumber(facts.iobUnits, 2)} U`},
    facts?.cobGrams === undefined
      ? undefined
      : {label: '', value: `COB ${formatNumber(facts.cobGrams, 1)} g`},
  ].filter((metric): metric is {label: string; value: string} => metric !== undefined);

  return (
    <View
      accessible
      accessibilityLabel={`${copy.title}. ${status}. ${metrics
        .map(metric => `${metric.label} ${metric.value}`.trim())
        .join('. ')}`}
      style={styles.card}
      testID="pre-meal-assistance-card">
      <View style={[styles.header, rtl && styles.rowReverse]}>
        <View style={[styles.titleBlock, rtl && styles.alignEnd]}>
          <Text style={[styles.eyebrow, rtl && styles.rtlText]}>◷</Text>
          <Text style={[styles.title, rtl && styles.rtlText]}>{copy.title}</Text>
        </View>
        <Text
          style={[
            styles.status,
            eligibility.availability !== 'current' && styles.statusWarning,
            rtl && styles.rtlText,
          ]}>
          {status}
        </Text>
      </View>
      <Text style={[styles.description, rtl && styles.rtlText]}>
        {copy.description}
      </Text>
      {metrics.length === 0 ? (
        <Text style={[styles.emptyText, rtl && styles.rtlText]}>
          {copy.noFacts}
        </Text>
      ) : (
        <View style={[styles.metrics, rtl && styles.rowReverse]}>
          {metrics.map(metric => (
            <View key={`${metric.label}:${metric.value}`} style={styles.metric}>
              {metric.label ? (
                <Text style={[styles.metricLabel, rtl && styles.rtlText]}>
                  {metric.label}
                </Text>
              ) : null}
              <Text style={[styles.metricValue, rtl && styles.rtlText]}>
                {metric.value}
              </Text>
            </View>
          ))}
        </View>
      )}
      {runtime.onOpenMeals || runtime.onOpenAi || runtime.onClearIntent ? (
        <View style={[styles.actions, rtl && styles.rowReverse]}>
          {runtime.onOpenMeals ? (
            <Pressable
              accessibilityRole="button"
              onPress={runtime.onOpenMeals}
              style={({pressed}) => [styles.primaryAction, pressed && styles.pressed]}
              testID="pre-meal-open-meals">
              <Text style={styles.primaryActionText}>{copy.openMeals}</Text>
            </Pressable>
          ) : null}
          {runtime.onOpenAi ? (
            <Pressable
              accessibilityRole="button"
              onPress={runtime.onOpenAi}
              style={({pressed}) => [styles.secondaryAction, pressed && styles.pressed]}
              testID="pre-meal-open-ai">
              <Text style={styles.secondaryActionText}>{copy.openAi}</Text>
            </Pressable>
          ) : null}
          {runtime.onClearIntent ? (
            <Pressable
              accessibilityRole="button"
              onPress={runtime.onClearIntent}
              style={({pressed}) => [styles.tertiaryAction, pressed && styles.pressed]}
              testID="pre-meal-clear-intent">
              <Text style={styles.tertiaryActionText}>{copy.end}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  rowReverse: {flexDirection: 'row-reverse'},
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  alignEnd: {alignItems: 'flex-end'},
  pressed: {opacity: productUiTokens.opacity.pressed},
  card: {
    backgroundColor: '#EEF6FF',
    borderColor: '#93C5FD',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.lg,
    padding: productUiTokens.spacing.lg,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleBlock: {alignItems: 'center', flexDirection: 'row'},
  eyebrow: {color: '#1D4ED8', fontSize: 20, marginEnd: productUiTokens.spacing.sm},
  title: {color: '#172554', fontSize: 18, fontWeight: '900'},
  status: {
    backgroundColor: '#DBEAFE',
    borderRadius: productUiTokens.radii.pill,
    color: '#1E40AF',
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: productUiTokens.spacing.sm,
    paddingVertical: productUiTokens.spacing.xs,
  },
  statusWarning: {backgroundColor: '#FFF7ED', color: '#9A3412'},
  description: {color: '#334155', lineHeight: 20, marginTop: productUiTokens.spacing.sm},
  emptyText: {color: '#64748B', marginTop: productUiTokens.spacing.md},
  metrics: {flexDirection: 'row', flexWrap: 'wrap', marginTop: productUiTokens.spacing.md},
  metric: {
    backgroundColor: '#FFFFFF',
    borderRadius: productUiTokens.radii.card,
    marginBottom: productUiTokens.spacing.sm,
    marginEnd: productUiTokens.spacing.sm,
    minWidth: 104,
    paddingHorizontal: productUiTokens.spacing.md,
    paddingVertical: productUiTokens.spacing.sm,
  },
  metricLabel: {color: '#64748B', fontSize: 11, fontWeight: '700'},
  metricValue: {color: '#172554', fontWeight: '900', marginTop: 2},
  actions: {flexDirection: 'row', flexWrap: 'wrap', marginTop: productUiTokens.spacing.sm},
  primaryAction: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: productUiTokens.radii.pill,
    justifyContent: 'center',
    marginEnd: productUiTokens.spacing.sm,
    marginTop: productUiTokens.spacing.xs,
    minHeight: 44,
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  primaryActionText: {color: '#FFFFFF', fontWeight: '900'},
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#60A5FA',
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: productUiTokens.spacing.xs,
    minHeight: 44,
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  secondaryActionText: {color: '#1D4ED8', fontWeight: '900'},
  tertiaryAction: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: productUiTokens.spacing.xs,
    minHeight: 44,
    paddingHorizontal: productUiTokens.spacing.md,
  },
  tertiaryActionText: {color: '#475569', fontWeight: '800'},
});
