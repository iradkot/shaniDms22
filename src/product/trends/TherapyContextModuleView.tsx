import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  assertTherapyContextSnapshot,
  evaluateTherapyContextAvailability,
  type ObservedAidModeSummary,
  type TherapyContextDataSource,
  type TherapyContextQualityGateInput,
  type TherapyContextSnapshot,
  type TrendsPeriod,
} from '../../modules/trends';
import type {DestinationLocale} from '../destinations';
import {
  ProductPage,
  ProductSection,
  ResponsiveGrid,
  productUiTokens,
} from '../ui';
import {TrendsEvidenceMetadataView} from './TrendsEvidenceMetadataView';

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS = [14, 30, 90] as const;
type RangeDays = (typeof RANGE_DAYS)[number];

const COPY = {
  en: {
    title: 'Therapy context',
    subtitle:
      'Recorded therapy and activity alongside glucose evidence. This view does not suggest changes.',
    period: 'Period',
    days: 'days',
    loading: 'Loading recorded therapy context…',
    failed: 'Therapy Context could not be loaded.',
    retry: 'Try again',
    unverified:
      'The source is not yet classified reliably enough for Therapy Context.',
    lowCoverage:
      'Therapy Context stays hidden until source coverage reaches 70%.',
    evidence: 'Evidence details',
    recorded: 'Recorded context',
    insulin: 'Insulin recorded',
    carbs: 'Carbohydrates recorded',
    meals: 'Meals recorded',
    activity: 'Activity recorded',
    aidAvailability: 'AID availability',
    aid: 'Observed AID periods',
    closedLoop: 'Closed Loop periods',
    openLoop: 'Open Loop periods',
    hours: 'hours',
    inRange: 'in range',
    noModeRange: 'range metric unavailable',
    neutral:
      'These are observations from the same periods. They do not establish why values differed.',
    noFacts: 'No classified context facts are available in this period.',
  },
  he: {
    title: 'הקשר טיפולי',
    subtitle:
      'טיפול ופעילות שתועדו לצד ראיות הסוכר. התצוגה אינה מציעה שינויים.',
    period: 'תקופה',
    days: 'ימים',
    loading: 'טוען את ההקשר הטיפולי שתועד…',
    failed: 'לא הצלחנו לטעון את ההקשר הטיפולי.',
    retry: 'ניסיון נוסף',
    unverified: 'המקור עדיין לא מסווג באופן אמין מספיק להצגת הקשר טיפולי.',
    lowCoverage: 'ההקשר הטיפולי נשאר מוסתר עד שכיסוי המקור מגיע ל־70%.',
    evidence: 'פרטי הראיות',
    recorded: 'הקשר שתועד',
    insulin: 'אינסולין שתועד',
    carbs: 'פחמימות שתועדו',
    meals: 'ארוחות שתועדו',
    activity: 'פעילות שתועדה',
    aidAvailability: 'זמינות AID',
    aid: 'תקופות AID שנצפו',
    closedLoop: 'תקופות Closed Loop',
    openLoop: 'תקופות Open Loop',
    hours: 'שעות',
    inRange: 'בטווח',
    noModeRange: 'מדד הטווח אינו זמין',
    neutral:
      'אלו תצפיות מאותן תקופות. הן אינן קובעות מדוע הערכים היו שונים.',
    noFacts: 'אין עובדות הקשר מסווגות בתקופה הזו.',
  },
} as const;

type LoadState =
  | {readonly kind: 'loading'}
  | {readonly kind: 'error'}
  | {readonly kind: 'unavailable'; readonly reason: 'unverified' | 'coverage'}
  | {readonly kind: 'ready'; readonly snapshot: TherapyContextSnapshot};

export interface TherapyContextModuleViewProps {
  readonly locale: DestinationLocale;
  readonly dataSource: TherapyContextDataSource;
  readonly quality: TherapyContextQualityGateInput;
  readonly now?: () => number;
}

const systemNow = (): number => Date.now();

const initialState = (
  quality: TherapyContextQualityGateInput,
): LoadState => {
  const gate = evaluateTherapyContextAvailability(quality);
  if (gate.available) {
    return {kind: 'loading'};
  }
  return {
    kind: 'unavailable',
    reason: gate.reason === 'coverage-low' ? 'coverage' : 'unverified',
  };
};

