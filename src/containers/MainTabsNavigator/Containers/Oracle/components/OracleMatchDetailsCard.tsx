import React, {useMemo, useState} from 'react';
import {Pressable, View} from 'react-native';
import styled, {useTheme} from 'styled-components/native';

import {OracleMatchTrace, OracleSeriesPoint} from 'app/services/oracle/oracleTypes';
import OracleGhostGraph from 'app/components/charts/OracleGhostGraph/OracleGhostGraph';
import CgmGraph, {CGMGraphExternalTooltipPayload} from 'app/components/charts/CgmGraph/CgmGraph';
import ActiveInsulinMiniGraph from 'app/components/charts/ActiveInsulinMiniGraph/ActiveInsulinMiniGraph';
import CobMiniGraph from 'app/components/charts/CobMiniGraph/CobMiniGraph';
import {formatDateToDateAndTimeString} from 'app/utils/datetime.utils';
import {oracleLoadPointsToBgSamples, oracleMatchToCgmGraphData} from 'app/services/oracle/oracleCgmGraphAdapter';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {BgSample} from 'app/types/day_bgs.types';

import {Card, CardSubtle, CardTitle, Spacer} from './OracleCards';

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

const CHART_HEIGHT_PX = 240;
const IOB_CHART_HEIGHT_PX = 120;
const COB_CHART_HEIGHT_PX = 110;
const HOUR_MS = 60 * 60 * 1000;

function snapToClosestBgTimeMs(bgSamples: BgSample[], ts: number): number {
  if (!bgSamples.length) return ts;

  // `bgSamples` are expected to be time-sorted.
  let lo = 0;
  let hi = bgSamples.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bgSamples[mid].date < ts) lo = mid + 1;
    else hi = mid;
  }

  const prev = lo > 0 ? bgSamples[lo - 1] : null;
  const next = lo < bgSamples.length ? bgSamples[lo] : null;
  if (!prev) return next?.date ?? ts;
  if (!next) return prev.date;
  return Math.abs(prev.date - ts) <= Math.abs(next.date - ts) ? prev.date : next.date;
}

function findClosestSampleByTime(bgSamples: BgSample[], ts: number | null): BgSample | null {
  if (!bgSamples.length) return null;
  if (ts == null) return bgSamples[bgSamples.length - 1] ?? null;

  // `bgSamples` are expected to be time-sorted.
  let lo = 0;
  let hi = bgSamples.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bgSamples[mid].date < ts) lo = mid + 1;
    else hi = mid;
  }

  const prev = lo > 0 ? bgSamples[lo - 1] : null;
  const next = lo < bgSamples.length ? bgSamples[lo] : null;
  if (!prev) return next;
  if (!next) return prev;
  return Math.abs(prev.date - ts) <= Math.abs(next.date - ts) ? prev : next;
}

/**
 * Details for a single matched historical event.
 *
 * Today this renders the existing Oracle ghost-graph view.
 *
 * This component is intentionally isolated so we can later add:
 * - A drill-down screen (navigation)
 * - `CgmGraph` rendering with insulin/carbs markers
 * - A TIR row (via `TimeInRangeRow`)
 * without changing the surrounding Oracle screen logic.
 */
