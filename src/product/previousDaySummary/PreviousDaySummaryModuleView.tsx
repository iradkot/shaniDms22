import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  PreviousDayGlucoseMetrics,
  PreviousDayInsight,
  PreviousDayMealOutcome,
  PreviousDaySegmentKind,
  PreviousDaySegmentSummary,
  PreviousDaySummary,
  PreviousDaySummaryDataSource,
  PreviousDaySummaryEvent,
  PreviousDaySuggestedFocus,
} from '../../modules/previousDaySummary';
import {
  buildPreviousDaySummary,
  getLatestPreviousDayAnchor,
  getPreviousDaySummaryWindow,
  movePreviousDayAnchor,
  previousDayLocalStart,
} from '../../modules/previousDaySummary';
import type {TrendsRangeThresholds} from '../../modules/trends';
import type {DestinationLocale} from '../destinations';
import type {DestinationFocus} from '../shell';
import {useRefreshingNow} from '../time';
import {
  ProductPage,
  ProductSection,
  ResponsiveGrid,
  productUiTokens,
} from '../ui';

const MINUTE_MS = 60 * 1000;
const DEFAULT_SAMPLE_INTERVAL_MS = 5 * MINUTE_MS;

const COPY = {
  en: {
    title: 'Previous day summary',
    subtitle:
      'Yesterday, the night that led into it, and the night that closed it.',
    previous: 'Previous',
    next: 'Next',
    latest: 'Latest summary',
    loading: 'Loading the previous day…',
    failed: 'This summary could not be loaded.',
    retry: 'Try again',
    empty: 'No data is available in this summary window.',
    partial:
      'The closing night is still in progress. Future data is not counted.',
    overall: 'Whole summary window',
    segments: 'Parts of the day',
    incomingNight: 'Incoming night',
    daytime: 'Daytime',
    closingNight: 'Closing night',
    partialBadge: 'Partial',
    coverage: 'Data coverage',
    readings: 'readings',
    noGlucose: 'No glucose readings',
    lowCoverage: 'Low coverage',
    low: 'Low',
    target: 'In range',
    high: 'High',
    mean: 'Mean',
    insulin: 'Insulin',
    total: 'Total',
    basal: 'Basal',
    bolus: 'Bolus',
    insulinUnavailable:
      'Authoritative insulin data is unavailable for this summary.',
    events: 'Recorded events',
    meal: 'Meal',
    activity: 'Activity',
    alert: 'Alert',
    treatment: 'Treatment',
    other: 'Event',
    openEvent: 'Open event',
    evidence: 'Evidence and coverage',
    observedWindow: 'observed window',
    interpretedWindow: 'interpreted window',
    hours: 'hours',
    contextOnly:
      'The incoming night is context and is not counted in the matched comparison.',
    completeEvidence: 'The closing night is complete.',
    partialEvidence: 'The closing night evidence is still partial.',
    rangeThresholds: 'Range thresholds',
    valid: 'valid',
    excluded: 'excluded',
    duplicates: 'duplicates',
    comparison: 'Matched previous day',
    currentCoverage: 'Current',
    previousCoverage: 'Previous',
    comparisonCoverage: 'coverage',
    limitedComparison:
      'Coverage is limited in at least one window. Treat the differences as a partial observation.',
    comparisonUnavailable:
      'A matched comparison is unavailable because one window has no glucose evidence.',
    meanDelta: 'Mean difference',
    targetDelta: 'In-range difference',
    lowDelta: 'Low-range difference',
    highDelta: 'High-range difference',
    percentagePoints: 'pp',
    insights: 'Insights',
    mealObservations: 'Meal observations',
    mealWindow:
      'Observed for 2 hours after the recorded meal. This does not show what caused the change.',
    mealWindowLimited:
      'The observed window is partial or has limited glucose coverage.',
    mealUnavailable: 'There is not enough glucose evidence for this meal window.',
    startGlucose: 'Start',
    peakGlucose: 'Observed peak',
    endGlucose: 'End',
    peakRise: 'Observed peak rise',
    endChange: 'Observed end change',
    suggestedFocus: 'Suggested focus',
    focusDisclaimer:
      'This is an inspection prompt, not a treatment recommendation.',
  },
  he: {
    title: 'סיכום היום הקודם',
    subtitle: 'אתמול, הלילה שהוביל אליו והלילה שסגר אותו.',
    previous: 'הקודם',
    next: 'הבא',
    latest: 'הסיכום האחרון',
    loading: 'טוען את היום הקודם…',
    failed: 'לא הצלחנו לטעון את הסיכום הזה.',
    retry: 'ניסיון נוסף',
    empty: 'אין נתונים זמינים בחלון הסיכום הזה.',
    partial: 'הלילה הסוגר עדיין נמשך. נתונים עתידיים אינם נספרים.',
    overall: 'חלון הסיכום המלא',
    segments: 'חלקי היום',
    incomingNight: 'הלילה שנכנס',
    daytime: 'שעות היום',
    closingNight: 'הלילה שסגר את היום',
    partialBadge: 'חלקי',
    coverage: 'כיסוי נתונים',
    readings: 'קריאות',
    noGlucose: 'אין קריאות סוכר',
    lowCoverage: 'כיסוי נמוך',
    low: 'נמוך',
    target: 'בטווח',
    high: 'גבוה',
    mean: 'ממוצע',
    insulin: 'אינסולין',
    total: 'סה״כ',
    basal: 'בזאל',
    bolus: 'בולוס',
    insulinUnavailable: 'נתוני אינסולין מוסמכים אינם זמינים לסיכום הזה.',
    events: 'אירועים שנרשמו',
    meal: 'ארוחה',
    activity: 'פעילות',
    alert: 'התראה',
    treatment: 'טיפול',
    other: 'אירוע',
    openEvent: 'פתיחת אירוע',
    evidence: 'ראיות וכיסוי נתונים',
    observedWindow: 'שעות בחלון הנצפה',
    interpretedWindow: 'שעות בחלון המפורש',
    hours: 'שעות',
    contextOnly: 'הלילה שנכנס הוא הקשר ואינו נספר בהשוואה התואמת.',
    completeEvidence: 'הלילה שסגר את היום הושלם.',
    partialEvidence: 'הראיות מהלילה הסוגר עדיין חלקיות.',
    rangeThresholds: 'ספי הטווח',
    valid: 'תקינות',
    excluded: 'הוחרגו',
    duplicates: 'כפילויות',
    comparison: 'היום הקודם התואם',
    currentCoverage: 'נוכחי',
    previousCoverage: 'קודם',
    comparisonCoverage: 'כיסוי',
    limitedComparison:
      'הכיסוי מוגבל לפחות בחלון אחד. יש לקרוא את ההבדלים כתצפית חלקית.',
    comparisonUnavailable:
      'אין השוואה תואמת כי באחד החלונות אין ראיות סוכר.',
    meanDelta: 'הבדל בממוצע',
    targetDelta: 'הבדל בזמן בטווח',
    lowDelta: 'הבדל בטווח הנמוך',
    highDelta: 'הבדל בטווח הגבוה',
    percentagePoints: 'נק׳ אחוז',
    insights: 'תובנות',
    mealObservations: 'תצפיות סביב ארוחות',
    mealWindow:
      'התצפית מכסה שעתיים אחרי הארוחה שנרשמה. היא אינה מראה מה גרם לשינוי.',
    mealWindowLimited: 'חלון התצפית חלקי או שכיסוי נתוני הסוכר בו מוגבל.',
    mealUnavailable: 'אין מספיק ראיות סוכר לחלון הארוחה הזה.',
    startGlucose: 'התחלה',
    peakGlucose: 'שיא שנצפה',
    endGlucose: 'סיום',
    peakRise: 'עלייה מרבית שנצפתה',
    endChange: 'שינוי שנצפה בסיום',
    suggestedFocus: 'מוקד מוצע לבדיקה',
    focusDisclaimer: 'זו הצעה לבדיקה, לא המלצה לשינוי טיפול.',
  },
} as const;

