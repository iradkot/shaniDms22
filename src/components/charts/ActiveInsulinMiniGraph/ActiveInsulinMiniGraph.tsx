import React, {useMemo} from 'react';
import {View} from 'react-native';
import Svg, {Circle, G, Line, Path, Text} from 'react-native-svg';
import styled, {useTheme} from 'styled-components/native';
import * as d3 from 'd3';

import {BgSample} from 'app/types/day_bgs.types';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

type Props = {
  width: number;
  height: number;
  bgSamples: BgSample[];
  xDomain?: [Date, Date] | null;
  cursorTimeMs?: number | null;
  margin?: {top: number; right: number; bottom: number; left: number};
  testID?: string;
};

const StyledSvg = styled(Svg)`
  height: 100%;
  width: 100%;
`;

const ActiveInsulinMiniGraph: React.FC<Props> = ({
  width,
  height,
  bgSamples,
  xDomain,
  cursorTimeMs,
  margin: marginOverride,
  testID,
}) => {
  const theme = useTheme() as ThemeType;

  const margin = useMemo(
    () =>
      marginOverride ?? {
        top: 18,
        right: 15,
        bottom: 12,
        left: 50,
      },
    [marginOverride],
  );
  const graphWidth = Math.max(1, width - margin.left - margin.right);
  const graphHeight = Math.max(1, height - margin.top - margin.bottom);

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

  const iobPoints = useMemo(() => {
    const out: Array<{x: number; y: number}> = [];
    for (const s of bgSamples ?? []) {
      // "Active insulin" should represent total IOB in the body.
      // Prefer total IOB; fall back to split sum when available.
      let raw: number | null = null;
      if (typeof s.iob === 'number') {
        raw = s.iob;
      } else if (typeof s.iobBolus === 'number' || typeof s.iobBasal === 'number') {
        raw = (typeof s.iobBolus === 'number' ? s.iobBolus : 0) +
          (typeof s.iobBasal === 'number' ? s.iobBasal : 0);
      }
      if (raw == null || !Number.isFinite(raw)) continue;

      const ts = typeof s.date === 'number' ? s.date : Date.parse(String(s.date));
      if (!Number.isFinite(ts)) continue;

      out.push({x: ts, y: Math.max(0, raw)});
    }
    // Ensure time order for d3 line.
    out.sort((a, b) => a.x - b.x);

    const [domainStart, domainEnd] = xDomainResolved;
    const startMs = domainStart.getTime();
    const endMs = domainEnd.getTime();
    return out.filter(p => p.x >= startMs && p.x <= endMs);
  }, [bgSamples, xDomainResolved]);

  const latestPoint = useMemo(() => {
    if (!iobPoints.length) return null;
    return iobPoints[iobPoints.length - 1];
  }, [iobPoints]);

  const yMax = useMemo(() => {
    let max = 0;
    for (const p of iobPoints) {
      if (p.y > max) max = p.y;
    }
    return Math.max(1, max * 1.1);
  }, [iobPoints]);

  const yScale = useMemo(
    () => d3.scaleLinear().domain([0, yMax]).range([graphHeight, 0]),
    [graphHeight, yMax],
  );

  const iobPath = useMemo(() => {
    if (!iobPoints.length) return null;
    const line = d3
      .line<{x: number; y: number}>()
      .x(d => xScale(new Date(d.x)))
      .y(d => yScale(d.y))
      .curve(d3.curveMonotoneX);

    return line(iobPoints) || null;
  }, [iobPoints, xScale, yScale]);

  const gridTicks = useMemo(() => {
    const ticks = 3;
    return Array.from({length: ticks + 1}, (_, i) => i / ticks);
  }, []);

  const formatTick = (value: number) => {
    if (!Number.isFinite(value)) return '';
    if (value >= 10) return String(Math.round(value));
    if (value >= 1) return value.toFixed(1).replace(/\.0$/, '');
    return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  };

  return (
    <View style={{width, height}} testID={testID}>
      <StyledSvg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <G x={margin.left} y={margin.top}>
          <Text
            x={0}
            y={0}
            fontSize={theme.typography.size.xs}
            fill={theme.textColor}
            opacity={0.6}
            textAnchor="start"
          >
            Active insulin (U)
          </Text>

          <Text
            x={graphWidth}
            y={0}
            fontSize={theme.typography.size.xs}
            fill={theme.textColor}
            opacity={0.75}
            textAnchor="end"
          >
            {latestPoint ? `${formatTick(latestPoint.y)}U` : '—'}
          </Text>

          {gridTicks.map((t, idx) => {
            const y = graphHeight * t;
            if (idx === gridTicks.length - 1) return null;
            return (
              <Line
                key={`grid-${idx}`}
                x1={0}
                y1={y}
                x2={graphWidth}
                y2={y}
                stroke={theme.borderColor}
                strokeWidth={1}
                opacity={0.12}
              />
            );
          })}

          {gridTicks.map((t, idx) => {
            const y = graphHeight * t;
            const v = yMax * (1 - t);
            return (
              <Text
                key={`yL-${idx}`}
                x={-6}
                y={y + 4}
                fontSize={theme.typography.size.xs}
                fill={theme.textColor}
                opacity={0.55}
                textAnchor="end"
              >
                {formatTick(v)}
              </Text>
            );
          })}

          {iobPath ? (
            <Path
              d={iobPath}
              fill="none"
              stroke={theme.colors.insulin}
              strokeWidth={2.5}
              opacity={0.9}
            />
          ) : null}

          {cursorTimeMs != null ? (
            <Line
              x1={xScale(new Date(cursorTimeMs))}
              y1={0}
              x2={xScale(new Date(cursorTimeMs))}
              y2={graphHeight}
              stroke={addOpacity(theme.textColor, 0.45)}
              strokeWidth={2}
              opacity={1}
            />
          ) : null}

          {latestPoint ? (
            <Circle
              cx={xScale(new Date(latestPoint.x))}
              cy={yScale(latestPoint.y)}
              r={3.5}
              fill={theme.colors.insulin}
              stroke={theme.white}
              strokeWidth={1}
            />
          ) : null}

          {!iobPath ? (
            <Text
              x={graphWidth / 2}
              y={graphHeight / 2 + 4}
              fontSize={theme.typography.size.xs}
              fill={theme.textColor}
              opacity={0.5}
              textAnchor="middle"
            >
              No active insulin data
            </Text>
          ) : null}

          <Line x1={0} y1={0} x2={0} y2={graphHeight} stroke={theme.borderColor} opacity={0.25} />
        </G>
      </StyledSvg>
    </View>
  );
};

export default ActiveInsulinMiniGraph;
