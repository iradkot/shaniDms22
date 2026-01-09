import React, {useCallback, useMemo, useState} from 'react';
import {
  Pressable,
  ScrollView,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
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

const Container = styled.View<{theme: ThemeType}>`
  flex: 1;
  background-color: ${({theme}) => theme.backgroundColor};
`;

const StrategyCard = styled.View<{theme: Theme; $accent?: string}>`
  background-color: ${({theme}) => theme.white};
  border-radius: ${({theme}) => theme.borderRadius}px;
  border-width: 1px;
  border-color: ${({theme}) => theme.borderColor};
  padding: ${({theme}) => theme.spacing.lg}px;
  border-left-width: 6px;
  border-left-color: ${({theme, $accent}) => $accent ?? theme.borderColor};
`;

const StrategyTitleRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const StrategyTitle = styled.Text<{theme: Theme}>`
  font-size: ${({theme}) => theme.typography.size.md}px;
  font-weight: 800;
  color: ${({theme}) => theme.textColor};
`;

const StrategyBadge = styled.Text<{theme: Theme; $best?: boolean}>`
  font-size: ${({theme}) => theme.typography.size.xs}px;
  font-weight: 800;
  color: ${({theme, $best}) => ($best ? theme.accentColor : addOpacity(theme.textColor, 0.7))};
`;

const StrategyMeta = styled.Text<{theme: Theme}>`
  margin-top: ${({theme}) => theme.spacing.sm}px;
  font-size: ${({theme}) => theme.typography.size.sm}px;
  color: ${({theme}) => addOpacity(theme.textColor, 0.8)};
`;

const ToggleRow = styled.View`
  margin-top: ${({theme}) => theme.spacing.md}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const ToggleLabel = styled.Text<{theme: Theme}>`
  flex: 1;
  margin-right: ${({theme}) => theme.spacing.md}px;
  font-size: ${({theme}) => theme.typography.size.sm}px;
  color: ${({theme}) => addOpacity(theme.textColor, 0.9)};
`;

const StepperRow = styled.View`
  margin-top: ${({theme}) => theme.spacing.md}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const StepperControls = styled.View`
  flex-direction: row;
  align-items: center;
`;

const StepperValue = styled.Text<{theme: ThemeType}>`
  min-width: ${STEPPER_VALUE_MIN_WIDTH_PX}px;
  text-align: center;
  font-size: ${({theme}) => theme.typography.size.sm}px;
  font-weight: 800;
  color: ${({theme}) => theme.textColor};
`;

const StepperButton = styled(Pressable)<{theme: ThemeType}>`
  padding-vertical: ${({theme}) => theme.spacing.xs}px;
  padding-horizontal: ${({theme}) => theme.spacing.sm}px;
  border-radius: ${({theme}) => theme.borderRadius}px;
  border-width: 1px;
  border-color: ${({theme}) => addOpacity(theme.borderColor, 0.9)};
`;

const StepperButtonText = styled.Text<{theme: ThemeType}>`
  font-size: ${({theme}) => theme.typography.size.sm}px;
  font-weight: 800;
  color: ${({theme}) => theme.textColor};
`;

const Oracle: React.FC = () => {
  const {width} = useWindowDimensions();
  const theme = useTheme() as ThemeType;
  const [selectedEventTs, setSelectedEventTs] = useState<number | null>(null);
  const [selectedPreviousTs, setSelectedPreviousTs] = useState<number | null>(null);
  const [includeLoadInMatching, setIncludeLoadInMatching] = useState(true);
  const [slopePointCount, setSlopePointCount] = useState<number>(ORACLE_SLOPE_POINTS_DEFAULT);
  const {
    insights,
    events,
    selectedEvent,
    isLoading,
    error,
    lastSyncedMs,
    historyCount,
    isSyncing,
    status,
    retry,
  } =
    useOracleInsights({selectedEventTs, includeLoadInMatching, slopePointCount});

  const summaryText = useMemo(() => {
    if (!selectedEvent) return 'Waiting for recent data…';
    if (!insights) return 'Searching cached history…';
    if (isSyncing && insights.matchCount === 0) return 'Searching cached history…';
    return `Found ${insights.matchCount} previous similar events.`;
  }, [insights, isSyncing, selectedEvent]);

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
                  trackColor={{
                    false: addOpacity(theme.textColor, 0.2),
                    true: addOpacity(theme.accentColor, 0.4),
                  }}
                  thumbColor={includeLoadInMatching ? theme.accentColor : theme.borderColor}
                />
              </ToggleRow>

              <StepperRow>
                <ToggleLabel>
                  Slope points (noise smoothing)
                </ToggleLabel>
                <StepperControls>
                  <StepperButton
                    testID={E2E_TEST_IDS.oracle.slopeMinus}
                    accessibilityLabel={E2E_TEST_IDS.oracle.slopeMinus}
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
            </>
          )}

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
              actionLabel="Retry"
              actionTestID={E2E_TEST_IDS.oracle.retryButton}
              onPressAction={retry}
            />
          )}

          {!!error && status.state !== 'error' && (
            <OracleStatusBanner
              testID={E2E_TEST_IDS.oracle.statusBanner}
              tone="warn"
              message="Live fetch unavailable; showing cached data when possible."
              actionLabel="Retry"
              actionTestID={E2E_TEST_IDS.oracle.retryButton}
              onPressAction={retry}
            />
          )}

          {status.state === 'syncing' && status.hasHistory && (
            <OracleStatusBanner
              testID={E2E_TEST_IDS.oracle.statusBanner}
              tone="info"
              message={status.message}
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

        {isLoading && !insights ? (
          <View style={{alignItems: 'center', paddingVertical: LOADER_PADDING_VERTICAL_PX}}>
            <Loader />
            {status.state === 'loading' && (
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
                <CardSubtle>No strategies yet (not enough similar events).</CardSubtle>
              )}

              <Spacer h={theme.spacing.md} />

              <CardSubtle testID={E2E_TEST_IDS.oracle.disclaimer}>
                {insights.disclaimerText}
              </CardSubtle>
            </Card>

            <Spacer h={theme.spacing.md} />

            <Card testID={E2E_TEST_IDS.oracle.previousList}>
              <CardTitle>Previous events</CardTitle>
              <CardSubtle>Most recent similar events from history.</CardSubtle>

              <Spacer h={theme.spacing.sm} />

              {insights.matches.length ? (
                insights.matches.slice(0, PREVIOUS_MATCHES_LIMIT).map((m, idx) => {
                  const when = formatDateToDateAndTimeString(m.anchorTs);
                  const s = summarizeMatch(m.points);
                  const within2h =
                    selectedEvent != null
                      ? isWithinNext2Hours({anchorTs: selectedEvent.date, candidateTs: m.anchorTs})
                      : false;

                  const metaParts: string[] = [];
                  if (s.min2h != null && s.max4h != null) {
                    metaParts.push(`2h min ${fmtBg(s.min2h)} • 4h max ${fmtBg(s.max4h)}`);
                  } else {
                    metaParts.push('Outcome unavailable');
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
