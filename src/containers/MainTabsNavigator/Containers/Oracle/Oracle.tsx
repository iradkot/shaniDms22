import React, {useMemo, useState} from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import styled, {useTheme} from 'styled-components/native';

import {Theme} from 'app/types/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import Loader from 'app/components/common-ui/Loader/Loader';
import {useOracleInsights} from 'app/hooks/useOracleInsights';
import OracleGhostGraph from 'app/components/charts/OracleGhostGraph/OracleGhostGraph';
import {addOpacity} from 'app/style/styling.utils';
import {
  formatDateToDateAndTimeString,
  formatDateToLocaleTimeString,
  getTimeInMinutes,
} from 'app/utils/datetime.utils';

const Container = styled.View<{theme: Theme}>`
  flex: 1;
  background-color: ${({theme}) => theme.backgroundColor};
`;

const Card = styled.View<{theme: Theme}>`
  background-color: ${({theme}) => theme.white};
  border-radius: ${({theme}) => theme.borderRadius}px;
  border-width: 1px;
  border-color: ${({theme}) => theme.borderColor};
  padding: ${({theme}) => theme.spacing.lg}px;
`;

const CardTitle = styled.Text<{theme: Theme}>`
  font-size: ${({theme}) => theme.typography.size.lg}px;
  font-weight: 700;
  color: ${({theme}) => theme.textColor};
`;

const CardSubtle = styled.Text<{theme: Theme}>`
  margin-top: ${({theme}) => theme.spacing.sm}px;
  font-size: ${({theme}) => theme.typography.size.sm}px;
  color: ${({theme}) => addOpacity(theme.textColor, 0.7)};
`;

const Spacer = styled.View<{h: number}>`
  height: ${({h}) => h}px;
`;

const Row = styled(Pressable)<{theme: Theme; $selected?: boolean}>`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-vertical: ${({theme}) => theme.spacing.sm}px;
  padding-horizontal: ${({theme}) => theme.spacing.md}px;
  border-radius: ${({theme}) => theme.borderRadius}px;
  background-color: ${({theme, $selected}) =>
    $selected ? addOpacity(theme.accentColor, 0.12) : 'transparent'};
`;

const RowLeft = styled.View`
  flex: 1;
  padding-right: 12px;
`;

const RowTitle = styled.Text<{theme: Theme}>`
  font-size: ${({theme}) => theme.typography.size.md}px;
  color: ${({theme}) => theme.textColor};
  font-weight: 600;
`;

const RowMeta = styled.Text<{theme: Theme}>`
  margin-top: 2px;
  font-size: ${({theme}) => theme.typography.size.sm}px;
  color: ${({theme}) => addOpacity(theme.textColor, 0.7)};
`;

