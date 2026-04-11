/**
 * Combined mini chart that overlays basal rate, active insulin, and COB
 * in a single SVG area. Used in "mixed" chart mode on the Home screen.
 *
 * Each series has its own y-scale but shares the same x-axis (time).
 * Color-coded:
 *   - Basal rate:      translucent blue rects
 *   - Active insulin:  translucent purple area
 *   - COB:             translucent orange area
 */
import React, {useMemo} from 'react';
import {View} from 'react-native';
import Svg, {Circle, G, Line, Path, Rect, Text} from 'react-native-svg';
import styled, {useTheme} from 'styled-components/native';
import * as d3 from 'd3';

import type {BgSample} from 'app/types/day_bgs.types';
import type {InsulinDataEntry} from 'app/types/insulin.types';
import type {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

// ── Props ───────────────────────────────────────────────────────────────

type Props = {
  width: number;
  height: number;
  bgSamples: BgSample[];
  insulinData?: InsulinDataEntry[];
  xDomain?: [Date, Date] | null;
  cursorTimeMs?: number | null;
  margin?: {top: number; right: number; bottom: number; left: number};
  testID?: string;
};

// ── Styled ──────────────────────────────────────────────────────────────

const StyledSvg = styled(Svg)`
  height: 100%;
  width: 100%;
`;

// ── Component ───────────────────────────────────────────────────────────

const MixedMiniChart: React.FC<Props> = ({
  width,
  height,
  bgSamples,
  insulinData,
  xDomain,
  cursorTimeMs,
  margin: marginOverride,
  testID,
}) => {
  const theme = useTheme() as ThemeType;

  const margin = useMemo(
    () => marginOverride ?? {top: 16, right: 15, bottom: 12, left: 50},
    [marginOverride],
  );
  const graphWidth = Math.max(1, width - margin.left - margin.right);
  const graphHeight = Math.max(1, height - margin.top - margin.bottom);

  // ── Shared x-axis ───────────────────────────────────────────────────

  const xDomainResolved = useMemo(() => {
    if (xDomain) return xDomain;
    const extent = d3.extent(bgSamples ?? [], s => new Date(s.date));
    if (extent[0] && extent[1]) return extent as [Date, Date];
    const now = new Date();
    return [now, now] as [Date, Date];
  }, [bgSamples, xDomain]);

  const xScale = useMemo(
    () => d3.scaleTime().domain(xDomainResolved).range([0, graphWidth]),
    [graphWidth, xDomainResolved],
  );

  // ── Basal segments ──────────────────────────────────────────────────

  const basalSegments = useMemo(() => {
    type Segment = {startMs: number; endMs: number; rate: number};
    const entries = (insulinData ?? [])
      .filter(e => e.type === 'tempBasal')
      .map(e => {
        const startMs =
          (e.startTime ? Date.parse(e.startTime) : NaN) ||
          (e.timestamp ? Date.parse(e.timestamp) : NaN);
        const endMsRaw = e.endTime ? Date.parse(e.endTime) : NaN;
        const endMsFromDuration =
          Number.isFinite(startMs) && typeof e.duration === 'number' && Number.isFinite(e.duration)
            ? startMs + e.duration * 60_000
            : NaN;
        const endMs = Number.isFinite(endMsRaw) ? endMsRaw : endMsFromDuration;
        const rate = typeof e.rate === 'number' && Number.isFinite(e.rate) ? e.rate : 0;
        return {startMs, endMs, rate: Math.max(0, rate)};
      })
      .filter(e => Number.isFinite(e.startMs))
      .sort((a, b) => a.startMs - b.startMs);

    if (!entries.length) return [] as Segment[];

    const [domainStart, domainEnd] = xDomainResolved;
    const domainStartMs = domainStart.getTime();
    const domainEndMs = domainEnd.getTime();

    const out: Segment[] = [];
    for (let i = 0; i < entries.length; i++) {
      const current = entries[i];
      const next = entries[i + 1];
      const fallbackEnd = next?.startMs ?? domainEndMs;
      const resolvedEnd = Number.isFinite(current.endMs) ? current.endMs : fallbackEnd;

      const startMs = Math.max(domainStartMs, current.startMs);
      const endMs = Math.min(domainEndMs, resolvedEnd);
      if (!(endMs > startMs)) continue;
      out.push({startMs, endMs, rate: current.rate});
    }
    return out;
  }, [insulinData, xDomainResolved]);

  const maxBasalRate = useMemo(() => {
    let max = 0;
    for (const seg of basalSegments) {
      if (seg.rate > max) max = seg.rate;
    }
    return Math.max(0.5, max * 1.1);
  }, [basalSegments]);

  const yScaleBasal = useMemo(
    () => d3.scaleLinear().domain([0, maxBasalRate]).range([graphHeight, 0]),
    [graphHeight, maxBasalRate],
  );

  // ── Active insulin (IOB) series ─────────────────────────────────────

  const iobPoints = useMemo(() => {
    const pts: Array<{x: number; y: number}> = [];
    for (const s of bgSamples ?? []) {
      const ts = typeof s.date === 'number' ? s.date : Date.parse(String(s.date));
      if (!Number.isFinite(ts)) continue;
      let iob: number | null = null;
      if (typeof s.iob === 'number') {
        iob = s.iob;
      } else if (typeof s.iobBolus === 'number' || typeof s.iobBasal === 'number') {
        iob = ((s.iobBolus as number) || 0) + ((s.iobBasal as number) || 0);
      }
      if (iob != null && Number.isFinite(iob)) {
        pts.push({x: ts, y: Math.max(0, iob)});
      }
    }
    pts.sort((a, b) => a.x - b.x);
    const [s, e] = xDomainResolved;
    return pts.filter(p => p.x >= s.getTime() && p.x <= e.getTime());
  }, [bgSamples, xDomainResolved]);

  const maxIob = useMemo(() => {
    let max = 0;
    for (const p of iobPoints) if (p.y > max) max = p.y;
    return Math.max(0.1, max * 1.1);
  }, [iobPoints]);

  const yScaleIob = useMemo(
    () => d3.scaleLinear().domain([0, maxIob]).range([graphHeight, 0]),
    [graphHeight, maxIob],
  );

  const iobAreaPath = useMemo(() => {
    if (!iobPoints.length) return null;
    const area = d3
      .area<{x: number; y: number}>()
      .x(d => xScale(new Date(d.x)))
      .y0(graphHeight)
      .y1(d => yScaleIob(d.y))
      .curve(d3.curveMonotoneX);
    return area(iobPoints) || null;
  }, [iobPoints, xScale, yScaleIob, graphHeight]);

  const iobLinePath = useMemo(() => {
    if (!iobPoints.length) return null;
    const line = d3
      .line<{x: number; y: number}>()
      .x(d => xScale(new Date(d.x)))
      .y(d => yScaleIob(d.y))
      .curve(d3.curveMonotoneX);
    return line(iobPoints) || null;
  }, [iobPoints, xScale, yScaleIob]);

  // ── COB series ──────────────────────────────────────────────────────

  const cobPoints = useMemo(() => {
    const pts: Array<{x: number; y: number}> = [];
    for (const s of bgSamples ?? []) {
      const ts = typeof s.date === 'number' ? s.date : Date.parse(String(s.date));
      if (!Number.isFinite(ts)) continue;
      if (typeof s.cob !== 'number' || !Number.isFinite(s.cob)) continue;
      pts.push({x: ts, y: Math.max(0, s.cob)});
    }
    pts.sort((a, b) => a.x - b.x);
    const [s, e] = xDomainResolved;
    return pts.filter(p => p.x >= s.getTime() && p.x <= e.getTime());
  }, [bgSamples, xDomainResolved]);

  const maxCob = useMemo(() => {
    let max = 0;
    for (const p of cobPoints) if (p.y > max) max = p.y;
    return Math.max(1, max * 1.1);
  }, [cobPoints]);

  const yScaleCob = useMemo(
    () => d3.scaleLinear().domain([0, maxCob]).range([graphHeight, 0]),
    [graphHeight, maxCob],
  );

  const cobAreaPath = useMemo(() => {
    if (!cobPoints.length) return null;
    const area = d3
      .area<{x: number; y: number}>()
      .x(d => xScale(new Date(d.x)))
      .y0(graphHeight)
      .y1(d => yScaleCob(d.y))
      .curve(d3.curveMonotoneX);
    return area(cobPoints) || null;
  }, [cobPoints, xScale, yScaleCob, graphHeight]);

  const cobLinePath = useMemo(() => {
    if (!cobPoints.length) return null;
    const line = d3
      .line<{x: number; y: number}>()
      .x(d => xScale(new Date(d.x)))
      .y(d => yScaleCob(d.y))
      .curve(d3.curveMonotoneX);
    return line(cobPoints) || null;
  }, [cobPoints, xScale, yScaleCob]);

  // ── Cursor helpers ──────────────────────────────────────────────────

  const cursorX = useMemo(() => {
    if (cursorTimeMs == null) return null;
    const [start, end] = xDomainResolved;
    if (cursorTimeMs < start.getTime() || cursorTimeMs > end.getTime()) return null;
    return xScale(new Date(cursorTimeMs));
  }, [cursorTimeMs, xDomainResolved, xScale]);

  const findNearest = (
    points: Array<{x: number; y: number}>,
    targetMs: number | null | undefined,
  ) => {
    if (!points.length) return null;
    if (targetMs == null) return points[points.length - 1];
    let best = points[0];
    let bestDist = Math.abs(best.x - targetMs);
    for (const p of points) {
      const d = Math.abs(p.x - targetMs);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return best;
  };

  const iobCursor = findNearest(iobPoints, cursorTimeMs);
  const cobCursor = findNearest(cobPoints, cursorTimeMs);

  // Basal cursor value
  const basalCursorRate = useMemo(() => {
    if (cursorTimeMs == null) return null;
    for (let i = basalSegments.length - 1; i >= 0; i--) {
      const seg = basalSegments[i];
      if (cursorTimeMs >= seg.startMs && cursorTimeMs <= seg.endMs) return seg.rate;
    }
    return null;
  }, [basalSegments, cursorTimeMs]);

  // ── Color constants ─────────────────────────────────────────────────

  const basalColor = theme.colors.insulin;
  const iobColor = '#9C27B0'; // purple
  const cobColor = theme.colors.carbs;

  // ── Readout text ────────────────────────────────────────────────────

  const formatVal = (v: number) =>
    v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '');

  const readoutParts = useMemo(() => {
    const parts: string[] = [];
    if (basalCursorRate != null) parts.push(`Basal ${formatVal(basalCursorRate)} U/hr`);
    if (iobCursor) parts.push(`IOB ${formatVal(iobCursor.y)}U`);
    if (cobCursor && cobCursor.y > 0) parts.push(`COB ${formatVal(cobCursor.y)}g`);
    return parts.join('  ·  ');
  }, [basalCursorRate, iobCursor, cobCursor]);

  // ── Check if there's anything to draw ───────────────────────────────

  const hasData = basalSegments.length > 0 || iobPoints.length > 0 || cobPoints.length > 0;

  if (!hasData) {
    return <View style={{width, height}} testID={testID} />;
  }

  return (
    <View style={{width, height}} testID={testID}>
      <StyledSvg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <G x={margin.left} y={margin.top}>
          {/* Title */}
          <Text
            x={0}
            y={0}
            fontSize={theme.typography.size.xs}
            fill={theme.textColor}
            opacity={0.6}
            textAnchor="start"
          >
            Basal · IOB · COB
          </Text>

          {/* Readout */}
          <Text
            x={graphWidth}
            y={0}
            fontSize={theme.typography.size.xs - 1}
            fill={theme.textColor}
            opacity={0.7}
            textAnchor="end"
          >
            {readoutParts || '—'}
          </Text>

          {/* Base line */}
          <Line
            x1={0}
            y1={graphHeight}
            x2={graphWidth}
            y2={graphHeight}
            stroke={theme.borderColor}
            strokeWidth={1}
            opacity={0.2}
          />

          {/* Basal segments (translucent bars) */}
          {basalSegments.map((seg, idx) => {
            const x1 = xScale(new Date(seg.startMs));
            const x2 = xScale(new Date(seg.endMs));
            const barHeight = graphHeight - yScaleBasal(seg.rate);
            if (barHeight <= 0) return null;
            return (
              <Rect
                key={`basal-${idx}`}
                x={x1}
                y={graphHeight - barHeight}
                width={Math.max(1, x2 - x1)}
                height={barHeight}
                fill={addOpacity(basalColor, 0.2)}
              />
            );
          })}

          {/* IOB area fill */}
          {iobAreaPath ? (
            <Path
              d={iobAreaPath}
              fill={addOpacity(iobColor, 0.15)}
            />
          ) : null}

          {/* IOB line */}
          {iobLinePath ? (
            <Path
              d={iobLinePath}
              fill="none"
              stroke={iobColor}
              strokeWidth={1.5}
              opacity={0.8}
            />
          ) : null}

          {/* COB area fill */}
          {cobAreaPath ? (
            <Path
              d={cobAreaPath}
              fill={addOpacity(cobColor, 0.15)}
            />
          ) : null}

          {/* COB line */}
          {cobLinePath ? (
            <Path
              d={cobLinePath}
              fill="none"
              stroke={cobColor}
              strokeWidth={1.5}
              opacity={0.8}
            />
          ) : null}

          {/* Cursor line */}
          {cursorX != null ? (
            <Line
              x1={cursorX}
              y1={0}
              x2={cursorX}
              y2={graphHeight}
              stroke={theme.textColor}
              strokeWidth={1}
              opacity={0.25}
            />
          ) : null}

          {/* IOB cursor dot */}
          {iobCursor && cursorTimeMs != null ? (
            <Circle
              cx={xScale(new Date(iobCursor.x))}
              cy={yScaleIob(iobCursor.y)}
              r={3}
              fill={iobColor}
              stroke={theme.white}
              strokeWidth={1}
            />
          ) : null}

          {/* COB cursor dot */}
          {cobCursor && cobCursor.y > 0 && cursorTimeMs != null ? (
            <Circle
              cx={xScale(new Date(cobCursor.x))}
              cy={yScaleCob(cobCursor.y)}
              r={3}
              fill={cobColor}
              stroke={theme.white}
              strokeWidth={1}
            />
          ) : null}

          {/* Legend dots */}
          <Circle cx={0} cy={graphHeight + 8} r={3} fill={addOpacity(basalColor, 0.5)} />
          <Text
            x={6}
            y={graphHeight + 11}
            fontSize={theme.typography.size.xs - 2}
            fill={theme.textColor}
            opacity={0.45}
          >
            Basal
          </Text>

          <Circle cx={40} cy={graphHeight + 8} r={3} fill={iobColor} opacity={0.7} />
          <Text
            x={46}
            y={graphHeight + 11}
            fontSize={theme.typography.size.xs - 2}
            fill={theme.textColor}
            opacity={0.45}
          >
            IOB
          </Text>

          <Circle cx={72} cy={graphHeight + 8} r={3} fill={cobColor} opacity={0.7} />
          <Text
            x={78}
            y={graphHeight + 11}
            fontSize={theme.typography.size.xs - 2}
            fill={theme.textColor}
            opacity={0.45}
          >
            COB
          </Text>
        </G>
      </StyledSvg>
    </View>
  );
};

export default React.memo(MixedMiniChart);
