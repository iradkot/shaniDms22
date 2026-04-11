import React, {useMemo} from 'react';
import {View} from 'react-native';
import Svg, {Circle, G, Line, Path, Text} from 'react-native-svg';
import styled, {useTheme} from 'styled-components/native';
import * as d3 from 'd3';

import {BgSample} from 'app/types/day_bgs.types';
import {ThemeType} from 'app/types/theme';

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

const CobMiniGraph: React.FC<Props> = ({
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

  const cobPoints = useMemo(() => {
    const points: Array<{x: number; y: number}> = [];
    for (const s of bgSamples ?? []) {
      const ts = typeof s.date === 'number' ? s.date : Date.parse(String(s.date));
      if (!Number.isFinite(ts)) continue;
      if (typeof s.cob !== 'number' || !Number.isFinite(s.cob)) continue;
      points.push({x: ts, y: Math.max(0, s.cob)});
    }

    points.sort((a, b) => a.x - b.x);

    const [domainStart, domainEnd] = xDomainResolved;
    const startMs = domainStart.getTime();
    const endMs = domainEnd.getTime();
    return points.filter(p => p.x >= startMs && p.x <= endMs);
  }, [bgSamples, xDomainResolved]);

  const yMax = useMemo(() => {
    let max = 0;
    for (const p of cobPoints) {
      if (p.y > max) max = p.y;
    }
    return Math.max(1, max * 1.1);
  }, [cobPoints]);

  const yScale = useMemo(
    () => d3.scaleLinear().domain([0, yMax]).range([graphHeight, 0]),
    [graphHeight, yMax],
  );

  const cobPath = useMemo(() => {
    if (!cobPoints.length) return null;
    const line = d3
      .line<{x: number; y: number}>()
      .x(d => xScale(new Date(d.x)))
      .y(d => yScale(d.y))
      .curve(d3.curveMonotoneX);

    return line(cobPoints) || null;
  }, [cobPoints, xScale, yScale]);

  const cursorValue = useMemo(() => {
    if (!cobPoints.length) return null;
    if (cursorTimeMs == null) return cobPoints[cobPoints.length - 1];

    // Nearest point (fast enough for our small series).
    let best = cobPoints[0];
    let bestDist = Math.abs(best.x - cursorTimeMs);
    for (const p of cobPoints) {
      const d = Math.abs(p.x - cursorTimeMs);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return best;
  }, [cobPoints, cursorTimeMs]);

  const latestPoint = useMemo(() => {
    if (!cobPoints.length) return null;
    return cobPoints[cobPoints.length - 1];
  }, [cobPoints]);

  const gridTicks = useMemo(() => {
    const ticks = 3;
    return Array.from({length: ticks + 1}, (_, i) => i / ticks);
  }, []);

  const formatTick = (value: number) => {
    if (!Number.isFinite(value)) return '';
    if (value >= 100) return String(Math.round(value));
    if (value >= 10) return value.toFixed(0);
    if (value >= 1) return value.toFixed(1).replace(/\.0$/, '');
    return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  };

  const cursorX = useMemo(() => {
    if (cursorTimeMs == null) return null;
    const [start, end] = xDomainResolved;
    const t = cursorTimeMs;
    if (t < start.getTime() || t > end.getTime()) return null;
    return xScale(new Date(t));
  }, [cursorTimeMs, xDomainResolved, xScale]);

  if (!cobPoints.length) {
    return testID ? <View style={{width, height}} testID={testID} /> : <View style={{width, height}} />;
  }

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
            COB (g)
          </Text>

          <Text
            x={graphWidth}
            y={0}
            fontSize={theme.typography.size.xs}
            fill={theme.textColor}
            opacity={0.75}
            textAnchor="end"
          >
            {cursorValue ? `${formatTick(cursorValue.y)}g` : '—'}
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

          <Line x1={0} y1={graphHeight} x2={graphWidth} y2={graphHeight} stroke={theme.borderColor} strokeWidth={1} opacity={0.2} />

          {cobPath ? (
            <Path d={cobPath} fill="none" stroke={theme.accentColor} strokeWidth={2} />
          ) : null}

          {cursorValue && cursorTimeMs != null ? (
            <Circle
              cx={xScale(new Date(cursorValue.x))}
              cy={yScale(cursorValue.y)}
              r={3.75}
              fill={theme.accentColor}
              stroke={theme.white}
              strokeWidth={1.25}
            />
          ) : latestPoint ? (
            <Circle
              cx={xScale(new Date(latestPoint.x))}
              cy={yScale(latestPoint.y)}
              r={3}
              fill={theme.accentColor}
              opacity={0.65}
              stroke={theme.white}
              strokeWidth={1}
            />
          ) : null}

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
        </G>
      </StyledSvg>
    </View>
  );
};

export default CobMiniGraph;