const RowRight = styled.Text<{theme: Theme}>`
  font-size: ${({theme}) => theme.typography.size.md}px;
  color: ${({theme}) => theme.textColor};
  font-weight: 700;
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

function formatOracleKind(kind: string): string {
  if (kind === 'rising') return 'Rising';
  if (kind === 'falling') return 'Falling';
  if (kind === 'stable') return 'Stable';
  return kind;
}

function summarizeMatch(points: Array<{tMin: number; sgv: number}>): {
  min2h: number | null;
  max4h: number | null;
} {
  const in2h = points.filter(p => p.tMin >= 0 && p.tMin <= 120).map(p => p.sgv);
  const in4h = points.filter(p => p.tMin >= 0 && p.tMin <= 240).map(p => p.sgv);

  return {
    min2h: in2h.length ? Math.min(...in2h) : null,
    max4h: in4h.length ? Math.max(...in4h) : null,
  };
}

function minutesForwardDiff(fromMinutes: number, toMinutes: number): number {
  const day = 24 * 60;
  return (toMinutes - fromMinutes + day) % day;
}

/**
 * Returns whether a candidate event time-of-day occurs within the next 2 hours
 * relative to the currently investigated anchor time-of-day (local time).
 */
function isWithinNext2Hours(params: {anchorTs: number; candidateTs: number}): boolean {
  const anchorMin = getTimeInMinutes(new Date(params.anchorTs));
  const candidateMin = getTimeInMinutes(new Date(params.candidateTs));
  return minutesForwardDiff(anchorMin, candidateMin) <= 120;
}

/** Formats 0..1 ratio as a human percent string. */
function formatPercent(p: number | null | undefined): string {
  if (typeof p !== 'number' || !Number.isFinite(p)) return '—';
  return `${Math.round(p * 100)}%`;
}

/** Formats BG for compact UI display (rounded, or em dash when missing). */
function fmtBg(v: number | null): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v)) : '—';
}

const Oracle: React.FC = () => {
  const {width} = useWindowDimensions();
  const theme = useTheme() as Theme;
  const [selectedEventTs, setSelectedEventTs] = useState<number | null>(null);
  const [selectedPreviousTs, setSelectedPreviousTs] = useState<number | null>(null);
  const {insights, events, selectedEvent, isLoading, error, lastSyncedMs} =
    useOracleInsights({selectedEventTs});

  const summaryText = useMemo(() => {
    if (!selectedEvent) return 'Waiting for recent data…';
    if (!insights) return 'Searching cached history…';
    return `Found ${insights.matchCount} previous similar events.`;
  }, [insights, selectedEvent]);

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

  return (
    <Container testID={E2E_TEST_IDS.screens.oracle}>
      <ScrollView contentContainerStyle={{padding: 16}}>
        <Card>
          <CardTitle>Investigate Events</CardTitle>
          {!!selectedLabel && <CardSubtle>{selectedLabel}</CardSubtle>}
          <CardSubtle>{summaryText}</CardSubtle>
          {typeof lastSyncedMs === 'number' && (
            <CardSubtle>
              Cache updated: {formatDateToDateAndTimeString(lastSyncedMs)}
            </CardSubtle>
          )}
          {!!error && (
            <CardSubtle>
              Note: Live fetch unavailable; showing cached data when possible.
            </CardSubtle>
          )}
        </Card>

        <Spacer h={12} />

        <Card testID={E2E_TEST_IDS.oracle.eventsList}>
          <CardTitle>Pick an event</CardTitle>
          <CardSubtle>Choose a recent point to compare against history.</CardSubtle>

          <Spacer h={8} />

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
                      {when} • slope {e.slope.toFixed(1)} mg/dL/min
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

        <Spacer h={12} />

        {isLoading && !insights ? (
          <View style={{alignItems: 'center', paddingVertical: 20}}>
            <Loader />
          </View>
        ) : insights ? (
          <>
            <OracleGhostGraph
              testID={E2E_TEST_IDS.charts.oracleGhostGraph}
              width={Math.max(1, width - 32)}
              height={260}
              currentSeries={insights.currentSeries}
              matches={insights.matches}
              medianSeries={insights.medianSeries}
            />

            <Spacer h={12} />

            <Card testID={E2E_TEST_IDS.oracle.strategiesList}>
              <CardTitle>What tended to work</CardTitle>
              <CardSubtle>
                Strategy cards group similar past events by actions taken in the first 30 minutes.
              </CardSubtle>

              <Spacer h={8} />

              {insights.strategies.length ? (
                insights.strategies.map((s, idx) => {
                  const outcomeText =
                    typeof s.avgBg2h === 'number'
                      ? `Avg +2h BG ${s.avgBg2h}`
                      : 'Avg +2h BG unavailable';

                  const successText =
                    typeof s.successRate === 'number'
                      ? `${Math.round(s.successRate * 100)}% in ${70}–${140} at +2h`
                      : 'Success rate unavailable';

                  const accent =
                    typeof s.avgBg2h === 'number'
                      ? theme.determineBgColorByGlucoseValue(s.avgBg2h)
                      : undefined;

                  return (
                    <View key={s.key} style={{marginTop: idx === 0 ? 0 : 10}}>
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

              <Spacer h={12} />

              <CardSubtle testID={E2E_TEST_IDS.oracle.disclaimer}>
                {insights.disclaimerText}
              </CardSubtle>
            </Card>

            <Spacer h={12} />

            <Card testID={E2E_TEST_IDS.oracle.previousList}>
              <CardTitle>Previous events</CardTitle>
              <CardSubtle>Most recent similar events from history.</CardSubtle>

              <Spacer h={8} />

              {insights.matches.length ? (
                insights.matches.slice(0, 10).map((m, idx) => {
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
                      onPress={() =>
                        setSelectedPreviousTs(prev => (prev === m.anchorTs ? null : m.anchorTs))
                      }>
                      <RowLeft>
                        <RowTitle>{when}</RowTitle>
                        <RowMeta>{meta}</RowMeta>
                      </RowLeft>
                      <RowRight>{m.anchorSgv}</RowRight>
                    </Row>
                  );
                })
              ) : (
                <CardSubtle>No similar events found.</CardSubtle>
              )}

              {!!selectedPrevious && (
                <>
                  <Spacer h={12} />
                  <Card>
                    <CardTitle>Event details</CardTitle>
                    <CardSubtle>{formatDateToDateAndTimeString(selectedPrevious.anchorTs)}</CardSubtle>

                    <Spacer h={8} />

                    <OracleGhostGraph
                      width={Math.max(1, width - 64)}
                      height={220}
                      currentSeries={[]}
                      matches={[selectedPrevious]}
                      medianSeries={[]}
                    />

                    <Spacer h={8} />

                    <CardSubtle>
                      Boluses (0–30m): {selectedPrevious.actionCounts30m?.boluses ?? 0} • Insulin:{' '}
                      {selectedPrevious.actions30m?.insulin?.toFixed?.(1) ?? '0.0'}U • Carbs:{' '}
                      {selectedPrevious.actions30m?.carbs != null
                        ? Math.round(selectedPrevious.actions30m.carbs)
                        : 0}
                      g
                    </CardSubtle>

                    <CardSubtle>
                      IOB/COB at event:{' '}
                      {selectedPrevious.iob != null ? `${selectedPrevious.iob.toFixed(1)}U` : '—'} /{' '}
                      {selectedPrevious.cob != null ? `${Math.round(selectedPrevious.cob)}g` : '—'}
                    </CardSubtle>
                  </Card>
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
