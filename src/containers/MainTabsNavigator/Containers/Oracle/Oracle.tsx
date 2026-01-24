import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import styled, {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import Loader from 'app/components/common-ui/Loader/Loader';
import {useOracleInsights} from 'app/hooks/useOracleInsights';
import OracleGhostGraph from 'app/components/charts/OracleGhostGraph/OracleGhostGraph';
import {addOpacity} from 'app/style/styling.utils';
import {
  ORACLE_SLOPE_POINTS_DEFAULT,
  ORACLE_SLOPE_POINTS_MAX,
  ORACLE_SLOPE_POINTS_MIN,
} from 'app/services/oracle/oracleConstants';
import {
  formatDateToDateAndTimeString,
  formatDateToLocaleTimeString,
} from 'app/utils/datetime.utils';

import {OracleStatusBanner, Spacer, Card, CardSubtle, CardTitle} from './components/OracleCards';
import {Row, RowLeft, RowMeta, RowRight, RowTitle} from './components/OracleRows';
import {OracleMatchDetailsCard} from './components/OracleMatchDetailsCard';
import {OracleProgressBar, formatOracleProgressMeta} from './components/OracleProgress';
import {
  fmtBg,
  fmtCob,
  fmtIob,
  formatOracleKind,
  formatPercent,
  isWithinNext2Hours,
  summarizeMatch,
} from './utils/oracleUiUtils';

const LOADER_PADDING_VERTICAL_PX = 20;
const STEPPER_VALUE_MIN_WIDTH_PX = 26;

const ORACLE_GHOST_GRAPH_HEIGHT_PX = 260;
const PREVIOUS_MATCHES_LIMIT = 10;

type PreviousSortMode = 'recent' | 'closest' | 'bestOutcome';

const ORACLE_SETTINGS_STORAGE_KEY = 'oracle.settings.v1';
const ORACLE_CACHE_DAYS_MIN = 7;
const ORACLE_CACHE_DAYS_MAX = 365;
const ORACLE_CACHE_DAYS_STEP = 7;

const Container = styled.View<{theme: ThemeType}>`
  flex: 1;
  background-color: ${(p: {theme: ThemeType}) => p.theme.backgroundColor};
`;

const StrategyCard = styled.View<{theme: ThemeType; $accent?: string}>`
  background-color: ${(p: {theme: ThemeType}) => p.theme.white};
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius}px;
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => p.theme.borderColor};
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.lg}px;
  border-left-width: 6px;
  border-left-color: ${(p: {theme: ThemeType; $accent?: string}) => p.$accent ?? p.theme.borderColor};
`;

const StrategyTitleRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const StrategyTitle = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.md}px;
  font-weight: 800;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
`;

const StrategyBadge = styled.Text<{theme: ThemeType; $best?: boolean}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  font-weight: 800;
  color: ${(p: {theme: ThemeType; $best?: boolean}) =>
    p.$best ? p.theme.accentColor : addOpacity(p.theme.textColor, 0.7)};
`;

const StrategyMeta = styled.Text<{theme: ThemeType}>`
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.8)};
`;

const ToggleRow = styled.View`
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const ToggleLabel = styled.Text<{theme: ThemeType}>`
  flex: 1;
  margin-right: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.9)};
`;

const StepperRow = styled.View`
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const StepperControls = styled.View`
  flex-direction: row;
  align-items: center;
`;

const SegmentRow = styled.View<{theme: ThemeType}>`
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  flex-direction: row;
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.borderColor, 0.9)};
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius}px;
  overflow: hidden;
`;

const SegmentButton = styled(Pressable)<{theme: ThemeType; $active?: boolean}>`
  flex: 1;
  padding-vertical: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  align-items: center;
  justify-content: center;
  background-color: ${(p: {theme: ThemeType; $active?: boolean}) =>
    p.$active ? addOpacity(p.theme.accentColor, 0.12) : 'transparent'};
`;

const SegmentText = styled.Text<{theme: ThemeType; $active?: boolean}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  font-weight: 800;
  color: ${(p: {theme: ThemeType; $active?: boolean}) =>
    p.$active ? p.theme.accentColor : addOpacity(p.theme.textColor, 0.75)};
