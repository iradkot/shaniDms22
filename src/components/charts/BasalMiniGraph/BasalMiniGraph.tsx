import React, {useMemo} from 'react';
import {View} from 'react-native';
import Svg, {G, Line, Rect, Text} from 'react-native-svg';
import styled, {useTheme} from 'styled-components/native';
import * as d3 from 'd3';

import {BgSample} from 'app/types/day_bgs.types';
import {InsulinDataEntry} from 'app/types/insulin.types';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

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

const StyledSvg = styled(Svg)`
  height: 100%;
  width: 100%;
`;

const BasalMiniGraph: React.FC<Props> = ({
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
    () =>
      marginOverride ?? {
        top: 8,
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

  const tempBasalSegments = useMemo(() => {
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
        return {
          startMs,
          endMs,
          rate: Math.max(0, rate),
        };
      })
      .filter(e => Number.isFinite(e.startMs))
      .sort((a, b) => a.startMs - b.startMs);

    if (!entries.length) return [] as Segment[];

    const [domainStart, domainEnd] = xDomainResolved;
    const domainStartMs = domainStart.getTime();
    const domainEndMs = domainEnd.getTime();

    // Fill missing end times with next segment start, or chart end.
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

  const maxRate = useMemo(() => {
    let max = 0;
    for (const seg of tempBasalSegments) {
      if (seg.rate > max) max = seg.rate;
    }
    return Math.max(0.5, max * 1.1);
  }, [tempBasalSegments]);

  const yScaleBasal = useMemo(
    () => d3.scaleLinear().domain([0, maxRate]).range([graphHeight, 0]),
    [graphHeight, maxRate],
  );

  const gridTicks = useMemo(() => {
    const ticks = 3;
    return Array.from({length: ticks + 1}, (_, i) => i / ticks);
  }, []);

  const axisTextStyle = useMemo(
    () => ({
      fontSize: theme.typography.size.xs,
      fill: theme.textColor,
      opacity: 0.55,
    }),
    [theme.textColor, theme.typography.size.xs],
  );

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
          {/* Title */}
          <Text
            x={0}
            y={-2}
            fontSize={theme.typography.size.xs}
            fill={theme.textColor}
            opacity={0.6}
            textAnchor="start"
          >
            Basal (U/hr)
          </Text>

          {/* Horizontal grid lines */}
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

          {/* Left y-axis (Basal U/hr) */}
          {gridTicks.map((t, idx) => {
            const y = graphHeight * t;
            const v = maxRate * (1 - t);
            return (
              <Text
                key={`yL-${idx}`}
                x={-6}
                y={y + 4}
                fontSize={axisTextStyle.fontSize}
                fill={axisTextStyle.fill}
                opacity={axisTextStyle.opacity}
                textAnchor="end"
              >
                {formatTick(v)}
              </Text>
            );
          })}

          {/* Temp basal segments */}
          {tempBasalSegments.map(seg => {
            const x1 = xScale(new Date(seg.startMs));
            const x2 = xScale(new Date(seg.endMs));
            const w = Math.max(1, x2 - x1);
            const yTop = yScaleBasal(seg.rate);
            return (
              <Rect
                key={`${seg.startMs}-${seg.endMs}-${seg.rate}`}
                x={x1}
                y={yTop}
                width={w}
                height={Math.max(1, graphHeight - yTop)}
                rx={2}
                fill={theme.colors.insulinSecondary}
                opacity={0.3}
              />
            );
          })}

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

          {/* Axis spines */}
          <Line x1={0} y1={0} x2={0} y2={graphHeight} stroke={theme.borderColor} opacity={0.25} />
        </G>
      </StyledSvg>
    </View>
  );
};

export default BasalMiniGraph;
