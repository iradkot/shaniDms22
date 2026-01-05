import React, {useMemo} from 'react';
import {View} from 'react-native';
import Svg, {Circle, G, Line, Path, Text as SvgText} from 'react-native-svg';
import {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {OracleMatchTrace, OracleSeriesPoint} from 'app/services/oracle/oracleTypes';

type Props = {
  width: number;
  height: number;
  currentSeries: OracleSeriesPoint[];
  matches: OracleMatchTrace[];
  medianSeries: OracleSeriesPoint[];
  testID?: string;
};

const X_MIN = -120;
const X_MAX = 240;

function createLinearScale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  return (v: number) => {
    const t = (v - d0) / Math.max(1e-9, d1 - d0);
    return r0 + t * (r1 - r0);
  };
}

function yDomainFromSeries(params: {
  current: OracleSeriesPoint[];
  matches: OracleMatchTrace[];
  median: OracleSeriesPoint[];
}): [number, number] {
  const values: number[] = [];
  params.current.forEach(p => values.push(p.sgv));
  params.median.forEach(p => values.push(p.sgv));
  params.matches.forEach(m => m.points.forEach(p => values.push(p.sgv)));

  if (!values.length) return [40, 250];

  const min = Math.min(...values);
  const max = Math.max(...values);

  const paddedMin = Math.floor(min / 10) * 10 - 20;
  const paddedMax = Math.ceil(max / 10) * 10 + 20;

  const baselineMin = 40;
  const baselineMax = 250;

  return [Math.min(baselineMin, paddedMin), Math.max(baselineMax, paddedMax)];
}

function linePath(points: Array<{x: number; y: number}>, breakGapPx = 8): string {
  if (!points.length) return '';

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const gap = Math.abs(cur.x - prev.x);
    if (gap > breakGapPx) {
      d += ` M ${cur.x} ${cur.y}`;
    } else {
      d += ` L ${cur.x} ${cur.y}`;
    }
  }

  return d;
}

function sgvAtMinute(points: OracleSeriesPoint[], tMin: number): number | null {
  const exact = points.find(p => p.tMin === tMin);
  if (exact) return exact.sgv;
  let best: OracleSeriesPoint | null = null;
  for (const p of points) {
    const d = Math.abs(p.tMin - tMin);
    if (d > 5) continue;
    if (!best || d < Math.abs(best.tMin - tMin)) best = p;
  }
  return best ? best.sgv : null;
}