export function OracleMatchDetailsCard(props: {
  match: OracleMatchTrace;
  currentSeries?: OracleSeriesPoint[];
  medianSeries?: OracleSeriesPoint[];
  width: number;
  testID?: string;
}): React.JSX.Element {
  const {match, width, currentSeries, medianSeries} = props;
  const theme = useTheme() as ThemeType;
  const [viewMode, setViewMode] = useState<'chart' | 'ghost'>('chart');
  const [cursorTimeMs, setCursorTimeMs] = useState<number | null>(null);

  const cgm = useMemo(() => oracleMatchToCgmGraphData(match), [match]);
  const xDomain = useMemo(
    () => [new Date(cgm.windowStartMs), new Date(cgm.windowEndMs)] as [Date, Date],
    [cgm.windowEndMs, cgm.windowStartMs],
  );

  const loadBgSamples = useMemo(
    () => oracleLoadPointsToBgSamples({anchorTs: match.anchorTs, loadPoints: match.loadPoints}),
    [match.anchorTs, match.loadPoints],
  );

  const hasIob = useMemo(() => {
    for (const s of loadBgSamples) {
      if (typeof s.iob === 'number') return true;
      if (typeof s.iobBolus === 'number') return true;
      if (typeof s.iobBasal === 'number') return true;
    }
    return false;
  }, [loadBgSamples]);

  const hasCob = useMemo(() => {
    for (const s of loadBgSamples) {
      if (typeof s.cob === 'number') return true;
    }
    return false;
  }, [loadBgSamples]);

  const loadSampleAtCursor = useMemo(
    () => findClosestSampleByTime(loadBgSamples, cursorTimeMs),
    [cursorTimeMs, loadBgSamples],
  );

  const loadLegendText = useMemo(() => {
    const s = loadSampleAtCursor;
    if (!s) return null;

    const parts: string[] = [];
    const hasSplit = typeof s.iobBolus === 'number' || typeof s.iobBasal === 'number';
    const totalIob =
      typeof s.iob === 'number'
        ? s.iob
        : hasSplit
          ? (typeof s.iobBolus === 'number' ? s.iobBolus : 0) + (typeof s.iobBasal === 'number' ? s.iobBasal : 0)
          : null;

    if (totalIob != null && Number.isFinite(totalIob)) {
      if (hasSplit) {
        const bolus = typeof s.iobBolus === 'number' ? s.iobBolus : 0;
        const basal = typeof s.iobBasal === 'number' ? s.iobBasal : 0;
        parts.push(`IOB ${totalIob.toFixed(2)}U (bolus ${bolus.toFixed(2)} + basal ${basal.toFixed(2)})`);
      } else {
        parts.push(`IOB ${totalIob.toFixed(2)}U`);
      }
    }

    if (typeof s.cob === 'number' && Number.isFinite(s.cob)) {
      parts.push(`COB ${Math.round(s.cob)}g`);
    }

    if (!parts.length) return null;

    return cursorTimeMs != null ? `Load at cursor: ${parts.join(' • ')}` : `Load: ${parts.join(' • ')}`;
  }, [cursorTimeMs, loadSampleAtCursor]);

  const xTickLabelFormatter = useMemo(() => {
    return (d: Date) => {
      const h = Math.round((d.getTime() - match.anchorTs) / HOUR_MS);
      if (h === 0) return '0';
      return `${h > 0 ? '+' : ''}${h}h`;
    };
  }, [match.anchorTs]);

  const onTooltipChange = useMemo(() => {
    return (payload: CGMGraphExternalTooltipPayload | null) => {
      if (!payload?.touchTimeMs) {
        setCursorTimeMs(null);
        return;
      }
      setCursorTimeMs(snapToClosestBgTimeMs(cgm.bgSamples, payload.touchTimeMs));
    };
  }, [cgm.bgSamples]);

  return (
    <Card testID={props.testID}>
      <CardTitle>Event details</CardTitle>
      <CardSubtle>{formatDateToDateAndTimeString(match.anchorTs)}</CardSubtle>

      <SegmentRow>
        <SegmentButton $active={viewMode === 'chart'} onPress={() => setViewMode('chart')}>
          <SegmentText $active={viewMode === 'chart'}>Chart</SegmentText>
        </SegmentButton>
        <SegmentButton $active={viewMode === 'ghost'} onPress={() => setViewMode('ghost')}>
          <SegmentText $active={viewMode === 'ghost'}>Overlay</SegmentText>
        </SegmentButton>
      </SegmentRow>

      <Spacer h={8} />

      {viewMode === 'chart' ? (
        <>
          <View style={{width: Math.max(1, width), height: CHART_HEIGHT_PX}}>
            <CgmGraph
              width={Math.max(1, width)}
              height={CHART_HEIGHT_PX}
              bgSamples={cgm.bgSamples}
              foodItems={cgm.foodItems}
              insulinData={cgm.insulinData}
              xDomain={xDomain}
              xTickLabelFormatter={xTickLabelFormatter}
              showDateLabels={false}
              showFullScreenButton={false}
              tooltipMode="external"
              onTooltipChange={onTooltipChange}
              cursorTimeMs={cursorTimeMs}
            />
          </View>

          {(hasIob || hasCob) && (
            <>
              <Spacer h={8} />
              {hasIob ? (
                <View style={{width: Math.max(1, width), height: IOB_CHART_HEIGHT_PX}}>
                  <ActiveInsulinMiniGraph
                    width={Math.max(1, width)}
                    height={IOB_CHART_HEIGHT_PX}
                    bgSamples={loadBgSamples}
                    xDomain={xDomain}
                    cursorTimeMs={cursorTimeMs}
                  />
                </View>
              ) : null}

              {hasCob ? (
                <>
                  <Spacer h={6} />
                  <View style={{width: Math.max(1, width), height: COB_CHART_HEIGHT_PX}}>
                    <CobMiniGraph
                      width={Math.max(1, width)}
                      height={COB_CHART_HEIGHT_PX}
                      bgSamples={loadBgSamples}
                      xDomain={xDomain}
                      cursorTimeMs={cursorTimeMs}
                    />
                  </View>
                </>
              ) : null}

              {loadLegendText ? (
                <>
                  <Spacer h={6} />
                  <CardSubtle>{loadLegendText}</CardSubtle>
                </>
              ) : null}
            </>
          )}
        </>
      ) : (
        <OracleGhostGraph
          width={Math.max(1, width)}
          height={220}
          currentSeries={currentSeries ?? []}
          matches={[match]}
          medianSeries={medianSeries ?? []}
        />
      )}

      <Spacer h={8} />

      <CardSubtle>
        Boluses (0–30m): {match.actionCounts30m?.boluses ?? 0} • Insulin:{' '}
        {match.actions30m?.insulin?.toFixed?.(1) ?? '0.0'}U • Carbs:{' '}
        {match.actions30m?.carbs != null ? Math.round(match.actions30m.carbs) : 0}g
      </CardSubtle>

      {viewMode === 'chart' && (
        <CardSubtle>
          Chart shows -2h to +4h around the match; bolus/carbs markers are from 0–30m after the match.
        </CardSubtle>
      )}

      <CardSubtle>
        IOB/COB at event: {match.iob != null ? `${match.iob.toFixed(1)}U` : '—'} /{' '}
        {match.cob != null ? `${Math.round(match.cob)}g` : '—'}
      </CardSubtle>
    </Card>
  );
}
