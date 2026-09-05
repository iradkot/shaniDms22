import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, {Line, Path, Rect} from 'react-native-svg';
import type {
  DayGraphDataSource,
  DayGraphGlucoseSample,
  DayGraphTimelineItem,
} from '../../modules/dayGraph';
import type {HypoInvestigationEvent} from '../../modules/hypoInvestigation';
import type {TrendsRangeThresholds} from '../../modules/trends';
import type {DestinationLocale} from '../destinations';
import {productUiTokens} from '../ui';

const HOUR_MS = 60 * 60 * 1000;
const GRAPH_WIDTH = 720;
const GRAPH_HEIGHT = 180;
const GRAPH_PADDING = 16;
const MIN_GLUCOSE = 40;
const MAX_GLUCOSE = 300;

const COPY = {
  en: {
    load: 'Load surrounding context',
    loading: 'Loading glucose and nearby records…',
    retry: 'Try context again',
    failed: 'The surrounding records could not be loaded.',
    chart: 'Glucose around this event',
    nearby: 'Nearby records',
    none: 'No insulin, carbohydrate, meal, or activity record was found nearby.',
    stale: 'Saved context is shown because the source is currently unavailable.',
    treatment: 'Treatment',
    carb: 'Carbohydrates',
    meal: 'Meal',
    activity: 'Activity',
    caveat:
      'Timing together is context only. It does not prove what caused the low event.',
  },
  he: {
    load: 'טעינת ההקשר סביב האירוע',
    loading: 'טוען סוכר ורשומות סמוכות…',
    retry: 'ניסיון נוסף לטעינת ההקשר',
    failed: 'לא הצלחנו לטעון את הרשומות סביב האירוע.',
    chart: 'סוכר סביב האירוע',
    nearby: 'רשומות סמוכות',
    none: 'לא נמצאה רשומת אינסולין, פחמימות, ארוחה או פעילות בסביבה.',
    stale: 'מוצג הקשר שמור כי המקור אינו זמין כרגע.',
    treatment: 'טיפול',
    carb: 'פחמימות',
    meal: 'ארוחה',
    activity: 'פעילות',
    caveat:
      'סמיכות בזמן היא הקשר בלבד. היא אינה מוכיחה מה גרם לאירוע הנמוך.',
  },
} as const;

type ContextState =
  | {readonly kind: 'idle'}
  | {readonly kind: 'loading'}
  | {readonly kind: 'error'}
  | {
      readonly kind: 'ready';
      readonly glucose: readonly DayGraphGlucoseSample[];
      readonly timeline: readonly DayGraphTimelineItem[];
      readonly stale: boolean;
    };

export interface HypoEventContextCardProps {
  readonly locale: DestinationLocale;
  readonly event: HypoInvestigationEvent;
  readonly dataSource: DayGraphDataSource;
  readonly thresholds: Pick<
    TrendsRangeThresholds,
    'targetMinMgDl' | 'targetMaxMgDl'
  >;
}

const localDayPeriod = (timestampMs: number) => {
  const start = new Date(timestampMs);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {dayStartMs: start.getTime(), dayEndMs: end.getTime()};
};

const contextPeriods = (startMs: number, endMs: number) => {
  const periods = [];
  let current = localDayPeriod(startMs);
  while (current.dayStartMs < endMs && periods.length < 3) {
    periods.push(current);
    current = localDayPeriod(current.dayEndMs + 1);
  }
  return periods;
};

const graphX = (timestampMs: number, startMs: number, endMs: number): number =>
  GRAPH_PADDING +
  ((timestampMs - startMs) / (endMs - startMs)) *
    (GRAPH_WIDTH - GRAPH_PADDING * 2);

const graphY = (valueMgDl: number): number => {
  const value = Math.max(MIN_GLUCOSE, Math.min(MAX_GLUCOSE, valueMgDl));
  return (
    GRAPH_PADDING +
    ((MAX_GLUCOSE - value) / (MAX_GLUCOSE - MIN_GLUCOSE)) *
      (GRAPH_HEIGHT - GRAPH_PADDING * 2)
  );
};