const FactCard = ({
  label,
  locale,
  value,
}: {
  readonly label: string;
  readonly locale: DestinationLocale;
  readonly value: string;
}) => (
  <View style={styles.factCard}>
    <Text style={[styles.factLabel, locale === 'he' && styles.rtlText]}>
      {label}
    </Text>
    <Text style={[styles.factValue, locale === 'he' && styles.rtlText]}>
      {value}
    </Text>
  </View>
);

const modeLabel = (
  mode: ObservedAidModeSummary,
  locale: DestinationLocale,
): string => {
  const copy = COPY[locale];
  const title =
    mode.mode === 'closed-loop' ? copy.closedLoop : copy.openLoop;
  const range =
    mode.targetRangePercent === undefined
      ? copy.noModeRange
      : `${mode.targetRangePercent}% ${copy.inRange}`;
  return `${title} ${mode.observedHours} ${copy.hours} · ${range}`;
};

export const TherapyContextModuleView = ({
  locale,
  dataSource,
  quality,
  now = systemNow,
}: TherapyContextModuleViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const [rangeDays, setRangeDays] = useState<RangeDays>(14);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<LoadState>(() => initialState(quality));
  const requestSequence = useRef(0);
  const period = useMemo<TrendsPeriod>(() => {
    const endMs = now();
    return {startMs: endMs - rangeDays * DAY_MS, endMs};
  }, [now, rangeDays]);

  useEffect(() => {
    const gate = evaluateTherapyContextAvailability(quality);
    const request = requestSequence.current + 1;
    requestSequence.current = request;
    if (!gate.available) {
      setState({
        kind: 'unavailable',
        reason: gate.reason === 'coverage-low' ? 'coverage' : 'unverified',
      });
      return undefined;
    }

    let active = true;
    setState({kind: 'loading'});
    dataSource
      .loadTherapyContext(period)
      .then(snapshot => {
        if (!active || requestSequence.current !== request) {
          return;
        }
        assertTherapyContextSnapshot(snapshot);
        if (
          snapshot.period.startMs !== period.startMs ||
          snapshot.period.endMs !== period.endMs
        ) {
          throw new Error('Therapy Context returned a different period.');
        }
        const loadedGate = evaluateTherapyContextAvailability(snapshot.quality);
        setState(
          loadedGate.available
            ? {kind: 'ready', snapshot}
            : {
                kind: 'unavailable',
                reason:
                  loadedGate.reason === 'coverage-low'
                    ? 'coverage'
                    : 'unverified',
              },
        );
      })
      .catch(() => {
        if (active && requestSequence.current === request) {
          setState({kind: 'error'});
        }
      });
    return () => {
      active = false;
    };
  }, [dataSource, period, quality, reload]);

  const optionalFact = (
    label: string,
    value: string | undefined,
  ): readonly {readonly label: string; readonly value: string}[] =>
    value === undefined ? [] : [{label, value}];
  const facts =
    state.kind === 'ready'
      ? [
          ...optionalFact(
            copy.insulin,
            state.snapshot.totals.insulinUnits === undefined
              ? undefined
              : `${state.snapshot.totals.insulinUnits} U`,
          ),
          ...optionalFact(
            copy.carbs,
            state.snapshot.totals.carbohydrateGrams === undefined
              ? undefined
              : `${state.snapshot.totals.carbohydrateGrams} g`,
          ),
          ...optionalFact(
            copy.meals,
            state.snapshot.totals.mealCount === undefined
              ? undefined
              : String(state.snapshot.totals.mealCount),
          ),
          ...optionalFact(
            copy.activity,
            state.snapshot.totals.activityMinutes === undefined
              ? undefined
              : `${state.snapshot.totals.activityMinutes} min`,
          ),
          ...optionalFact(
            copy.aidAvailability,
            state.snapshot.totals.aidAvailabilityPercent === undefined
              ? undefined
              : `${state.snapshot.totals.aidAvailabilityPercent}%`,
          ),
        ]
      : [];

  return (
    <ProductPage
      locale={locale}
      subtitle={copy.subtitle}
      testID="therapy-context-view"
      title={copy.title}>
      <ProductSection locale={locale} title={copy.period}>
        <View style={[styles.selector, rtl && styles.rowReverse]}>
          {RANGE_DAYS.map(days => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{selected: days === rangeDays}}
              key={days}
              onPress={() => setRangeDays(days)}
              style={({pressed}) => [
                styles.selectorButton,
                days === rangeDays && styles.selectorButtonSelected,
                pressed && styles.pressed,
              ]}
              testID={`therapy-context-range-${days}`}>
              <Text
                style={[
                  styles.selectorText,
                  days === rangeDays && styles.selectorTextSelected,
                ]}>
                {days} {copy.days}
              </Text>
            </Pressable>
          ))}
        </View>
      </ProductSection>

      {state.kind === 'unavailable' ? (
        <View style={styles.stateCard} testID="therapy-context-unavailable">
          <Text style={[styles.warning, rtl && styles.rtlText]}>
            {state.reason === 'coverage' ? copy.lowCoverage : copy.unverified}
          </Text>
        </View>
      ) : state.kind === 'loading' ? (
        <View style={styles.stateCard} testID="therapy-context-loading">
          <ActivityIndicator color={productUiTokens.colors.action} />
          <Text style={[styles.stateText, rtl && styles.rtlText]}>
            {copy.loading}
          </Text>
        </View>
      ) : state.kind === 'error' ? (
        <View style={styles.stateCard} testID="therapy-context-error">
          <Text style={[styles.warning, rtl && styles.rtlText]}>
            {copy.failed}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setReload(value => value + 1)}
            style={({pressed}) => [
              styles.retryButton,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.retryText}>{copy.retry}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ProductSection locale={locale} title={copy.evidence}>
            <TrendsEvidenceMetadataView
              locale={locale}
              metadata={state.snapshot.evidence}
            />
          </ProductSection>

          <ProductSection locale={locale} title={copy.recorded}>
            {facts.length === 0 ? (
              <Text style={[styles.stateText, rtl && styles.rtlText]}>
                {copy.noFacts}
              </Text>
            ) : (
              <ResponsiveGrid locale={locale} testID="therapy-context-facts">
                {facts.map(fact => (
                  <FactCard
                    key={fact.label}
                    label={fact.label}
                    locale={locale}
                    value={fact.value}
                  />
                ))}
              </ResponsiveGrid>
            )}
          </ProductSection>

          {state.snapshot.aidModes.length > 0 ? (
            <ProductSection locale={locale} title={copy.aid}>
              <View style={styles.aidCard} testID="therapy-context-aid-modes">
                {state.snapshot.aidModes.map(mode => (
                  <Text
                    key={mode.mode}
                    style={[styles.modeText, rtl && styles.rtlText]}>
                    {modeLabel(mode, locale)}
                  </Text>
                ))}
                <Text style={[styles.neutral, rtl && styles.rtlText]}>
                  {copy.neutral}
                </Text>
              </View>
            </ProductSection>
          ) : null}
        </>
      )}
    </ProductPage>
  );
};