`;

function sgvNear(points: Array<{tMin: number; sgv: number}>, tMin: number, toleranceMin = 5): number | null {
  let best: {tMin: number; sgv: number} | null = null;
  for (const p of points) {
    const d = Math.abs(p.tMin - tMin);
    if (d > toleranceMin) continue;
    if (!best || d < Math.abs(best.tMin - tMin)) best = p;
  }
  return best ? best.sgv : null;
}

function rmseOverWindow(params: {
  a: Array<{tMin: number; sgv: number}>;
  b: Array<{tMin: number; sgv: number}>;
  minTMin: number;
  maxTMin: number;
}): number | null {
  const {a, b, minTMin, maxTMin} = params;
  if (!a.length || !b.length) return null;

  const bByT = new Map<number, number>();
  for (const p of b) {
    if (p.tMin < minTMin || p.tMin > maxTMin) continue;
    bByT.set(p.tMin, p.sgv);
  }

  let sumSq = 0;
  let n = 0;
  for (const p of a) {
    if (p.tMin < minTMin || p.tMin > maxTMin) continue;
    const bv = bByT.get(p.tMin);
    if (bv == null) continue;
    const d = p.sgv - bv;
    sumSq += d * d;
    n += 1;
  }

  if (n < 3) return null;
  return Math.sqrt(sumSq / n);
}

const StepperValue = styled.Text<{theme: ThemeType}>`
  min-width: ${STEPPER_VALUE_MIN_WIDTH_PX}px;
  text-align: center;
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  font-weight: 800;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
`;

const StepperButton = styled(Pressable)<{theme: ThemeType}>`
  padding-vertical: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
  padding-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius}px;
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.borderColor, 0.9)};
`;

const StepperButtonText = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  font-weight: 800;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
`;

const ExecuteButton = styled(Pressable)<{theme: ThemeType; $disabled?: boolean}>`
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.lg}px;
  padding-vertical: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  padding-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius}px;
  align-items: center;
  justify-content: center;
  background-color: ${(p: {theme: ThemeType; $disabled?: boolean}) =>
    p.$disabled ? addOpacity(p.theme.accentColor, 0.25) : addOpacity(p.theme.accentColor, 0.95)};
`;

const ExecuteButtonText = styled.Text<{theme: ThemeType; $disabled?: boolean}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  font-weight: 900;
  color: ${(p: {theme: ThemeType; $disabled?: boolean}) =>
    p.$disabled ? addOpacity(p.theme.white, 0.6) : p.theme.white};
