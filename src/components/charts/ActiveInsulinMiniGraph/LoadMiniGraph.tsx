import React, {useMemo} from 'react';
import {Circle, Path} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import {MAX_LOAD_CURSOR_DISTANCE_MS} from 'app/utils/chartLoadSeries.utils';
import {findClosestBgSample} from '../CgmGraph/utils';
import MiniChartLane from '../MiniChartLane';
import {getChartPalette} from '../chartPalette';
import {
  buildMiniLoadSegments,
  formatMiniTime,
  formatMiniValue,
  resolveMiniDomain,
  type MiniChartProps,
} from '../miniChartData';

export default function LoadMiniGraph({
  kind,
  ...props
}: MiniChartProps & {kind: 'iob' | 'cob'}) {
  const {bgSamples, cursorTimeMs, locale = 'en', xDomain} = props;
  const palette = getChartPalette(useTheme());
  const domain = useMemo(
    () => resolveMiniDomain(bgSamples, xDomain),
    [bgSamples, xDomain],
  );
  const segments = useMemo(
    () => buildMiniLoadSegments(bgSamples, domain, kind),
    [bgSamples, domain, kind],
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
      bgSamples.reduce(
        (latest, sample) =>
          sample.date >= +domain[0] && sample.date <= +domain[1]
            ? Math.max(latest, sample.date)
            : latest,
        Number.NEGATIVE_INFINITY,
      );
    if (!Number.isFinite(timeMs)) {
      return null;
    }
    // Select the same sample as the inspector before looking for its load.
    // A missing value must not silently fall back to a different finite sample.
    const sample = findClosestBgSample(timeMs, bgSamples);
    return sample &&
      Math.abs(sample.date - timeMs) <= MAX_LOAD_CURSOR_DISTANCE_MS
      ? points.find(candidate => candidate.x === sample.date) ?? null
      : null;
  }, [bgSamples, cursorTimeMs, domain, points]);
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