type Copy = (typeof COPY)[DestinationLocale];

type LoadState =
  | {readonly kind: 'loading'}
  | {readonly kind: 'error'}
  | {readonly kind: 'ready'; readonly summary: PreviousDaySummary};

export interface PreviousDaySummaryModuleViewProps {
  readonly locale: DestinationLocale;
  readonly dataSource: PreviousDaySummaryDataSource;
  readonly thresholds: TrendsRangeThresholds;
  readonly focus?: DestinationFocus;
  readonly expectedSampleIntervalMs?: number;
  readonly now?: () => number;
  readonly onOpenEvent?: (event: PreviousDaySummaryEvent) => void;
}

const systemNow = (): number => Date.now();

const segmentTitle = (kind: PreviousDaySegmentKind, copy: Copy): string => {
  switch (kind) {
    case 'incoming-night':
      return copy.incomingNight;
    case 'day':
      return copy.daytime;
    case 'closing-night':
      return copy.closingNight;
  }
};

const segmentAccent = (kind: PreviousDaySegmentKind): string => {
  switch (kind) {
    case 'incoming-night':
      return '#6366F1';
    case 'day':
      return '#F59E0B';
    case 'closing-night':
      return '#7C3AED';
  }
};

const eventAccent = (event: PreviousDaySummaryEvent): string => {
  switch (event.kind) {
    case 'meal':
      return '#F97316';
    case 'activity':
      return '#159A67';
    case 'alert':
      return '#DC2626';
    case 'treatment':
      return '#2563EB';
    case 'other':
      return '#64748B';
  }
};

const formatClock = (timestampMs: number, locale: DestinationLocale): string =>
  new Date(timestampMs).toLocaleTimeString(
    locale === 'he' ? 'he-IL' : 'en-GB',
    {hour: '2-digit', minute: '2-digit', hour12: false},
  );

const formatDate = (timestampMs: number, locale: DestinationLocale): string =>
  new Date(timestampMs).toLocaleDateString(
    locale === 'he' ? 'he-IL' : 'en-US',
    {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'},
  );

const formatUnits = (value: number): string => `${value} U`;

const signed = (value: number, suffix: string): string =>
  `${value > 0 ? '+' : ''}${value}${suffix}`;

const durationHours = (period: {
  readonly startMs: number;
  readonly endMs: number;
}): number =>
  Math.round(((period.endMs - period.startMs) / (60 * 60 * 1000)) * 10) /
  10;

const initialAnchor = (
  focus: DestinationFocus | undefined,
  nowMs: number,
): number => {
  const latest = getLatestPreviousDayAnchor(nowMs);
  return focus?.kind === 'day'
    ? Math.min(previousDayLocalStart(focus.dayStartMs), latest)
    : latest;
};

const Metric = ({
  label,
  valueTestID,
  value,
}: {
  readonly label: string;
  readonly valueTestID?: string;
  readonly value: string;
}) => (
  <View style={styles.metric}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue} testID={valueTestID}>
      {value}
    </Text>
  </View>
);

