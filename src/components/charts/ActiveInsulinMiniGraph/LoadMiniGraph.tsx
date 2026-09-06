import React, {useMemo} from 'react';
import {Circle, Path} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import MiniChartLane from '../MiniChartLane';
import {getChartPalette} from '../chartPalette';
import {
  buildMiniLoadSegments,
  findMiniLoadSample,
  formatMiniTime,
  formatMiniValue,
  resolveMiniDomain,
  resolveMiniLoadSamples,
  type MiniChartProps,
} from '../miniChartData';

export default function LoadMiniGraph({
  kind,
  ...props
}: MiniChartProps & {kind: 'iob' | 'cob'}) {
  const {bgSamples, loadSamples, cursorTimeMs, locale = 'en', xDomain} = props;
  const palette = getChartPalette(useTheme());
  const samples = useMemo(
    () => resolveMiniLoadSamples(bgSamples, loadSamples),
    [bgSamples, loadSamples],
  );
  const domain = useMemo(
    () => resolveMiniDomain(samples, xDomain),
    [samples, xDomain],
  );
  const segments = useMemo(
    () => buildMiniLoadSegments(samples, domain, kind),
    [samples, domain, kind],
  );
  const points = useMemo(() => segments.flat(), [segments]);
  const point = useMemo(() => {
    if (
      cursorTimeMs != null &&
      (!Number.isFinite(cursorTimeMs) ||
        cursorTimeMs < +domain[0] ||
        cursorTimeMs > +domain[1])
    ) {
      return null;
    }
    const timeMs =
      cursorTimeMs ??
      samples.reduce(
        (latest, sample) =>
          sample.date >= +domain[0] && sample.date <= +domain[1]
            ? Math.max(latest, sample.date)
            : latest,
        Number.NEGATIVE_INFINITY,
      );
    if (!Number.isFinite(timeMs)) {
      return null;
    }
    const sample = findMiniLoadSample(samples, timeMs, domain);
    return sample
      ? points.find(candidate => candidate.x === sample.date) ?? null
      : null;
  }, [samples, cursorTimeMs, domain, points]);
  const yDomain = useMemo<[number, number]>(() => {
    let min = 0;
    let max = 0;
    for (const value of points) {
      min = Math.min(min, value.y);
      max = Math.max(max, value.y);
    }
    return [min, max || (min < 0 ? 0 : kind === 'iob' ? 0.5 : 1)];
  }, [kind, points]);
  const isIob = kind === 'iob';
  const color = isIob ? palette.iob : palette.cob;
  const unit = isIob ? 'U' : 'g';
  const title = isIob
    ? locale === 'he'
      ? 'אינסולין פעיל · U'
      : 'Active insulin · U'
    : locale === 'he'
    ? 'פחמימות פעילות · g'
    : 'Active carbs · g';
  const emptyText = isIob
    ? locale === 'he'
      ? 'אין נתוני אינסולין פעיל'
      : 'No active insulin data'
    : locale === 'he'
    ? 'אין נתוני פחמימות פעילות'
    : 'No active carbs data';
  const detailText = point
    ? `${
        cursorTimeMs == null ? (locale === 'he' ? 'אחרון ' : 'Latest ') : ''
      }${formatMiniTime(point.x)}`
    : locale === 'he'
    ? 'אין נתון בזמן שנבחר'
    : 'No reading at this time';
  return (
    <MiniChartLane
      {...props}
      title={title}
      color={color}
      emptyText={emptyText}
      hasData={points.length > 0}
      domain={domain}
      yDomain={yDomain}
      valueText={point ? `${formatMiniValue(point.y)} ${unit}` : '—'}
      detailText={detailText}>
      {plot => (
        <>
          {segments.map((segment, index) =>
            segment.length > 1 ? (
              <Path
                key={index}
                testID={`${kind}-line-segment`}
                d={segment
                  .map(
                    (p, i) => `${i ? 'L' : 'M'}${plot.x(p.x)} ${plot.y(p.y)}`,
                  )
                  .join(' ')}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : segment[0] ? (
              <Circle
                key={index}
                cx={plot.x(segment[0].x)}
                cy={plot.y(segment[0].y)}
                r={2.5}
                fill={color}
              />
            ) : null,
          )}
          {point ? (
            <Circle
              cx={plot.x(point.x)}
              cy={plot.y(point.y)}
              r={4}
              fill={color}
              stroke={palette.surface}
              strokeWidth={1.5}
            />
          ) : null}
        </>
      )}
    </MiniChartLane>
  );
}
