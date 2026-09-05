import React, {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {DayGraphDataSource} from '../../modules/dayGraph';
import {
  buildRepeatedObservation,
  selectComparableMealSet,
  type ComparableMealFacts,
  type EventOutcome,
  type EventOutcomeSubject,
  type RepeatedObservation,
} from '../../modules/eventOutcomes';
import {loadEventOutcomeFromDayGraph} from './runtime';

type Locale = 'en' | 'he';

const COPY = {
  en: {
    title: 'Observed glucose around this event',
    loading: 'Loading glucose evidence…',
    unavailable: 'The evidence could not be loaded. The Journal Entry is safe.',
    noBaseline: 'Baseline unavailable',
    baseline: (value: number) => `Before: ${value} mg/dL`,
    peak: (value: number, rise: number | null) =>
      rise === null
        ? `Observed peak: ${value} mg/dL`
        : `Observed peak: ${value} mg/dL (${rise >= 0 ? '+' : ''}${rise})`,
    twoHour: (value: number) => `At 2 hours: ${value} mg/dL`,
    coverage: (value: number) => `Data coverage: ${value}%`,
    iauc: (value: number) => `Advanced: Meal iAUC 0–2h ${value} mg/dL·h`,
    iaucHelp:
      'Positive area above the glucose at Meal Start. Formula v1; not a score.',
    incomplete: 'Advanced meal metric unavailable because evidence is incomplete.',
    overlap: (count: number) =>
      `${count} overlapping context item${count === 1 ? '' : 's'}; excluded from repeated observations.`,
    neutral:
      'This describes what was observed in the selected window. It does not prove what caused it.',
    compare: 'Compare similar meals',
    comparing: 'Checking comparable meals…',
    compareError: 'Comparable meals could not be loaded.',
    noComparable: 'No sufficiently complete comparable meals were found.',
    comparableCount: (count: number) =>
      `${count} comparable meal${count === 1 ? '' : 's'} matched by visible facts.`,
    repeated: (sampleSize: number, days: number) =>
      `Repeated observation: ${sampleSize} meals across ${days} days.`,
    repeatedPeak: (median: number, minimum: number, maximum: number) =>
      `Peak rise median ${median} mg/dL; range ${minimum}–${maximum}.`,
    repeatedIauc: (median: number, minimum: number, maximum: number) =>
      `Meal iAUC median ${median}; range ${minimum}–${maximum} mg/dL·h.`,
    comparisonFacts: 'Matched by name, tags, and carbohydrate range when available.',
  },
  he: {
    title: 'הסוכר שנצפה סביב האירוע',
    loading: 'טוען נתוני סוכר…',
    unavailable: 'לא הצלחנו לטעון את הנתונים. הרשומה ביומן נשארה שמורה.',
    noBaseline: 'אין נתון בסיס זמין',
    baseline: (value: number) => `לפני: ${value} מ״ג/ד״ל`,
    peak: (value: number, rise: number | null) =>
      rise === null
        ? `שיא שנצפה: ${value} מ״ג/ד״ל`
        : `שיא שנצפה: ${value} מ״ג/ד״ל (${rise >= 0 ? '+' : ''}${rise})`,
    twoHour: (value: number) => `אחרי שעתיים: ${value} מ״ג/ד״ל`,
    coverage: (value: number) => `כיסוי נתונים: ${value}%`,
    iauc: (value: number) => `מתקדם: Meal iAUC ‏0–2 שעות ${value} מ״ג/ד״ל·שעה`,
    iaucHelp:
      'השטח החיובי מעל הסוכר בזמן תחילת הארוחה. נוסחה v1; זה אינו ציון.',
    incomplete: 'המדד המתקדם לארוחה אינו זמין כי הנתונים חלקיים.',
    overlap: (count: number) =>
      `${count} פריטי הקשר חופפים; התוצאה לא נכללת בתצפיות חוזרות.`,
    neutral:
      'זהו תיאור של מה שנצפה בחלון הזמן. הוא אינו מוכיח מה גרם לכך.',
    compare: 'השוואה לארוחות דומות',
    comparing: 'בודק ארוחות שאפשר להשוות…',
    compareError: 'לא הצלחנו לטעון את השוואת הארוחות.',
    noComparable: 'לא נמצאו ארוחות דומות עם נתונים מלאים מספיק.',
    comparableCount: (count: number) =>
      `${count} ארוחות דומות התאימו לפי עובדות גלויות.`,
    repeated: (sampleSize: number, days: number) =>
      `תצפית חוזרת: ${sampleSize} ארוחות על פני ${days} ימים.`,
    repeatedPeak: (median: number, minimum: number, maximum: number) =>
      `חציון העלייה לשיא ${median} מ״ג/ד״ל; טווח ${minimum}–${maximum}.`,
    repeatedIauc: (median: number, minimum: number, maximum: number) =>
      `חציון Meal iAUC הוא ${median}; טווח ${minimum}–${maximum} מ״ג/ד״ל·שעה.`,
    comparisonFacts: 'ההתאמה מבוססת על שם, תגיות וטווח פחמימות כשהם זמינים.',
  },
} as const;

type OutcomeState =
  | {readonly status: 'loading'}
  | {readonly status: 'error'}
  | {readonly status: 'ready'; readonly outcome: EventOutcome};

type ComparisonState =
  | {readonly status: 'idle'}
  | {readonly status: 'loading'}
  | {readonly status: 'error'}
  | {
      readonly status: 'ready';
      readonly matchCount: number;
      readonly observation: RepeatedObservation;
    };

export interface EventOutcomeCardProps {
  readonly subject: EventOutcomeSubject;
  readonly dataSource: DayGraphDataSource;
  readonly locale: Locale;
  readonly expectedSampleIntervalMs?: number;
  readonly comparableMeals?: readonly ComparableMealFacts[];
}

export const EventOutcomeCard = ({
  subject,
  dataSource,
  locale,
  expectedSampleIntervalMs,
  comparableMeals,
}: EventOutcomeCardProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const stableSubject = useMemo<EventOutcomeSubject>(
    () => ({
      kind: subject.kind,
      id: subject.id,
      startedAtMs: subject.startedAtMs,
      ...(subject.endedAtMs === undefined
        ? {}
        : {endedAtMs: subject.endedAtMs}),
    }),
    [subject.endedAtMs, subject.id, subject.kind, subject.startedAtMs],
  );
  const [state, setState] = useState<OutcomeState>({status: 'loading'});
  const [comparison, setComparison] = useState<ComparisonState>({
    status: 'idle',
  });

  useEffect(() => {
    let active = true;
    setState({status: 'loading'});
    setComparison({status: 'idle'});
    loadEventOutcomeFromDayGraph({
      dataSource,
      subject: stableSubject,
      ...(expectedSampleIntervalMs === undefined
        ? {}
        : {expectedSampleIntervalMs}),
    }).then(
      outcome => active && setState({status: 'ready', outcome}),
      () => active && setState({status: 'error'}),
    );
    return () => {
      active = false;
    };
  }, [
    dataSource,
    expectedSampleIntervalMs,
    stableSubject,
  ]);

  const anchor = useMemo<ComparableMealFacts | undefined>(() => {
    if (subject.kind !== 'meal' || state.status !== 'ready') {return undefined;}
    return comparableMeals?.find(meal => meal.id === subject.id) ?? {
      id: subject.id,
      mealStartMs: subject.startedAtMs,
      tags: [],
      outcome: state.outcome,
    };
  }, [comparableMeals, state, subject]);

  const compare = async (): Promise<void> => {
    if (!anchor || !comparableMeals || state.status !== 'ready') {return;}
    setComparison({status: 'loading'});
    try {
      const candidateFacts = comparableMeals.filter(meal => meal.id !== anchor.id);
      const withOutcomes = await Promise.all(
        candidateFacts.map(async meal => ({
          ...meal,
          outcome: await loadEventOutcomeFromDayGraph({
            dataSource,
            subject: {
              kind: 'meal',
              id: meal.id,
              startedAtMs: meal.mealStartMs,
            },
            ...(expectedSampleIntervalMs === undefined
              ? {}
              : {expectedSampleIntervalMs}),
          }),
        })),
      );
      const set = selectComparableMealSet({
        anchor: {...anchor, outcome: state.outcome},
        candidates: withOutcomes,
      });
      const observation = buildRepeatedObservation({
        outcomes: [state.outcome, ...set.matches.map(match => match.meal.outcome!)],
      });
      setComparison({
        status: 'ready',
        matchCount: set.matches.length,
        observation,
      });
    } catch {
      setComparison({status: 'error'});
    }
  };

  return (
    <View style={styles.card} testID="event-outcome-card">
      <Text
        accessibilityRole="header"
        style={[styles.title, rtl && styles.rtlText]}>
        {copy.title}
      </Text>
      {state.status === 'loading' ? (
        <Text style={[styles.body, rtl && styles.rtlText]}>{copy.loading}</Text>
      ) : state.status === 'error' ? (
        <Text style={[styles.error, rtl && styles.rtlText]}>
          {copy.unavailable}
        </Text>
      ) : (
        <>
          <View style={styles.metricGrid}>
            <Text style={[styles.metric, rtl && styles.rtlText]}>
              {state.outcome.glucose.baselineMgDl === null
                ? copy.noBaseline
                : copy.baseline(state.outcome.glucose.baselineMgDl)}
            </Text>
            {state.outcome.glucose.peakMgDl === null ? null : (
              <Text style={[styles.metric, rtl && styles.rtlText]}>
                {copy.peak(
                  state.outcome.glucose.peakMgDl,
                  state.outcome.glucose.peakRiseMgDl,
                )}
              </Text>
            )}
            {state.outcome.glucose.twoHourMgDl === null ? null : (
              <Text style={[styles.metric, rtl && styles.rtlText]}>
                {copy.twoHour(state.outcome.glucose.twoHourMgDl)}
              </Text>
            )}
            <Text style={[styles.metric, rtl && styles.rtlText]}>
              {copy.coverage(state.outcome.quality.coveragePercent)}
            </Text>
          </View>
          {subject.kind === 'meal' ? (
            state.outcome.advanced.mealIauc0To2h.status === 'available' ? (
              <View style={styles.advanced}>
                <Text style={[styles.advancedValue, rtl && styles.rtlText]}>
                  {copy.iauc(
                    state.outcome.advanced.mealIauc0To2h.valueMgDlHours,
                  )}
                </Text>
                <Text style={[styles.help, rtl && styles.rtlText]}>
                  {copy.iaucHelp}
                </Text>
              </View>
            ) : (
              <Text style={[styles.help, rtl && styles.rtlText]}>
                {copy.incomplete}
              </Text>
            )
          ) : null}
          {state.outcome.quality.overlapCount > 0 ? (
            <Text style={[styles.warning, rtl && styles.rtlText]}>
              {copy.overlap(state.outcome.quality.overlapCount)}
            </Text>
          ) : null}
          <Text style={[styles.neutral, rtl && styles.rtlText]}>
            {copy.neutral}
          </Text>
          {subject.kind === 'meal' && comparableMeals ? (
            <View style={styles.comparison}>
              <Pressable
                accessibilityRole="button"
                disabled={comparison.status === 'loading'}
                onPress={compare}
                style={({pressed}) => [
                  styles.button,
                  pressed && styles.pressed,
                ]}
                testID="event-outcome-compare-meals">
                <Text style={styles.buttonLabel}>
                  {comparison.status === 'loading'
                    ? copy.comparing
                    : copy.compare}
                </Text>
              </Pressable>
              {comparison.status === 'error' ? (
                <Text style={[styles.error, rtl && styles.rtlText]}>
                  {copy.compareError}
                </Text>
              ) : comparison.status === 'ready' ? (
                comparison.matchCount === 0 ? (
                  <Text style={[styles.body, rtl && styles.rtlText]}>
                    {copy.noComparable}
                  </Text>
                ) : (
                  <View testID="event-outcome-repeated-observation">
                    <Text style={[styles.bodyStrong, rtl && styles.rtlText]}>
                      {copy.comparableCount(comparison.matchCount)}
                    </Text>
                    <Text style={[styles.help, rtl && styles.rtlText]}>
                      {copy.comparisonFacts}
                    </Text>
                    {comparison.observation.status === 'available' ? (
                      <>
                        <Text style={[styles.bodyStrong, rtl && styles.rtlText]}>
                          {copy.repeated(
                            comparison.observation.sampleSize,
                            comparison.observation.dateCoverage.days,
                          )}
                        </Text>
                        <Text style={[styles.body, rtl && styles.rtlText]}>
                          {copy.repeatedPeak(
                            comparison.observation.metrics.peakRiseMgDl.median,
                            comparison.observation.metrics.peakRiseMgDl.minimum,
                            comparison.observation.metrics.peakRiseMgDl.maximum,
                          )}
                        </Text>
                        <Text style={[styles.body, rtl && styles.rtlText]}>
                          {copy.repeatedIauc(
                            comparison.observation.metrics
                              .mealIauc0To2hMgDlHours.median,
                            comparison.observation.metrics
                              .mealIauc0To2hMgDlHours.minimum,
                            comparison.observation.metrics
                              .mealIauc0To2hMgDlHours.maximum,
                          )}
                        </Text>
                      </>
                    ) : null}
                  </View>
                )
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F4F8FD',
    borderColor: '#BFD5EA',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  title: {color: '#17324D', fontSize: 18, fontWeight: '800', marginBottom: 10},
  body: {color: '#38526A', fontSize: 14, lineHeight: 21, marginTop: 6},
  bodyStrong: {color: '#17324D', fontSize: 14, fontWeight: '700', marginTop: 8},
  metricGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  metric: {
    color: '#17324D',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  advanced: {marginTop: 12},
  advancedValue: {color: '#4A2D73', fontSize: 14, fontWeight: '800'},
  help: {color: '#60758A', fontSize: 12, lineHeight: 18, marginTop: 4},
  warning: {
    color: '#714A00',
    backgroundColor: '#FFF2D7',
    borderRadius: 9,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
    padding: 8,
  },
  neutral: {color: '#51687D', fontSize: 12, lineHeight: 18, marginTop: 10},
  error: {color: '#8B2C2C', fontSize: 13, lineHeight: 20, marginTop: 8},
  comparison: {borderTopColor: '#D5E3EF', borderTopWidth: 1, marginTop: 14, paddingTop: 12},
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#225EA8',
    borderRadius: 18,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonLabel: {color: '#FFFFFF', fontSize: 13, fontWeight: '800'},
  pressed: {opacity: 0.72},
});