const GlucoseMetrics = ({
  copy,
  locale,
  metrics,
  meanTestID,
}: {
  readonly copy: Copy;
  readonly locale: DestinationLocale;
  readonly metrics: PreviousDayGlucoseMetrics;
  readonly meanTestID?: string;
}) => {
  const rtl = locale === 'he';
  return (
    <>
      <View style={[styles.coverageRow, rtl && styles.rowReverse]}>
        <Text style={styles.coverageValue}>{metrics.coveragePercent}%</Text>
        <View>
          <Text style={[styles.coverageLabel, rtl && styles.rtlText]}>
            {copy.coverage}
          </Text>
          <Text style={[styles.coverageText, rtl && styles.rtlText]}>
            {metrics.validSampleCount}/{metrics.expectedSampleCount}{' '}
            {copy.readings}
          </Text>
        </View>
      </View>
      {metrics.coverageQuality === 'low' ? (
        <Text style={[styles.warningText, rtl && styles.rtlText]}>
          {copy.lowCoverage}
        </Text>
      ) : null}
      {metrics.ranges && metrics.meanGlucoseMgDl !== undefined ? (
        <View style={[styles.metricRow, rtl && styles.rowReverse]}>
          <Metric label={copy.low} value={`${metrics.ranges.lowPercent}%`} />
          <Metric
            label={copy.target}
            value={`${metrics.ranges.targetPercent}%`}
          />
          <Metric label={copy.high} value={`${metrics.ranges.highPercent}%`} />
          <Metric
            label={copy.mean}
            value={`${metrics.meanGlucoseMgDl} mg/dL`}
            {...(meanTestID ? {valueTestID: meanTestID} : {})}
          />
        </View>
      ) : (
        <Text style={[styles.noDataText, rtl && styles.rtlText]}>
          {copy.noGlucose}
        </Text>
      )}
    </>
  );
};

const SegmentCard = ({
  copy,
  locale,
  segment,
}: {
  readonly copy: Copy;
  readonly locale: DestinationLocale;
  readonly segment: PreviousDaySegmentSummary;
}) => {
  const rtl = locale === 'he';
  const accent = segmentAccent(segment.kind);
  return (
    <View
      style={[styles.segmentCard, {borderTopColor: accent}]}
      testID={`previous-day-summary-segment-${segment.kind}`}>
      <View style={[styles.segmentHeader, rtl && styles.rowReverse]}>
        <Text style={[styles.segmentTitle, rtl && styles.rtlText]}>
          {segmentTitle(segment.kind, copy)}
        </Text>
        {segment.isPartial ? (
          <Text style={styles.partialBadge}>{copy.partialBadge}</Text>
        ) : null}
      </View>
      <Text style={[styles.segmentTime, rtl && styles.rtlText]}>
        {formatClock(segment.period.startMs, locale)}–
        {formatClock(segment.period.endMs, locale)}
      </Text>
      <GlucoseMetrics copy={copy} locale={locale} metrics={segment} />
    </View>
  );
};

const EventRow = ({
  copy,
  event,
  locale,
  onOpen,
}: {
  readonly copy: Copy;
  readonly event: PreviousDaySummaryEvent;
  readonly locale: DestinationLocale;
  readonly onOpen?: (event: PreviousDaySummaryEvent) => void;
}) => {
  const rtl = locale === 'he';
  const content = (
    <>
      <View
        style={[styles.eventAccent, {backgroundColor: eventAccent(event)}]}
      />
      <View style={styles.eventBody}>
        <View style={[styles.eventHeader, rtl && styles.rowReverse]}>
          <Text style={styles.eventKind}>{copy[event.kind]}</Text>
          <Text style={styles.eventTime}>
            {formatClock(event.timestampMs, locale)}
          </Text>
        </View>
        <Text style={[styles.eventTitle, rtl && styles.rtlText]}>
          {event.title}
        </Text>
        {event.detail ? (
          <Text style={[styles.eventDetail, rtl && styles.rtlText]}>
            {event.detail}
          </Text>
        ) : null}
      </View>
    </>
  );
  const testID = `previous-day-summary-event-${event.kind}-${event.id}`;

  return onOpen ? (
    <Pressable
      accessibilityLabel={`${copy.openEvent}: ${event.title}`}
      accessibilityRole="button"
      onPress={() => onOpen(event)}
      style={({pressed}) => [styles.eventRow, pressed && styles.pressed]}
      testID={testID}>
      {content}
    </Pressable>
  ) : (
    <View style={styles.eventRow} testID={testID}>
      {content}
    </View>
  );
};