const styles = StyleSheet.create({
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  rowReverse: {flexDirection: 'row-reverse'},
  pressed: {opacity: productUiTokens.opacity.pressed},
  selector: {flexDirection: 'row', flexWrap: 'wrap'},
  selectorButton: {
    alignItems: 'center',
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: productUiTokens.spacing.sm,
    marginEnd: productUiTokens.spacing.sm,
    minHeight: 42,
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  selectorButtonSelected: {backgroundColor: productUiTokens.colors.action},
  selectorText: {color: productUiTokens.colors.text, fontWeight: '700'},
  selectorTextSelected: {color: productUiTokens.colors.actionText},
  stateCard: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.surface,
    borderRadius: productUiTokens.radii.card,
    marginTop: productUiTokens.spacing.lg,
    padding: productUiTokens.spacing.xl,
  },
  stateText: {
    color: productUiTokens.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: productUiTokens.spacing.sm,
  },
  warning: {color: '#9A3412', fontWeight: '700', lineHeight: 20},
  retryButton: {
    backgroundColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    marginTop: productUiTokens.spacing.md,
    paddingHorizontal: productUiTokens.spacing.lg,
    paddingVertical: productUiTokens.spacing.md,
  },
  retryText: {color: productUiTokens.colors.actionText, fontWeight: '700'},
  factCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    minHeight: 82,
    padding: productUiTokens.spacing.md,
    width: '100%',
  },
  factLabel: {color: productUiTokens.colors.textMuted, fontSize: 12},
  factValue: {
    color: productUiTokens.colors.text,
    fontSize: 21,
    fontWeight: '800',
    marginTop: productUiTokens.spacing.sm,
  },
  aidCard: {
    backgroundColor: productUiTokens.colors.surfaceInfo,
    borderRadius: productUiTokens.radii.card,
    padding: productUiTokens.spacing.lg,
  },
  modeText: {color: productUiTokens.colors.text, lineHeight: 22},
  neutral: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: productUiTokens.spacing.md,
  },
});
