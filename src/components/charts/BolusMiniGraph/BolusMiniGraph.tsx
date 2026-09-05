import React, {useMemo} from 'react';
import {G, Line, Rect} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import type {InsulinDataEntry} from 'app/types/insulin.types';
import {BOLUS_DETECTION_WINDOW_MS} from '../CgmGraph/constants/bolusHoverConfig';
import MiniChartLane from '../MiniChartLane';
import {getChartPalette} from '../chartPalette';
import {
  buildMiniBolusPoints,
  formatMiniTime,
  formatMiniValue,
  resolveMiniDomain,
  type MiniChartProps,
} from '../miniChartData';

type Props = MiniChartProps & {insulinData?: InsulinDataEntry[] | undefined};

const BolusMiniGraph: React.FC<Props> = props => {
  const {bgSamples, insulinData, xDomain, cursorTimeMs, locale = 'en'} = props;
  const palette = getChartPalette(useTheme());
  const domain = useMemo(
    () => resolveMiniDomain(bgSamples, xDomain),
    [bgSamples, xDomain],
  );
  const points = useMemo(
    () => buildMiniBolusPoints(insulinData, domain),
    [insulinData, domain],
  );
  const bars = useMemo(() => {
    const totals = new Map<number, number>();
    return points.map(point => {
      const base = totals.get(point.x) ?? 0;
      const top = base + point.y;
      totals.set(point.x, top);
      return {point, base, top};
    });
  }, [points]);
  const maximum = useMemo(
    () => Math.max(0.5, ...bars.map(bar => bar.top)),
    [bars],
  );
  const selected = useMemo(() => {
    if (cursorTimeMs == null) {
      return [];
    }
    return points.filter(
      point => Math.abs(point.x - cursorTimeMs) <= BOLUS_DETECTION_WINDOW_MS,
    );
  }, [cursorTimeMs, points]);
  const readout = cursorTimeMs == null ? points : selected;
  const total = readout.reduce((sum, point) => sum + point.y, 0);
  const detail =
    cursorTimeMs == null
      ? locale === 'he'
        ? `${points.length} מנות בטווח`
        : `${points.length} doses in range`
      : selected.length === 1
      ? formatMiniTime(selected[0]!.x)
      : locale === 'he'
      ? `${selected.length} מנות בסמוך לבחירה`
      : `${selected.length} doses near selection`;
  return (
    <MiniChartLane
      {...props}
      title={locale === 'he' ? 'בולוס · U' : 'Bolus · U'}
      color={palette.bolus}
      emptyText={
        locale === 'he'
          ? 'אין רישומי בולוס בטווח'
          : 'No bolus records in this range'
      }
      hasData={points.length > 0}
      domain={domain}
      yDomain={[0, maximum]}
      valueText={readout.length ? `${formatMiniValue(total)} U` : '—'}
      detailText={detail}>
      {plot => (
        <>
          {bars.map(({point, base, top}, index) => {
            const center = plot.x(point.x);
            const barWidth = 5;
            const barHeight = plot.y(base) - plot.y(top);
            const highlighted = selected.includes(point);
            return (
              <G key={`${point.x}-${index}`}>
                <Rect
                  testID="bolus-dose-bar"
                  x={Math.max(
                    0,
                    Math.min(plot.width - barWidth, center - barWidth / 2),
                  )}
                  y={plot.y(top)}
                  width={barWidth}
                  height={Math.max(1, barHeight)}
                  rx={1.5}
                  fill={palette.bolus}
                  stroke={palette.surface}
                  strokeWidth={0.5}
                  opacity={highlighted ? 1 : 0.8}
                />
                {highlighted ? (
                  <Line
                    x1={center - 4}
                    y1={plot.y(top)}
                    x2={center + 4}
                    y2={plot.y(top)}
                    stroke={palette.bolus}
                    strokeWidth={2.5}
                  />
                ) : null}
              </G>
            );
          })}
        </>
      )}
    </MiniChartLane>
  );
};

export default React.memo(BolusMiniGraph);