const insightText = (
  insight: PreviousDayInsight,
  locale: DestinationLocale,
  copy: Copy,
): string => {
  const segment = (kind: PreviousDaySegmentKind): string =>
    segmentTitle(kind, copy).toLocaleLowerCase(
      locale === 'he' ? 'he-IL' : 'en-US',
    );
  const inSegment = (kind: PreviousDaySegmentKind): string => {
    if (locale !== 'he') {
      return segment(kind);
    }
    switch (kind) {
      case 'incoming-night':
        return 'בלילה שנכנס';
      case 'day':
        return 'בשעות היום';
      case 'closing-night':
        return 'בלילה שסגר את היום';
    }
  };
  switch (insight.kind) {
    case 'closing-night-in-progress':
      return locale === 'he'
        ? 'הלילה שסוגר את היום עדיין נמשך, ולכן התמונה עוד חלקית.'
        : 'The closing night is still in progress, so the picture is partial.';
    case 'coverage-observation':
      return locale === 'he'
        ? `כיסוי הנתונים הנמוך ביותר היה ${inSegment(insight.segment)} (${
            insight.coveragePercent
          }%).`
        : `The lowest data coverage was in the ${segment(insight.segment)} (${
            insight.coveragePercent
          }%).`;
    case 'segment-low-observation':
      return locale === 'he'
        ? `הקריאות הנמוכות הופיעו בשיעור הגבוה ביותר ${inSegment(
            insight.segment,
          )} (${insight.percentage}%).`
        : `Low readings were most visible in the ${segment(insight.segment)} (${
            insight.percentage
          }%).`;
    case 'segment-high-observation':
      return locale === 'he'
        ? `הקריאות הגבוהות הופיעו בשיעור הגבוה ביותר ${inSegment(
            insight.segment,
          )} (${insight.percentage}%).`
        : `High readings were most visible in the ${segment(
            insight.segment,
          )} (${insight.percentage}%).`;
    case 'matched-comparison-observation':
      return locale === 'he'
        ? `מול היום הקודם התואם: הבדל ממוצע ${signed(
            insight.deltas.meanGlucoseMgDl,
            ' mg/dL',
          )}, והבדל בזמן בטווח ${signed(
            insight.deltas.targetRangePercentagePoints,
            ' נק׳ אחוז',
          )}.`
        : `Against the matched previous day: mean ${signed(
            insight.deltas.meanGlucoseMgDl,
            ' mg/dL',
          )}, in range ${signed(
            insight.deltas.targetRangePercentagePoints,
            ' percentage points',
          )}.`;
    case 'meal-outcome-observation':
      return locale === 'he'
        ? `קיימות תצפיות סוכר עבור ${insight.availableCount} מתוך ${insight.totalCount} ארוחות שנרשמו.`
        : `Glucose observations are available for ${insight.availableCount} of ${insight.totalCount} recorded meals.`;
  }
};

const focusText = (
  focus: PreviousDaySuggestedFocus,
  locale: DestinationLocale,
  copy: Copy,
): string => {
  const segment = (kind: PreviousDaySegmentKind): string =>
    segmentTitle(kind, copy).toLocaleLowerCase(
      locale === 'he' ? 'he-IL' : 'en-US',
    );
  const inSegment = (kind: PreviousDaySegmentKind): string => {
    if (locale !== 'he') {
      return segment(kind);
    }
    switch (kind) {
      case 'incoming-night':
        return 'בלילה שנכנס';
      case 'day':
        return 'בשעות היום';
      case 'closing-night':
        return 'בלילה שסגר את היום';
    }
  };
  switch (focus.kind) {
    case 'review-low-context':
      return locale === 'he'
        ? `כדאי לבדוק את הקריאות הנמוכות ואת ההקשר שנרשם סביבן ${inSegment(
            focus.segment,
          )}.`
        : `Review low readings and nearby recorded context in the ${segment(
            focus.segment,
          )}.`;
    case 'review-data-coverage':
      return locale === 'he'
        ? `כדאי לבדוק את פערי הנתונים ${inSegment(focus.segment)}.`
        : `Review the data gaps in the ${segment(focus.segment)}.`;
    case 'review-high-context':
      return locale === 'he'
        ? `כדאי לבדוק את הקריאות הגבוהות ואת ההקשר שנרשם סביבן ${inSegment(
            focus.segment,
          )}.`
        : `Review high readings and nearby recorded context in the ${segment(
            focus.segment,
          )}.`;
    case 'review-meal-observations':
      return locale === 'he'
        ? `כדאי לעבור על תצפיות הסוכר סביב ${focus.mealCount} ארוחות שנרשמו.`
        : `Review the glucose observations around ${focus.mealCount} recorded meals.`;
    case 'review-matched-comparison':
      return locale === 'he'
        ? 'כדאי לעבור על ההבדלים הנצפים מול היום הקודם התואם.'
        : 'Review the observed differences from the matched previous day.';
    case 'review-summary-evidence':
      return locale === 'he'
        ? 'כדאי להתחיל מבדיקת הראיות והכיסוי הזמינים.'
        : 'Start by reviewing the available evidence and coverage.';
  }
};