const tracePath = (
  samples: readonly DayGraphGlucoseSample[],
  startMs: number,
  endMs: number,
): string =>
  samples
    .map(
      (sample, index) =>
        `${index === 0 ? 'M' : 'L'} ${graphX(
          sample.timestampMs,
          startMs,
          endMs,
        ).toFixed(1)} ${graphY(sample.valueMgDl).toFixed(1)}`,
    )
    .join(' ');

const formatTime = (timestampMs: number, locale: DestinationLocale): string =>
  new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestampMs));

const itemKind = (
  item: DayGraphTimelineItem,
  locale: DestinationLocale,
): string => {
  const copy = COPY[locale];
  switch (item.kind) {
    case 'treatment':
      return copy.treatment;
    case 'external-carb':
      return copy.carb;
    case 'journal-meal':
      return copy.meal;
    case 'journal-activity':
      return copy.activity;
  }
};

const itemDetail = (item: DayGraphTimelineItem): string | undefined => {
  if (item.detail !== undefined) {
    return item.detail;
  }
  return (item.kind === 'external-carb' || item.kind === 'journal-meal') &&
    item.carbohydratesGrams !== undefined
    ? `${item.carbohydratesGrams} g`
    : undefined;
};

export const HypoEventContextCard = ({
  locale,
  event,
  dataSource,
  thresholds,
}: HypoEventContextCardProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const [state, setState] = useState<ContextState>({kind: 'idle'});
  const requestSequence = useRef(0);
  const startMs = Math.max(1, event.startMs - 3 * HOUR_MS);
  const endMs = event.endMs + 3 * HOUR_MS;

  const load = async (): Promise<void> => {
    const request = requestSequence.current + 1;
    requestSequence.current = request;
    setState({kind: 'loading'});
    try {
      const snapshots = await Promise.all(
        contextPeriods(startMs, endMs).map(period =>
          dataSource.loadDayGraph(period),
        ),
      );
      if (requestSequence.current !== request) {
        return;
      }
      const glucoseByIdentity = new Map<string, DayGraphGlucoseSample>();
      const timelineByIdentity = new Map<string, DayGraphTimelineItem>();
      snapshots.forEach(snapshot => {
        snapshot.glucoseSamples.forEach(sample => {
          if (sample.timestampMs >= startMs && sample.timestampMs <= endMs) {
            glucoseByIdentity.set(
              `${sample.identity.sourceId}:${sample.identity.recordId}`,
              sample,
            );
          }
        });
        snapshot.timelineItems.forEach(item => {
          if (item.timestampMs >= startMs && item.timestampMs <= endMs) {
            timelineByIdentity.set(
              `${item.identity.sourceId}:${item.identity.recordId}`,
              item,
            );
          }
        });
      });
      setState({
        kind: 'ready',
        glucose: [...glucoseByIdentity.values()].sort(
          (left, right) => left.timestampMs - right.timestampMs,
        ),
        timeline: [...timelineByIdentity.values()].sort(
          (left, right) => left.timestampMs - right.timestampMs,
        ),
        stale: snapshots.some(snapshot => snapshot.freshness.kind === 'stale'),
      });
    } catch {
      if (requestSequence.current === request) {
        setState({kind: 'error'});
      }
    }
  };

  if (state.kind === 'idle') {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => load().catch(() => undefined)}
        style={styles.loadButton}
        testID="hypo-load-context">
        <Text style={styles.loadButtonText}>{copy.load}</Text>
      </Pressable>
    );
  }
  if (state.kind === 'loading') {
    return (
      <View style={styles.status} testID="hypo-context-loading">
        <ActivityIndicator color={productUiTokens.colors.action} />
        <Text style={[styles.statusText, rtl && styles.rtlText]}>
          {copy.loading}
        </Text>
      </View>
    );
  }
  if (state.kind === 'error') {
    return (
      <View style={styles.status} testID="hypo-context-error">
        <Text style={[styles.errorText, rtl && styles.rtlText]}>
          {copy.failed}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => load().catch(() => undefined)}
          style={styles.loadButton}>
          <Text style={styles.loadButtonText}>{copy.retry}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.context} testID="hypo-event-context">
      <Text style={[styles.heading, rtl && styles.rtlText]}>{copy.chart}</Text>
      {state.glucose.length > 0 ? (
        <Svg
          accessibilityLabel={`${copy.chart}: ${state.glucose.length}`}
          height={GRAPH_HEIGHT}
          style={styles.graph}
          viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
          width="100%">
          <Rect
            fill="#DCFCE7"
            height={Math.max(
              1,
              graphY(thresholds.targetMinMgDl) -
                graphY(thresholds.targetMaxMgDl),
            )}
            width={GRAPH_WIDTH - GRAPH_PADDING * 2}
            x={GRAPH_PADDING}
            y={graphY(thresholds.targetMaxMgDl)}
          />
          <Rect
            fill="#FCA5A566"
            height={GRAPH_HEIGHT - GRAPH_PADDING * 2}
            width={Math.max(
              2,
              graphX(event.endMs, startMs, endMs) -
                graphX(event.startMs, startMs, endMs),
            )}
            x={graphX(event.startMs, startMs, endMs)}
            y={GRAPH_PADDING}
          />
          <Line
            stroke="#DC2626"
            strokeDasharray="5 4"
            strokeWidth={2}
            x1={graphX(event.nadirTimestampMs, startMs, endMs)}
            x2={graphX(event.nadirTimestampMs, startMs, endMs)}
            y1={GRAPH_PADDING}
            y2={GRAPH_HEIGHT - GRAPH_PADDING}
          />
          <Path
            d={tracePath(state.glucose, startMs, endMs)}
            fill="none"
            stroke="#2563EB"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
        </Svg>
      ) : null}
      {state.stale ? (
        <Text style={[styles.warning, rtl && styles.rtlText]}>{copy.stale}</Text>
      ) : null}
      <Text style={[styles.heading, rtl && styles.rtlText]}>{copy.nearby}</Text>
      {state.timeline.length === 0 ? (
        <Text style={[styles.statusText, rtl && styles.rtlText]}>{copy.none}</Text>
      ) : (
        state.timeline.map(item => (
          <View
            key={`${item.identity.sourceId}:${item.identity.recordId}`}
            style={styles.timelineItem}>
            <Text style={[styles.timelineTitle, rtl && styles.rtlText]}>
              {formatTime(item.timestampMs, locale)} · {itemKind(item, locale)} ·{' '}
              {item.title}
            </Text>
            {itemDetail(item) === undefined ? null : (
              <Text style={[styles.statusText, rtl && styles.rtlText]}>
                {itemDetail(item)}
              </Text>
            )}
          </View>
        ))
      )}
      <Text style={[styles.caveat, rtl && styles.rtlText]}>{copy.caveat}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  loadButton: {
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    borderColor: '#C4B5FD',
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: productUiTokens.spacing.sm,
    minHeight: 44,
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  loadButtonText: {color: '#5B21B6', fontWeight: '800'},
  status: {alignItems: 'center', marginTop: productUiTokens.spacing.md},
  statusText: {color: productUiTokens.colors.textMuted, lineHeight: 20},
  errorText: {color: productUiTokens.colors.danger, fontWeight: '700'},
  context: {
    backgroundColor: '#F8FAFC',
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.md,
  },
  heading: {
    color: productUiTokens.colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: productUiTokens.spacing.sm,
    marginTop: productUiTokens.spacing.sm,
  },
  graph: {backgroundColor: '#FFFFFF', borderRadius: productUiTokens.radii.card},
  warning: {color: '#9A3412', fontWeight: '700', marginTop: 8},
  timelineItem: {
    borderTopColor: productUiTokens.colors.border,
    borderTopWidth: 1,
    paddingVertical: productUiTokens.spacing.sm,
  },
  timelineTitle: {color: productUiTokens.colors.text, fontWeight: '700'},
  caveat: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: productUiTokens.spacing.sm,
  },
});