`;

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

const Oracle: React.FC = () => {
  const {width} = useWindowDimensions();
  const theme = useTheme() as ThemeType;
  const [selectedEventTs, setSelectedEventTs] = useState<number | null>(null);
  const [selectedPreviousTs, setSelectedPreviousTs] = useState<number | null>(null);
  const [previousSortMode, setPreviousSortMode] = useState<PreviousSortMode>('recent');
  const [includeLoadInMatching, setIncludeLoadInMatching] = useState(true);
  const [slopePointCount, setSlopePointCount] = useState<number>(ORACLE_SLOPE_POINTS_DEFAULT);
  const [cacheDays, setCacheDays] = useState<number>(90);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(ORACLE_SETTINGS_STORAGE_KEY);
        if (!active || !raw) return;
        const parsed = JSON.parse(raw);
        if (typeof parsed?.includeLoadInMatching === 'boolean') {
          setIncludeLoadInMatching(parsed.includeLoadInMatching);
        }
        if (typeof parsed?.slopePointCount === 'number' && Number.isFinite(parsed.slopePointCount)) {
          setSlopePointCount(
            clampInt(parsed.slopePointCount, ORACLE_SLOPE_POINTS_MIN, ORACLE_SLOPE_POINTS_MAX),
          );
        }
        if (typeof parsed?.cacheDays === 'number' && Number.isFinite(parsed.cacheDays)) {
          setCacheDays(clampInt(parsed.cacheDays, ORACLE_CACHE_DAYS_MIN, ORACLE_CACHE_DAYS_MAX));
        }
      } catch {
        // Ignore settings load failures.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      AsyncStorage.setItem(
        ORACLE_SETTINGS_STORAGE_KEY,
        JSON.stringify({includeLoadInMatching, slopePointCount, cacheDays}),
      ).catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [cacheDays, includeLoadInMatching, slopePointCount]);
  const {
    insights,
    events,
    selectedEvent,
    isLoading,
    isComputingInsights,
    computeProgress,
    syncProgress,
    lastComputeMs,
    effectiveSlopePointCount,
    error,
    lastSyncedMs,
    historyCount,
    isSyncing,
    status,
    hasExecuted,
    lastRunConfig,
    execute,
  } =
    useOracleInsights({
      selectedEventTs,
      includeLoadInMatching,
      slopePointCount,
      cacheDays,
    });

  const isPendingSlope = effectiveSlopePointCount !== slopePointCount;
  const isBusy = isLoading || isComputingInsights;

  const [paramChangeHint, setParamChangeHint] = useState<string | null>(null);
  const prevParamsRef = useRef<{slopePointCount: number; includeLoadInMatching: boolean} | null>(
    null,
  );
  useEffect(() => {
    const prev = prevParamsRef.current;
    prevParamsRef.current = {slopePointCount, includeLoadInMatching};
    if (!prev) return;
    if (!selectedEvent) return;

    const changed =
      prev.slopePointCount !== slopePointCount ||
      prev.includeLoadInMatching !== includeLoadInMatching;
    if (!changed) return;

    const pieces: string[] = [];
    pieces.push(`Slope points: ${slopePointCount}`);
    pieces.push(includeLoadInMatching ? 'Load matching: On' : 'Load matching: Off');
    setParamChangeHint(`Updated • ${pieces.join(' • ')}`);

    const t = setTimeout(() => setParamChangeHint(null), 2500);
    return () => clearTimeout(t);
  }, [includeLoadInMatching, selectedEvent, slopePointCount]);

  const prevMatchCountRef = useRef<number | null>(null);
  const [matchDeltaHint, setMatchDeltaHint] = useState<string | null>(null);
  useEffect(() => {
    if (!insights) {
      prevMatchCountRef.current = null;
      setMatchDeltaHint(null);
      return;
    }

    const prev = prevMatchCountRef.current;
    prevMatchCountRef.current = insights.matchCount;
    if (typeof prev !== 'number') return;
    if (insights.matchCount <= prev) return;

    const delta = insights.matchCount - prev;
    setMatchDeltaHint(`+${delta} new match${delta === 1 ? '' : 'es'} found`);
    const t = setTimeout(() => setMatchDeltaHint(null), 2500);
    return () => clearTimeout(t);
  }, [insights]);

  const statusMessage = useMemo(() => {
    return 'message' in status ? status.message : '';
  }, [status]);

  const summaryText = useMemo(() => {
    if (!selectedEvent) return 'Waiting for recent data…';
    if (status.state === 'idle') return 'Adjust settings, then press Execute to run.';
    if (status.state === 'computing') return statusMessage;
    if (isPendingSlope) return 'Applying slope change…';
    if (!insights) return hasExecuted ? 'Ready to run again.' : 'Press Execute to start.';
    if (isSyncing && insights.matchCount === 0) return 'Searching cached history…';
    return `Found ${insights.matchCount} previous similar events.`;
  }, [hasExecuted, insights, isPendingSlope, isSyncing, selectedEvent, status.state, statusMessage]);

  const computeMetaText = useMemo(() => {
    if (!computeProgress) return null;
    return formatOracleProgressMeta({
      scanned: computeProgress.scanned,
      total: computeProgress.total,
      matchCount: computeProgress.matchCount,
    });
  }, [computeProgress]);

  const hasPendingChanges = useMemo(() => {
    if (!lastRunConfig) return false;
    return (
      lastRunConfig.cacheDays !== cacheDays ||
      lastRunConfig.includeLoadInMatching !== includeLoadInMatching ||
      (lastRunConfig.slopePointCount ?? null) !== (effectiveSlopePointCount ?? null)
    );
  }, [
    cacheDays,
    effectiveSlopePointCount,
    includeLoadInMatching,
    lastRunConfig,
  ]);

  const loadSummaryText = useMemo(() => {
    if (!selectedEvent) return 'IOB — • COB —';
    if (!insights) return 'Calculating IOB/COB…';
    return `IOB ${fmtIob(insights.anchorIob)} • COB ${fmtCob(insights.anchorCob)}`;
  }, [insights, selectedEvent]);

  const loadMatchModeText = useMemo(() => {
    if (!selectedEvent) return '';
    if (includeLoadInMatching) return 'Matching includes IOB/COB (when available).';
    return 'Matching uses CGM pattern only.';
  }, [includeLoadInMatching, selectedEvent]);

  const loadAvailabilityHint = useMemo(() => {
    if (!includeLoadInMatching) return '';
    if (!insights) return '';
    const hasAny = typeof insights.anchorIob === 'number' || typeof insights.anchorCob === 'number';
    if (hasAny) return '';
    return 'IOB/COB not available for this event; matching will ignore load.';
  }, [includeLoadInMatching, insights]);

  const selectedLabel = useMemo(() => {
    if (!selectedEvent) return '';
    const when = formatDateToDateAndTimeString(selectedEvent.date);
    return `${formatOracleKind(selectedEvent.kind)} event • ${when}`;
  }, [selectedEvent]);

  const selectedPrevious = useMemo(() => {
    if (!insights?.matches?.length) return null;
    if (typeof selectedPreviousTs !== 'number') return null;
    return insights.matches.find(m => m.anchorTs === selectedPreviousTs) ?? null;
  }, [insights?.matches, selectedPreviousTs]);

  const previousMatchMeta = useMemo(() => {
    if (!insights?.matches?.length || !selectedEvent) return null;

    const shapeRmseByAnchor = new Map<number, number>();
    const distanceByAnchor = new Map<number, number>();

    // Compare the 60 minutes leading up to the event to estimate pattern similarity.
    // Both series are in tMin minutes relative to their own t=0 anchors.
    for (const m of insights.matches) {
      const rmse = rmseOverWindow({a: m.points, b: insights.currentSeries, minTMin: -60, maxTMin: 0});
      if (rmse != null) shapeRmseByAnchor.set(m.anchorTs, rmse);

      const dSgv = Math.abs(m.anchorSgv - selectedEvent.sgv);
      const dSlope = Math.abs(m.slope - selectedEvent.slope);
      const dIob =
        typeof selectedEvent.iob === 'number' && typeof m.iob === 'number'
          ? Math.abs(m.iob - selectedEvent.iob)
          : 0;
      const dCob =
        typeof selectedEvent.cob === 'number' && typeof m.cob === 'number'
          ? Math.abs(m.cob - selectedEvent.cob)
          : 0;

      // Heuristic distance: keep this stable and understandable.
      // - BG diff in 10 mg/dL units
      // - slope diff weighted strongly (mg/dL/min)
      // - shape RMSE in 10 mg/dL units
      // - IOB/COB are small nudges
      const dist =
        dSgv / 10 +
        dSlope * 6 +
        (rmse != null ? rmse / 10 : 0) +
        dIob * 1.5 +
        dCob / 20;

      distanceByAnchor.set(m.anchorTs, dist);
    }

    return {shapeRmseByAnchor, distanceByAnchor};
  }, [insights?.currentSeries, insights?.matches, selectedEvent]);

  const previousMatchesSorted = useMemo(() => {
    if (!insights?.matches?.length) return [];

    const matches = [...insights.matches];

    if (previousSortMode === 'recent') {
      return matches.slice(0, PREVIOUS_MATCHES_LIMIT);
    }

    if (previousSortMode === 'closest') {
      const dist = previousMatchMeta?.distanceByAnchor;
      matches.sort((a, b) => {
        const da = dist?.get(a.anchorTs) ?? Number.POSITIVE_INFINITY;
        const db = dist?.get(b.anchorTs) ?? Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
        return b.anchorTs - a.anchorTs;
      });
      return matches.slice(0, PREVIOUS_MATCHES_LIMIT);
    }

    // bestOutcome
    matches.sort((a, b) => {
      const ta = typeof a.tir2h === 'number' ? a.tir2h : -1;
      const tb = typeof b.tir2h === 'number' ? b.tir2h : -1;
      if (ta !== tb) return tb - ta;

      const sa = summarizeMatch(a.points);
      const sb = summarizeMatch(b.points);

      const maxA = sa.max4h ?? Number.POSITIVE_INFINITY;
      const maxB = sb.max4h ?? Number.POSITIVE_INFINITY;
      if (maxA !== maxB) return maxA - maxB;

      const bg2hA = sgvNear(a.points, 120) ?? Number.POSITIVE_INFINITY;
      const bg2hB = sgvNear(b.points, 120) ?? Number.POSITIVE_INFINITY;
      if (bg2hA !== bg2hB) return bg2hA - bg2hB;

      return b.anchorTs - a.anchorTs;
    });
    return matches.slice(0, PREVIOUS_MATCHES_LIMIT);
  }, [insights?.matches, previousMatchMeta?.distanceByAnchor, previousSortMode]);

  const bestOutcomeMatch = useMemo(() => {
    if (!insights?.matches?.length) return null;
    let best: typeof insights.matches[number] | null = null;
    for (const m of insights.matches) {
      if (!best) {
        best = m;
        continue;
      }
      const tBest = typeof best.tir2h === 'number' ? best.tir2h : -1;
      const tM = typeof m.tir2h === 'number' ? m.tir2h : -1;
      if (tM > tBest) {
        best = m;
        continue;
      }
      if (tM < tBest) continue;

      const sBest = summarizeMatch(best.points);
      const sM = summarizeMatch(m.points);
      const maxBest = sBest.max4h ?? Number.POSITIVE_INFINITY;
      const maxM = sM.max4h ?? Number.POSITIVE_INFINITY;
      if (maxM < maxBest) {
        best = m;
        continue;
      }
      if (maxM > maxBest) continue;

      const bg2hBest = sgvNear(best.points, 120) ?? Number.POSITIVE_INFINITY;
      const bg2hM = sgvNear(m.points, 120) ?? Number.POSITIVE_INFINITY;
      if (bg2hM < bg2hBest) best = m;
    }
    return best;
  }, [insights?.matches]);

  const closestMatch = useMemo(() => {
    if (!insights?.matches?.length) return null;
    const dist = previousMatchMeta?.distanceByAnchor;
    if (!dist) return null;

    let bestAnchor: number | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const m of insights.matches) {
      const d = dist.get(m.anchorTs);
      if (d == null) continue;
      if (d < bestDist) {
        bestDist = d;
        bestAnchor = m.anchorTs;
      }
    }
    if (bestAnchor == null) return null;
    return insights.matches.find(m => m.anchorTs === bestAnchor) ?? null;
  }, [insights?.matches, previousMatchMeta?.distanceByAnchor]);

  /**
   * Tap-to-open seam for previous matches.
   *
   * Today this toggles an inline details card.
   * Later we can replace this with navigation to a dedicated details screen
   * (powered by `oracleMatchToCgmGraphData`) without changing the row renderer.
   */
  const openPreviousMatch = useCallback((anchorTs: number) => {
    setSelectedPreviousTs(prev => (prev === anchorTs ? null : anchorTs));
  }, []);

  return (
    <Container testID={E2E_TEST_IDS.screens.oracle}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: theme.spacing.xl * 2,
        }}>
        <Card>
          <CardTitle>Investigate Events</CardTitle>
          {!!selectedLabel && <CardSubtle>{selectedLabel}</CardSubtle>}
          <CardSubtle testID={E2E_TEST_IDS.oracle.headerSummary}>{summaryText}</CardSubtle>

          {!!paramChangeHint && <CardSubtle>{paramChangeHint}</CardSubtle>}
          {!!matchDeltaHint && <CardSubtle>{matchDeltaHint}</CardSubtle>}

          {hasExecuted && hasPendingChanges && !isBusy && (
            <OracleStatusBanner
              tone="info"
              message="Settings changed (not applied yet). Press Execute to run with the new settings."
            />
          )}

          {!!syncProgress && isSyncing && <CardSubtle>{syncProgress.message}</CardSubtle>}

          {status.state === 'computing' && !!selectedEvent && (
            <OracleStatusBanner
              testID={E2E_TEST_IDS.oracle.statusBanner}
              tone="info"
              message={
                lastComputeMs != null
                  ? `${statusMessage} (last ${Math.round(lastComputeMs)}ms)`
                  : statusMessage
              }
            />
          )}

          {status.state === 'computing' && !!computeProgress && (
            <View style={{marginTop: theme.spacing.md}}>
              <OracleProgressBar percent={computeProgress.percent} meta={computeMetaText ?? undefined} />
            </View>
          )}

          {!!selectedEvent && (
            <>
              <CardSubtle testID={E2E_TEST_IDS.oracle.loadSummary}>{loadSummaryText}</CardSubtle>
              {!!loadMatchModeText && <CardSubtle>{loadMatchModeText}</CardSubtle>}
              {!!loadAvailabilityHint && <CardSubtle>{loadAvailabilityHint}</CardSubtle>}
              <ToggleRow>
                <ToggleLabel>
                  Include IOB/COB in similar-event search
                </ToggleLabel>
                <Switch
                  testID={E2E_TEST_IDS.oracle.loadToggle}
                  accessibilityLabel={E2E_TEST_IDS.oracle.loadToggle}
                  value={includeLoadInMatching}
                  onValueChange={setIncludeLoadInMatching}
                  disabled={isComputingInsights}
                  trackColor={{
                    false: addOpacity(theme.textColor, 0.2),
                    true: addOpacity(theme.accentColor, 0.4),
                  }}
                  thumbColor={includeLoadInMatching ? theme.accentColor : theme.borderColor}
                />
              </ToggleRow>

              <StepperRow>
                <ToggleLabel>
                  History window (days)
                </ToggleLabel>
                <StepperControls>
                  <StepperButton
                    testID={E2E_TEST_IDS.oracle.cacheDaysMinus}
                    accessibilityLabel={E2E_TEST_IDS.oracle.cacheDaysMinus}
                    disabled={isBusy}
                    onPress={() =>
                      setCacheDays(v =>
                        clampInt(v - ORACLE_CACHE_DAYS_STEP, ORACLE_CACHE_DAYS_MIN, ORACLE_CACHE_DAYS_MAX),
                      )
                    }
                  >
                    <StepperButtonText>−</StepperButtonText>
                  </StepperButton>

                  <StepperValue>{cacheDays}</StepperValue>

                  <StepperButton
                    testID={E2E_TEST_IDS.oracle.cacheDaysPlus}
                    accessibilityLabel={E2E_TEST_IDS.oracle.cacheDaysPlus}
                    disabled={isBusy}
                    onPress={() =>
                      setCacheDays(v =>
                        clampInt(v + ORACLE_CACHE_DAYS_STEP, ORACLE_CACHE_DAYS_MIN, ORACLE_CACHE_DAYS_MAX),
                      )
                    }
                  >
                    <StepperButtonText>+</StepperButtonText>
                  </StepperButton>
                </StepperControls>
              </StepperRow>
              <CardSubtle>
                Execute runs: (1) refresh cache, then (2) scan history, then (3) build strategies.
              </CardSubtle>

              <StepperRow>
                <ToggleLabel>
                  Slope points (noise smoothing)
                </ToggleLabel>
                <StepperControls>
                  <StepperButton
                    testID={E2E_TEST_IDS.oracle.slopeMinus}
                    accessibilityLabel={E2E_TEST_IDS.oracle.slopeMinus}
                    disabled={isComputingInsights}
                    onPress={() =>
                      setSlopePointCount(v =>
                        Math.max(ORACLE_SLOPE_POINTS_MIN, v - 1),
                      )
                    }
                  >
                    <StepperButtonText>−</StepperButtonText>
                  </StepperButton>

                  <StepperValue>{slopePointCount}</StepperValue>

                  <StepperButton
                    testID={E2E_TEST_IDS.oracle.slopePlus}
                    accessibilityLabel={E2E_TEST_IDS.oracle.slopePlus}
                    disabled={isComputingInsights}
                    onPress={() =>
                      setSlopePointCount(v =>
                        Math.min(ORACLE_SLOPE_POINTS_MAX, v + 1),
                      )
                    }
                  >
                    <StepperButtonText>+</StepperButtonText>
                  </StepperButton>
                </StepperControls>
              </StepperRow>
              <CardSubtle>
                Uses least-squares slope over the last 15 minutes.
              </CardSubtle>
              {isPendingSlope && (
                <CardSubtle>
                  Updating matches after you stop tapping…
                </CardSubtle>
              )}
            </>
          )}

          <ExecuteButton
            testID={E2E_TEST_IDS.oracle.executeButton}
            accessibilityLabel={E2E_TEST_IDS.oracle.executeButton}
            $disabled={!selectedEvent || isBusy}
            disabled={!selectedEvent || isBusy}
            onPress={execute}
          >
            <ExecuteButtonText $disabled={!selectedEvent || isBusy}>
              {isBusy ? 'Running…' : 'Execute'}
            </ExecuteButtonText>
          </ExecuteButton>

          {typeof lastSyncedMs === 'number' && (
            <CardSubtle>
              Cache updated: {formatDateToDateAndTimeString(lastSyncedMs)}
            </CardSubtle>
          )}

          {status.state === 'syncing' && !status.hasHistory && (
            <CardSubtle testID={E2E_TEST_IDS.oracle.historySyncHint}>
              {status.message} Similar events may be empty for a moment.
            </CardSubtle>
          )}

          {status.state === 'error' && (
            <OracleStatusBanner
              testID={E2E_TEST_IDS.oracle.statusBanner}
              tone="error"
              message={status.message}
              actionLabel="Execute"
              actionTestID={E2E_TEST_IDS.oracle.retryButton}
              onPressAction={execute}
            />
          )}

          {!!error && status.state !== 'error' && (
            <OracleStatusBanner
              testID={E2E_TEST_IDS.oracle.statusBanner}
              tone="warn"
              message="Live fetch unavailable; showing cached data when possible."
              actionLabel="Execute"
              actionTestID={E2E_TEST_IDS.oracle.retryButton}
              onPressAction={execute}
            />
          )}

          {status.state === 'syncing' && status.hasHistory && (
            <OracleStatusBanner
              testID={E2E_TEST_IDS.oracle.statusBanner}
              tone="info"
              message={`${status.message} Matches may increase as the cache updates.`}
            />
          )}
        </Card>

        <Spacer h={theme.spacing.md} />

        <Card testID={E2E_TEST_IDS.oracle.eventsList}>
          <CardTitle>Pick an event</CardTitle>
          <CardSubtle>Choose a recent point to compare against history.</CardSubtle>

          <Spacer h={theme.spacing.sm} />

          {events.length ? (
            events.map((e, idx) => {
              const selected = selectedEvent?.date === e.date;
              const when = formatDateToLocaleTimeString(e.date);
              return (
                <Row
                  key={e.date}
                  testID={`${E2E_TEST_IDS.oracle.eventRow}.${idx}`}
                  accessibilityLabel={`${E2E_TEST_IDS.oracle.eventRow}.${idx}`}
                  $selected={selected}
                  onPress={() => {
                    setSelectedEventTs(e.date);
                    setSelectedPreviousTs(null);
                  }}>
                  <RowLeft>
                    <RowTitle>{formatOracleKind(e.kind)}</RowTitle>
                    <RowMeta>
                      {when} • slope {e.slope.toFixed(1)} mg/dL/min • IOB {fmtIob(e.iob)} • COB {fmtCob(e.cob)}
                    </RowMeta>
                  </RowLeft>
                  <RowRight>{e.sgv}</RowRight>
                </Row>
              );
            })
          ) : (
            <CardSubtle>No recent events yet.</CardSubtle>
          )}
        </Card>

        <Spacer h={theme.spacing.md} />

        {isBusy && !insights ? (
          <View style={{alignItems: 'center', paddingVertical: LOADER_PADDING_VERTICAL_PX}}>
            <Loader />
            {(status.state === 'loading' || status.state === 'computing') && (
              <CardSubtle style={{marginTop: theme.spacing.md}}>{status.message}</CardSubtle>
            )}
          </View>
        ) : insights ? (
          <>
            <OracleGhostGraph
              testID={E2E_TEST_IDS.charts.oracleGhostGraph}
              width={Math.max(1, width - theme.spacing.lg * 2)}
              height={ORACLE_GHOST_GRAPH_HEIGHT_PX}
              currentSeries={insights.currentSeries}
              matches={insights.matches}
              medianSeries={insights.medianSeries}
            />

            <Spacer h={theme.spacing.md} />

            <Card testID={E2E_TEST_IDS.oracle.strategiesList}>
              <CardTitle>What tended to work</CardTitle>
              <CardSubtle>
                Strategy cards group similar past events by actions recorded in the first 30 minutes.
                Historical associations only — not dosing advice.
              </CardSubtle>

              {isComputingInsights && (
                <View style={{marginTop: theme.spacing.sm, flexDirection: 'row', alignItems: 'center'}}>
                  <ActivityIndicator size="small" color={theme.accentColor} />
                  <CardSubtle style={{marginTop: 0, marginLeft: theme.spacing.sm}}>
                    Scanning history and updating strategy cards…
                  </CardSubtle>
                </View>
              )}

              <Spacer h={theme.spacing.sm} />

              {insights.strategies.length ? (
                insights.strategies.map((s, idx) => {
                  const outcomeText =
                    typeof s.avgBg2h === 'number'
                      ? `Avg +2h BG ${s.avgBg2h}`
                      : 'Avg +2h BG unavailable';

                  const successText =
                    typeof s.successRate === 'number'
                      ? `${Math.round(s.successRate * 100)}% in 70–140 at +2h`
                      : 'Success rate unavailable';

                  const accent =
                    typeof s.avgBg2h === 'number'
                      ? theme.determineBgColorByGlucoseValue(s.avgBg2h)
                      : undefined;

                  return (
                    <View
                      key={s.key}
                      style={{marginTop: idx === 0 ? 0 : theme.spacing.md}}
                    >
                      <StrategyCard
                        testID={`${E2E_TEST_IDS.oracle.strategyCard}.${idx}`}
                        accessibilityLabel={`${E2E_TEST_IDS.oracle.strategyCard}.${idx}`}
                        $accent={accent}
                      >
                        <StrategyTitleRow>
                          <StrategyTitle>{s.title}</StrategyTitle>
                          <StrategyBadge $best={!!s.isBest}>
                            {s.isBest ? 'Best historical outcome' : `${s.count} matches`}
                          </StrategyBadge>
                        </StrategyTitleRow>
                        <StrategyMeta>{s.actionSummary}</StrategyMeta>
                        <StrategyMeta>
                          {outcomeText} • {successText}
                        </StrategyMeta>
                      </StrategyCard>
                    </View>
                  );
                })
              ) : (
                <CardSubtle>
                  {isComputingInsights
                    ? 'Strategies will appear as matches accumulate…'
                    : 'No strategies yet (not enough similar events).'}
                </CardSubtle>
              )}

              <Spacer h={theme.spacing.md} />

              <CardSubtle testID={E2E_TEST_IDS.oracle.disclaimer}>
                {insights.disclaimerText}
              </CardSubtle>
            </Card>

            <Spacer h={theme.spacing.md} />

            <Card testID={E2E_TEST_IDS.oracle.previousList}>
              <CardTitle>Previous events</CardTitle>
              <CardSubtle>
                Compare historical matches by closeness and outcome. Tap a row to open a rich chart.
              </CardSubtle>

              {!!insights.matches.length && (
                <>
                  <SegmentRow>
                    <SegmentButton
                      $active={previousSortMode === 'recent'}
                      onPress={() => setPreviousSortMode('recent')}
                    >
                      <SegmentText $active={previousSortMode === 'recent'}>Recent</SegmentText>
                    </SegmentButton>
                    <SegmentButton
                      $active={previousSortMode === 'closest'}
                      onPress={() => setPreviousSortMode('closest')}
                    >
                      <SegmentText $active={previousSortMode === 'closest'}>Closest</SegmentText>
                    </SegmentButton>
                    <SegmentButton
                      $active={previousSortMode === 'bestOutcome'}
                      onPress={() => setPreviousSortMode('bestOutcome')}
                    >
                      <SegmentText $active={previousSortMode === 'bestOutcome'}>Best outcome</SegmentText>
                    </SegmentButton>
                  </SegmentRow>

                  {(closestMatch || bestOutcomeMatch) && (
                    <CardSubtle>
                      Quick picks:{' '}
                      {closestMatch ? 'Closest' : ''}
                      {closestMatch && bestOutcomeMatch ? ' • ' : ''}
                      {bestOutcomeMatch ? 'Best outcome' : ''}
                      {' — tap the sort above to bring them to the top.'}
                    </CardSubtle>
                  )}
                </>
              )}
              {isComputingInsights && (
                <CardSubtle>
                  Updating list…
                </CardSubtle>
              )}

              <Spacer h={theme.spacing.sm} />

              {insights.matches.length ? (
                previousMatchesSorted.map((m, idx) => {
                  const when = formatDateToDateAndTimeString(m.anchorTs);
                  const s = summarizeMatch(m.points);
                  const within2h =
                    selectedEvent != null
                      ? isWithinNext2Hours({anchorTs: selectedEvent.date, candidateTs: m.anchorTs})
                      : false;

                  const dBg = selectedEvent ? Math.round(Math.abs(m.anchorSgv - selectedEvent.sgv)) : null;
                  const dSlope = selectedEvent ? Math.abs(m.slope - selectedEvent.slope) : null;
                  const shapeRmse = previousMatchMeta?.shapeRmseByAnchor.get(m.anchorTs) ?? null;

                  const metaParts: string[] = [];
                  if (s.min2h != null && s.max4h != null) {
                    metaParts.push(`2h min ${fmtBg(s.min2h)} • 4h max ${fmtBg(s.max4h)}`);
                  } else {
                    metaParts.push('Outcome unavailable');
                  }

                  if (dBg != null && dSlope != null) {
                    metaParts.push(`ΔBG ${dBg} • Δslope ${dSlope.toFixed(1)}`);
                  }
                  if (shapeRmse != null) {
                    metaParts.push(`Shape ${Math.round(shapeRmse)}`);
                  }

                  metaParts.push(`IOB ${fmtIob(m.iob ?? null)} • COB ${fmtCob(m.cob ?? null)}`);
                  metaParts.push(`TIR(0–2h) ${formatPercent(m.tir2h)}`);
                  metaParts.push(within2h ? 'Within next 2h' : 'Outside next 2h');

                  const meta = metaParts.join(' • ');

                  const selected = selectedPreviousTs === m.anchorTs;

                  return (
                    <Row
                      key={m.anchorTs}
                      testID={`${E2E_TEST_IDS.oracle.previousRow}.${idx}`}
                      accessibilityLabel={`${E2E_TEST_IDS.oracle.previousRow}.${idx}`}
                      $selected={selected}
                      onPress={() => openPreviousMatch(m.anchorTs)}>
                      <RowLeft>
                        <RowTitle>{when}</RowTitle>
                        <RowMeta>{meta}</RowMeta>
                      </RowLeft>
                      <RowRight>{m.anchorSgv}</RowRight>
                    </Row>
                  );
                })
              ) : isComputingInsights ? (
                <CardSubtle>
                  Scanning history… matches will appear here as they’re found.
                </CardSubtle>
              ) : isSyncing ? (
                <CardSubtle>Searching history…</CardSubtle>
              ) : (
                <CardSubtle testID={E2E_TEST_IDS.oracle.noMatches}>
                  No similar events found.
                </CardSubtle>
              )}

              {!!selectedPrevious && (
                <>
                  <Spacer h={theme.spacing.md} />
                  <OracleMatchDetailsCard
                    testID={E2E_TEST_IDS.oracle.previousDetails}
                    match={selectedPrevious}
                    currentSeries={insights.currentSeries}
                    medianSeries={insights.medianSeries}
                    width={Math.max(1, width - theme.spacing.xxl * 2)}
                  />
                </>
              )}
            </Card>
          </>
        ) : (
          <Text />
        )}
      </ScrollView>
    </Container>
  );
};

export default Oracle;