const MealOutcomeCard = ({
  copy,
  locale,
  outcome,
}: {
  readonly copy: Copy;
  readonly locale: DestinationLocale;
  readonly outcome: PreviousDayMealOutcome;
}) => {
  const rtl = locale === 'he';
  return (
    <View
      style={styles.mealOutcomeCard}
      testID={`previous-day-summary-meal-outcome-${outcome.event.id}`}>
      <Text style={[styles.mealOutcomeTitle, rtl && styles.rtlText]}>
        {outcome.event.title}
      </Text>
      <Text style={[styles.observationDisclaimer, rtl && styles.rtlText]}>
        {copy.mealWindow}
      </Text>
      <Text style={[styles.comparisonCoverage, rtl && styles.rtlText]}>
        {copy.coverage}: {outcome.coveragePercent}% ·{' '}
        {outcome.validSampleCount}/{outcome.expectedSampleCount} {copy.readings}
      </Text>
      {outcome.status === 'available' ? (
        <>
          <View style={[styles.metricRow, rtl && styles.rowReverse]}>
            <Metric
              label={copy.startGlucose}
              value={`${outcome.startGlucoseMgDl} mg/dL`}
            />
            <Metric
              label={copy.peakGlucose}
              value={`${outcome.peakGlucoseMgDl} mg/dL`}
            />
            <Metric
              label={copy.endGlucose}
              value={`${outcome.endGlucoseMgDl} mg/dL`}
            />
            <Metric
              label={copy.peakRise}
              value={signed(outcome.observedPeakRiseMgDl, ' mg/dL')}
            />
            <Metric
              label={copy.endChange}
              value={signed(outcome.observedEndChangeMgDl, ' mg/dL')}
            />
          </View>
          {outcome.quality === 'limited' ? (
            <Text style={[styles.warningText, rtl && styles.rtlText]}>
              {copy.mealWindowLimited}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={[styles.noDataText, rtl && styles.rtlText]}>
          {copy.mealUnavailable}
        </Text>
      )}
    </View>
  );
};

export const PreviousDaySummaryModuleView = ({
  locale,
  dataSource,
  thresholds,
  focus,
  expectedSampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  now = systemNow,
  onOpenEvent,
}: PreviousDaySummaryModuleViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const nowMs = useRefreshingNow({now});
  const latestAnchor = getLatestPreviousDayAnchor(nowMs);
  const focusedDayStartMs =
    focus?.kind === 'day'
      ? Math.min(previousDayLocalStart(focus.dayStartMs), latestAnchor)
      : undefined;
  const [selectedAnchor, setSelectedAnchor] = useState(() =>
    initialAnchor(focus, nowMs),
  );
  const [reloadSequence, setReloadSequence] = useState(0);
  const [state, setState] = useState<LoadState>({kind: 'loading'});
  const requestSequence = useRef(0);
  const previewWindow = getPreviousDaySummaryWindow({
    anchorDayStartMs: Math.min(selectedAnchor, latestAnchor),
    nowMs,
  });
  const effectiveEndMs = previewWindow.period.endMs;
  const window = useMemo(
    () =>
      getPreviousDaySummaryWindow({
        anchorDayStartMs: Math.min(selectedAnchor, latestAnchor),
        nowMs: effectiveEndMs,
      }),
    [effectiveEndMs, latestAnchor, selectedAnchor],
  );
  const comparisonWindow = useMemo(
    () =>
      getPreviousDaySummaryWindow({
        anchorDayStartMs: movePreviousDayAnchor(window.anchorDayStartMs, -1),
        nowMs: window.period.endMs,
      }),
    [window.anchorDayStartMs, window.period.endMs],
  );
  const isLatest = selectedAnchor >= latestAnchor;

  useEffect(() => {
    if (focusedDayStartMs !== undefined) {
      setSelectedAnchor(focusedDayStartMs);
    }
  }, [focusedDayStartMs]);

  useEffect(() => {
    const request = requestSequence.current + 1;
    requestSequence.current = request;
    let active = true;
    setState({kind: 'loading'});
    Promise.all([
      dataSource.loadPreviousDaySummary(window.period),
      dataSource
        .loadPreviousDaySummary(comparisonWindow.period)
        .catch(() => undefined),
    ])
      .then(([sourceSnapshot, comparisonSnapshot]) => {
        if (!active || requestSequence.current !== request) {
          return;
        }
        setState({
          kind: 'ready',
          summary: buildPreviousDaySummary({
            window,
            expectedSampleIntervalMs,
            thresholds,
            source: sourceSnapshot,
            ...(comparisonSnapshot
              ? {
                  comparison: {
                    window: comparisonWindow,
                    source: comparisonSnapshot,
                  },
                }
              : {}),
          }),
        });
      })
      .catch(() => {
        if (!active || requestSequence.current !== request) {
          return;
        }
        setState({kind: 'error'});
      });
    return () => {
      active = false;
    };
  }, [
    dataSource,
    comparisonWindow,
    expectedSampleIntervalMs,
    reloadSequence,
    thresholds,
    window,
  ]);

  const moveSelection = (delta: -1 | 1): void => {
    if (delta === 1 && isLatest) {
      return;
    }
    setSelectedAnchor(value =>
      Math.min(movePreviousDayAnchor(value, delta), latestAnchor),
    );
  };

  const isEmpty =
    state.kind === 'ready' &&
    state.summary.overall.validSampleCount === 0 &&
    state.summary.events.length === 0 &&
    state.summary.insulinSummary.quality === 'unavailable';

  return (
    <ProductPage
      locale={locale}
      subtitle={copy.subtitle}
      testID="previous-day-summary-view"
      title={copy.title}>
      <View
        style={[styles.controls, rtl && styles.rowReverse]}
        testID="previous-day-summary-controls">
        <Pressable
          accessibilityLabel={copy.previous}
          accessibilityRole="button"
          onPress={() => moveSelection(-1)}
          style={({pressed}) => [styles.control, pressed && styles.pressed]}
          testID="previous-day-summary-previous">
          <Text style={styles.controlText}>{copy.previous}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{selected: isLatest}}
          onPress={() => setSelectedAnchor(latestAnchor)}
          style={({pressed}) => [
            styles.latestControl,
            isLatest && styles.latestControlSelected,
            pressed && styles.pressed,
          ]}
          testID="previous-day-summary-latest">
          <Text
            style={[
              styles.latestControlText,
              isLatest && styles.latestControlTextSelected,
            ]}>
            {copy.latest}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={copy.next}
          accessibilityRole="button"
          accessibilityState={{disabled: isLatest}}
          disabled={isLatest}
          onPress={() => moveSelection(1)}
          style={({pressed}) => [
            styles.control,
            isLatest && styles.disabled,
            pressed && styles.pressed,
          ]}
          testID="previous-day-summary-next">
          <Text style={styles.controlText}>{copy.next}</Text>
        </Pressable>
      </View>

      <Text
        accessibilityRole="header"
        style={[styles.selectedDate, rtl && styles.rtlText]}
        testID="previous-day-summary-selected-day">
        {formatDate(window.anchorDayStartMs, locale)}
      </Text>

      {window.isPartial ? (
        <View
          style={styles.partialNotice}
          testID="previous-day-summary-partial">
          <Text style={[styles.partialNoticeText, rtl && styles.rtlText]}>
            {copy.partial}
          </Text>
        </View>
      ) : null}

      {state.kind === 'loading' ? (
        <View style={styles.stateCard} testID="previous-day-summary-loading">
          <ActivityIndicator color={productUiTokens.colors.action} />
          <Text style={[styles.stateText, rtl && styles.rtlText]}>
            {copy.loading}
          </Text>
        </View>
      ) : state.kind === 'error' ? (
        <View style={styles.stateCard} testID="previous-day-summary-error">
          <Text style={[styles.errorText, rtl && styles.rtlText]}>
            {copy.failed}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setReloadSequence(value => value + 1)}
            style={({pressed}) => [
              styles.retryButton,
              pressed && styles.pressed,
            ]}
            testID="previous-day-summary-retry">
            <Text style={styles.retryText}>{copy.retry}</Text>
          </Pressable>
        </View>
      ) : (
        <View testID="previous-day-summary-content">
          {isEmpty ? (
            <View style={styles.emptyCard} testID="previous-day-summary-empty">
              <Text style={[styles.stateText, rtl && styles.rtlText]}>
                {copy.empty}
              </Text>
            </View>
          ) : null}

          <ProductSection locale={locale} title={copy.evidence}>
            <View style={styles.evidenceCard}>
              <View style={[styles.evidenceRow, rtl && styles.rowReverse]}>
                <Text style={[styles.evidenceMetric, rtl && styles.rtlText]}>
                  {locale === 'he'
                    ? `${durationHours(
                        state.summary.evidence.observedPeriod,
                      )} ${copy.observedWindow}`
                    : `${durationHours(
                        state.summary.evidence.observedPeriod,
                      )}-hour ${copy.observedWindow}`}
                </Text>
                <Text style={[styles.evidenceMetric, rtl && styles.rtlText]}>
                  {locale === 'he'
                    ? `${durationHours(
                        state.summary.evidence.interpretedPeriod,
                      )} ${copy.interpretedWindow}`
                    : `${durationHours(
                        state.summary.evidence.interpretedPeriod,
                      )}-hour ${copy.interpretedWindow}`}
                </Text>
              </View>
              <Text
                style={[styles.observationDisclaimer, rtl && styles.rtlText]}>
                {copy.contextOnly}
              </Text>
              <Text
                style={[styles.observationDisclaimer, rtl && styles.rtlText]}>
                {state.summary.evidence.closingNightComplete
                  ? copy.completeEvidence
                  : copy.partialEvidence}
              </Text>
              <Text
                style={[styles.observationDisclaimer, rtl && styles.rtlText]}>
                {copy.rangeThresholds}: &lt;{thresholds.targetMinMgDl} mg/dL,{' '}
                {thresholds.targetMinMgDl}–{thresholds.targetMaxMgDl} mg/dL, &gt;
                {thresholds.targetMaxMgDl} mg/dL
              </Text>
              <Text
                style={[styles.observationDisclaimer, rtl && styles.rtlText]}>
                {state.summary.overall.validSampleCount} {copy.valid} ·{' '}
                {state.summary.overall.excludedSampleCount} {copy.excluded} ·{' '}
                {state.summary.overall.duplicateSampleCount} {copy.duplicates}
              </Text>
            </View>
          </ProductSection>

          <ProductSection locale={locale} title={copy.overall}>
            <View style={styles.overallCard}>
              <GlucoseMetrics
                copy={copy}
                locale={locale}
                meanTestID="previous-day-summary-mean"
                metrics={state.summary.overall}
              />
            </View>
          </ProductSection>

          <ProductSection locale={locale} title={copy.comparison}>
            <View
              style={styles.comparisonCard}
              testID="previous-day-summary-comparison">
              <Text
                style={[styles.observationDisclaimer, rtl && styles.rtlText]}>
                {locale === 'he'
                  ? `השוואה לחלון הקודם והשווה באורך ${durationHours(
                      state.summary.evidence.interpretedPeriod,
                    )} שעות, עם אותם ספי סוכר.`
                  : `Compared with the previous equal ${durationHours(
                      state.summary.evidence.interpretedPeriod,
                    )}-hour window using the same glucose thresholds.`}
              </Text>
              {state.summary.comparison.status === 'available' ? (
                <>
                  <Text style={[styles.comparisonCoverage, rtl && styles.rtlText]}>
                    {copy.currentCoverage}: {state.summary.comparison.current.coveragePercent}%{' '}
                    {copy.comparisonCoverage}
                  </Text>
                  <Text style={[styles.comparisonCoverage, rtl && styles.rtlText]}>
                    {copy.previousCoverage}: {state.summary.comparison.reference.coveragePercent}%{' '}
                    {copy.comparisonCoverage}
                  </Text>
                  {state.summary.comparison.quality === 'limited' ? (
                    <Text style={[styles.warningText, rtl && styles.rtlText]}>
                      {copy.limitedComparison}
                    </Text>
                  ) : null}
                  <View style={[styles.metricRow, rtl && styles.rowReverse]}>
                    <Metric
                      label={copy.meanDelta}
                      value={signed(
                        state.summary.comparison.deltas.meanGlucoseMgDl,
                        ' mg/dL',
                      )}
                    />
                    <Metric
                      label={copy.targetDelta}
                      value={signed(
                        state.summary.comparison.deltas
                          .targetRangePercentagePoints,
                        ` ${copy.percentagePoints}`,
                      )}
                    />
                    <Metric
                      label={copy.lowDelta}
                      value={signed(
                        state.summary.comparison.deltas
                          .lowRangePercentagePoints,
                        ` ${copy.percentagePoints}`,
                      )}
                    />
                    <Metric
                      label={copy.highDelta}
                      value={signed(
                        state.summary.comparison.deltas
                          .highRangePercentagePoints,
                        ` ${copy.percentagePoints}`,
                      )}
                    />
                  </View>
                </>
              ) : (
                <Text style={[styles.stateText, rtl && styles.rtlText]}>
                  {copy.comparisonUnavailable}
                </Text>
              )}
            </View>
          </ProductSection>

          {state.summary.insights.length > 0 ? (
            <ProductSection locale={locale} title={copy.insights}>
              <View testID="previous-day-summary-insights">
                {state.summary.insights.map((insight, index) => (
                  <View
                    key={`${insight.kind}:${index}`}
                    style={styles.insightCard}>
                    <Text style={[styles.insightText, rtl && styles.rtlText]}>
                      {insightText(insight, locale, copy)}
                    </Text>
                  </View>
                ))}
              </View>
            </ProductSection>
          ) : null}

          {state.summary.mealOutcomes.length > 0 ? (
            <ProductSection locale={locale} title={copy.mealObservations}>
              <View testID="previous-day-summary-meal-outcomes">
                {state.summary.mealOutcomes.map(outcome => (
                  <MealOutcomeCard
                    copy={copy}
                    key={`${outcome.event.kind}:${outcome.event.id}`}
                    locale={locale}
                    outcome={outcome}
                  />
                ))}
              </View>
            </ProductSection>
          ) : null}

          <ProductSection locale={locale} title={copy.suggestedFocus}>
            <View
              style={styles.focusCard}
              testID="previous-day-summary-focus">
              <Text style={[styles.focusText, rtl && styles.rtlText]}>
                {focusText(state.summary.suggestedFocus, locale, copy)}
              </Text>
              <Text
                style={[styles.observationDisclaimer, rtl && styles.rtlText]}>
                {copy.focusDisclaimer}
              </Text>
            </View>
          </ProductSection>

          <ProductSection locale={locale} title={copy.segments}>
            <ResponsiveGrid
              locale={locale}
              testID="previous-day-summary-segments">
              {state.summary.segments.map(segment => (
                <SegmentCard
                  copy={copy}
                  key={segment.kind}
                  locale={locale}
                  segment={segment}
                />
              ))}
            </ResponsiveGrid>
          </ProductSection>

          <ProductSection locale={locale} title={copy.insulin}>
            {state.summary.insulinSummary.quality === 'available' ? (
              <ResponsiveGrid
                locale={locale}
                testID="previous-day-summary-insulin">
                <Metric
                  label={copy.total}
                  value={formatUnits(state.summary.insulinSummary.totalUnits)}
                  valueTestID="previous-day-summary-insulin-total"
                />
                <Metric
                  label={copy.basal}
                  value={formatUnits(state.summary.insulinSummary.basalUnits)}
                />
                <Metric
                  label={copy.bolus}
                  value={formatUnits(state.summary.insulinSummary.bolusUnits)}
                />
              </ResponsiveGrid>
            ) : (
              <View style={styles.unavailableCard}>
                <Text style={[styles.stateText, rtl && styles.rtlText]}>
                  {copy.insulinUnavailable}
                </Text>
              </View>
            )}
          </ProductSection>

          {state.summary.events.length > 0 ? (
            <ProductSection locale={locale} title={copy.events}>
              <View testID="previous-day-summary-events">
                {state.summary.events.map(event => (
                  <EventRow
                    copy={copy}
                    event={event}
                    key={`${event.kind}:${event.id}`}
                    locale={locale}
                    {...(onOpenEvent ? {onOpen: onOpenEvent} : {})}
                  />
                ))}
              </View>
            </ProductSection>
          ) : null}
        </View>
      )}
    </ProductPage>
  );
};