const OracleGhostGraph: React.FC<Props> = ({
  width,
  height,
  currentSeries,
  matches,
  medianSeries,
  testID,
}) => {
  const theme = useTheme() as ThemeType;

  const margin = useMemo(
    () => ({top: 12, right: 12, bottom: 22, left: 40}),
    [],
  );

  const innerWidth = Math.max(1, width - margin.left - margin.right);
  const innerHeight = Math.max(1, height - margin.top - margin.bottom);

  const [yMin, yMax] = useMemo(
    () => yDomainFromSeries({current: currentSeries, matches, median: medianSeries}),
    [currentSeries, matches, medianSeries],
  );

  const xScale = useMemo(() => createLinearScale([X_MIN, X_MAX], [0, innerWidth]), [innerWidth]);
  const yScale = useMemo(
    () => createLinearScale([yMin, yMax], [innerHeight, 0]),
    [innerHeight, yMin, yMax],
  );

  const gridColor = addOpacity(theme.textColor, 0.12);
  const labelColor = addOpacity(theme.textColor, 0.7);
  const ghostColor = addOpacity(theme.textColor, 0.25);
  const currentColor = theme.accentColor;
  const medianColor = addOpacity(theme.white, 0.9);

  const xTicks = [-120, -60, 0, 60, 120, 180, 240];
  const yTicks = useMemo(() => {
    const step = 50;
    const start = Math.ceil(yMin / step) * step;
    const ticks: number[] = [];
    for (let v = start; v <= yMax; v += step) ticks.push(v);
    return ticks;
  }, [yMin, yMax]);

  const ghostPaths = useMemo(() => {
    return matches.map(m => {
      const pts = m.points
        .filter(p => p.tMin >= X_MIN && p.tMin <= X_MAX)
        .map(p => ({x: xScale(p.tMin), y: yScale(p.sgv)}));
      return linePath(pts);
    });
  }, [matches, xScale, yScale]);

  const currentPath = useMemo(() => {
    const pts = currentSeries
      .filter(p => p.tMin >= X_MIN && p.tMin <= 0)
      .map(p => ({x: xScale(p.tMin), y: yScale(p.sgv)}));
    return linePath(pts);
  }, [currentSeries, xScale, yScale]);

  const medianPath = useMemo(() => {
    const pts = medianSeries
      .filter(p => p.tMin >= 0 && p.tMin <= X_MAX)
      .map(p => ({x: xScale(p.tMin), y: yScale(p.sgv)}));
    return linePath(pts);
  }, [medianSeries, xScale, yScale]);

  const markerNodes = useMemo(() => {
    const nodes: React.ReactNode[] = [];
    for (let mIdx = 0; mIdx < matches.length; mIdx++) {
      const m = matches[mIdx];
      const markers = m.actionMarkers ?? [];
      if (!markers.length) continue;

      for (let i = 0; i < markers.length; i++) {
        const mk = markers[i];
        if (mk.tMin < X_MIN || mk.tMin > X_MAX) continue;
        const sgv = sgvAtMinute(m.points, mk.tMin);
        if (sgv == null) continue;
        const x = xScale(mk.tMin);
        const y = yScale(sgv);
        const fill = mk.kind === 'insulin' ? theme.colors.insulin : theme.colors.carbs;
        nodes.push(
          <Circle
            key={`mk-${mIdx}-${i}-${mk.kind}-${mk.tMin}`}
            cx={x}
            cy={y}
            r={3}
            fill={fill}
            opacity={0.85}
          />,
        );
      }
    }
    return nodes;
  }, [matches, theme.colors.carbs, theme.colors.insulin, xScale, yScale]);

  return (
    <View testID={testID} style={{width, height}}>
      <Svg width={width} height={height}>
        <G x={margin.left} y={margin.top}>
          {/* Grid: Y */}
          {yTicks.map(v => (
            <G key={`y-${v}`}>
              <Line x1={0} y1={yScale(v)} x2={innerWidth} y2={yScale(v)} stroke={gridColor} strokeWidth={1} />
              <SvgText
                x={-6}
                y={yScale(v) + 4}
                fontSize={String(theme.typography.size.xs)}
                fontFamily={theme.typography.fontFamily}
                fill={labelColor}
                textAnchor="end"
              >
                {v}
              </SvgText>
            </G>
          ))}

          {/* Grid: X */}
          {xTicks.map(v => (
            <G key={`x-${v}`}>
              <Line x1={xScale(v)} y1={0} x2={xScale(v)} y2={innerHeight} stroke={gridColor} strokeWidth={1} />
              <SvgText
                x={xScale(v)}
                y={innerHeight + theme.spacing.lg}
                fontSize={String(theme.typography.size.xs)}
                fontFamily={theme.typography.fontFamily}
                fill={labelColor}
                textAnchor="middle"
              >
                {v === 0 ? 'Now' : v < 0 ? `${Math.abs(v) / 60}h` : `+${v / 60}h`}
              </SvgText>
            </G>
          ))}

          {/* Ghost lines */}
          {ghostPaths.map((d, idx) => (
            <Path
              key={`g-${idx}`}
              d={d}
              fill="none"
              stroke={ghostColor}
              strokeWidth={1}
              opacity={0.4}
            />
          ))}

          {/* Treatment markers */}
          {markerNodes}

          {/* Median dashed */}
          <Path
            d={medianPath}
            fill="none"
            stroke={medianColor}
            strokeWidth={2}
            strokeDasharray="6 4"
          />

          {/* Current line */}
          <Path d={currentPath} fill="none" stroke={currentColor} strokeWidth={3} />
        </G>
      </Svg>
    </View>
  );
};

export default OracleGhostGraph;
