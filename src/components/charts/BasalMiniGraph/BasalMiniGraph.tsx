import React, {useCallback, useMemo} from 'react';
import {G, Line, Rect} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import type {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import MiniChartLane, {type MiniChartPlot} from '../MiniChartLane';
import {getChartPalette} from '../chartPalette';
import {
  buildMiniBasalSegments,
  formatMiniTime,
  formatMiniValue,
  resolveMiniDomain,
  type MiniChartProps,
} from '../miniChartData';

type Props = MiniChartProps & {
  insulinData?: InsulinDataEntry[] | undefined;
  basalProfileData?: BasalProfile | undefined;
};

const BasalMiniGraph: React.FC<Props> = props => {
  const {
    bgSamples,
    insulinData,
    basalProfileData,
    xDomain,
    cursorTimeMs,
    locale = 'en',
  } = props;
  const palette = getChartPalette(useTheme());
  const domain = useMemo(
    () => resolveMiniDomain(bgSamples, xDomain),
    [bgSamples, xDomain],
  );
  const segments = useMemo(
    () => buildMiniBasalSegments(basalProfileData, insulinData, domain),
    [basalProfileData, insulinData, domain],
  );
  const yMax = useMemo(
    () => Math.max(0.5, ...segments.map(segment => segment.rate)),
    [segments],
  );
  // The profile may extend beyond the latest glucose sample. Do not call its future end a latest delivered rate.
  const latestMs = Math.min(
    +domain[1],
    Math.max(
      +domain[0],
      ...bgSamples.map(sample => sample.date).filter(Number.isFinite),
    ),
  );
  const readoutMs = cursorTimeMs ?? latestMs;
  const current = segments.find(
    segment =>
      readoutMs >= segment.startMs &&
      (readoutMs < segment.endMs ||
        (readoutMs === +domain[1] && readoutMs === segment.endMs)),
  );
  const source =
    current?.source === 'scheduled'
      ? locale === 'he'
        ? 'פרופיל'
        : 'Profile'
      : current?.source === 'suspendPump'
      ? locale === 'he'
        ? 'השהיה'
        : 'Suspended'
      : locale === 'he'
      ? 'זמני'
      : 'Temporary';
  const renderMarks = useCallback(
    (plot: MiniChartPlot) => (
      <>
        {segments.map((segment, index) => {
          const previous = segments[index - 1];
          const scheduled = segment.source === 'scheduled';
          const x1 = plot.x(segment.startMs);
          const x2 = plot.x(segment.endMs);
          const y = plot.y(segment.rate);
          return (
            <G key={`${segment.startMs}-${segment.source}`}>
              <Rect
                x={x1}
                y={y}
                width={Math.max(0, x2 - x1)}
                height={Math.max(0, plot.height - y)}
                fill={palette.basal}
                opacity={scheduled ? 0.06 : 0.18}
              />
              <Line
                testID={`basal-${segment.source}-segment`}
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke={palette.basal}
                strokeWidth={scheduled ? 2 : 2.8}
                {...(scheduled ? {strokeDasharray: '5 4'} : {})}
              />
              {previous &&
              previous.endMs === segment.startMs &&
              previous.rate !== segment.rate ? (
                <Line
                  x1={x1}
                  y1={plot.y(previous.rate)}
                  x2={x1}
                  y2={y}
                  stroke={palette.basal}
                  strokeWidth={2}
                  {...(scheduled ? {strokeDasharray: '5 4'} : {})}
                />
              ) : null}
            </G>
          );
        })}
      </>
    ),
    [segments, palette.basal],
  );
  return (
    <MiniChartLane
      {...props}
      title={locale === 'he' ? 'בזאל · U/hr' : 'Basal · U/hr'}
      color={palette.basal}
      emptyText={locale === 'he' ? 'אין נתוני בזאל' : 'No basal data'}
      hasData={segments.length > 0}
      domain={domain}
      yDomain={[0, yMax]}
      valueText={current ? `${formatMiniValue(current.rate)} U/hr` : '—'}
      detailText={
        current
          ? `${source} · ${formatMiniTime(readoutMs)}`
          : locale === 'he'
          ? 'אין נתון בזמן שנבחר'
          : 'No reading at this time'
      }
      hint={
        locale === 'he'
          ? '━━ זמני / השהיה     ┄┄ פרופיל מתוכנן'
          : '━━ Temporary / suspended     ┄┄ Scheduled profile'
      }>
      {renderMarks}
    </MiniChartLane>
  );
};

export default React.memo(BasalMiniGraph);