const styles = StyleSheet.create({
  rowReverse: {flexDirection: 'row-reverse'},
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  pressed: {opacity: productUiTokens.opacity.pressed},
  disabled: {opacity: productUiTokens.opacity.disabled},
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: productUiTokens.spacing.lg,
  },
  control: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 78,
    paddingHorizontal: productUiTokens.spacing.md,
  },
  controlText: {color: productUiTokens.colors.text, fontWeight: '700'},
  latestControl: {
    alignItems: 'center',
    borderRadius: productUiTokens.radii.pill,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: productUiTokens.spacing.md,
  },
  latestControlSelected: {backgroundColor: productUiTokens.colors.action},
  latestControlText: {color: productUiTokens.colors.action, fontWeight: '800'},
  latestControlTextSelected: {color: productUiTokens.colors.actionText},
  selectedDate: {
    color: productUiTokens.colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: productUiTokens.spacing.md,
    textAlign: 'center',
  },
  partialNotice: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginTop: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.md,
  },
  partialNoticeText: {color: '#9A3412', fontWeight: '700', lineHeight: 20},
  stateCard: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.surface,
    borderRadius: productUiTokens.radii.card,
    marginTop: productUiTokens.spacing.xl,
    padding: productUiTokens.spacing.xl,
  },
  stateText: {
    color: productUiTokens.colors.textMuted,
    lineHeight: 20,
    marginTop: productUiTokens.spacing.xs,
  },
  errorText: {color: productUiTokens.colors.danger, fontWeight: '800'},
  retryButton: {
    backgroundColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    marginTop: productUiTokens.spacing.md,
    paddingHorizontal: productUiTokens.spacing.lg,
    paddingVertical: productUiTokens.spacing.md,
  },
  retryText: {color: productUiTokens.colors.actionText, fontWeight: '800'},
  emptyCard: {
    backgroundColor: productUiTokens.colors.surfaceInfo,
    borderRadius: productUiTokens.radii.card,
    marginTop: productUiTokens.spacing.lg,
    padding: productUiTokens.spacing.lg,
  },
  overallCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    padding: productUiTokens.spacing.lg,
  },
  evidenceCard: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    padding: productUiTokens.spacing.lg,
  },
  evidenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  evidenceMetric: {
    color: '#1E3A8A',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: productUiTokens.spacing.sm,
  },
  observationDisclaimer: {
    color: productUiTokens.colors.textMuted,
    lineHeight: 20,
    marginTop: productUiTokens.spacing.sm,
  },
  comparisonCard: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    padding: productUiTokens.spacing.lg,
  },
  comparisonCoverage: {
    color: productUiTokens.colors.text,
    fontWeight: '800',
    marginBottom: productUiTokens.spacing.xs,
  },
  insightCard: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginBottom: productUiTokens.spacing.sm,
    padding: productUiTokens.spacing.md,
  },
  insightText: {color: '#4C1D95', fontWeight: '700', lineHeight: 21},
  mealOutcomeCard: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginBottom: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.lg,
  },
  mealOutcomeTitle: {
    color: productUiTokens.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  focusCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    padding: productUiTokens.spacing.lg,
  },
  focusText: {color: '#065F46', fontSize: 16, fontWeight: '900', lineHeight: 22},
  coverageRow: {alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap'},
  coverageValue: {color: '#047857', fontSize: 25, fontWeight: '900'},
  coverageText: {
    color: productUiTokens.colors.textMuted,
    marginHorizontal: productUiTokens.spacing.sm,
  },
  coverageLabel: {
    color: productUiTokens.colors.text,
    fontWeight: '700',
    marginHorizontal: productUiTokens.spacing.sm,
  },
  warningText: {color: '#9A3412', fontSize: 12, marginTop: 3},
  noDataText: {
    color: productUiTokens.colors.textMuted,
    marginTop: productUiTokens.spacing.sm,
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -productUiTokens.spacing.xs,
    marginTop: productUiTokens.spacing.sm,
  },
  metric: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexGrow: 1,
    margin: productUiTokens.spacing.xs,
    minHeight: 64,
    minWidth: 82,
    padding: productUiTokens.spacing.sm,
  },
  metricLabel: {color: productUiTokens.colors.textMuted, fontSize: 12},
  metricValue: {
    color: productUiTokens.colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 3,
  },
  segmentCard: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderTopWidth: 5,
    borderWidth: 1,
    minHeight: 210,
    padding: productUiTokens.spacing.md,
    width: '100%',
  },
  segmentHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  segmentTitle: {color: productUiTokens.colors.text, fontWeight: '900'},
  segmentTime: {
    color: productUiTokens.colors.textMuted,
    fontSize: 12,
    marginTop: productUiTokens.spacing.xs,
  },
  partialBadge: {
    backgroundColor: '#FFEDD5',
    borderRadius: productUiTokens.radii.pill,
    color: '#9A3412',
    fontSize: 11,
    overflow: 'hidden',
    paddingHorizontal: productUiTokens.spacing.sm,
    paddingVertical: 3,
  },
  unavailableCard: {
    backgroundColor: productUiTokens.colors.surfaceInfo,
    borderRadius: productUiTokens.radii.card,
    padding: productUiTokens.spacing.lg,
  },
  eventRow: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: productUiTokens.spacing.sm,
    minHeight: 82,
    overflow: 'hidden',
  },
  eventAccent: {width: 6},
  eventBody: {flex: 1, padding: productUiTokens.spacing.md},
  eventHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eventKind: {color: '#475569', fontSize: 12, fontWeight: '800'},
  eventTime: {color: productUiTokens.colors.textMuted, fontSize: 12},
  eventTitle: {
    color: productUiTokens.colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: productUiTokens.spacing.xs,
  },
  eventDetail: {
    color: productUiTokens.colors.textMuted,
    marginTop: 3,
  },
});
