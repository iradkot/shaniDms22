import React, {useMemo} from 'react';
import {G, Line, Rect} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import MiniChartLane, {type MiniChartPlot} from '../MiniChartLane';
import {getChartPalette} from '../chartPalette';
import {
  formatMiniTime,
  formatMiniValue,
  resolveMiniDomain,
  type MiniChartProps,
} from '../miniChartData';
import {
  buildCarbEvents,
  type CarbEvent,
  type ValidCarbEvent,
} from '../CgmGraph/utils/carbsUtils';
import {BOLUS_DETECTION_WINDOW_MS} from '../CgmGraph/constants/bolusHoverConfig';

type Props = MiniChartProps & {
  foodItems: readonly CarbEvent[] | null;
};
type CarbBar = {event: ValidCarbEvent; base: number; top: number};

const CarbEventBar = React.memo(function CarbEventBar({
  bar,
  plot,
  selected,
  color,
  surface,
}: {
  bar: CarbBar;
  plot: MiniChartPlot;
  selected: boolean;
  color: string;
  surface: string;
}) {
  const center = plot.x(bar.event.timestamp);
  const barWidth = 5;
  return (
    <G>
      <Rect
        testID="carb-event-bar"
        x={Math.max(0, Math.min(plot.width - barWidth, center - barWidth / 2))}
        y={plot.y(bar.top)}
        width={barWidth}
        height={Math.max(1, plot.y(bar.base) - plot.y(bar.top))}
        rx={1}
        fill={color}
        stroke={surface}
        strokeWidth={0.5}
        opacity={selected ? 1 : 0.8}
      />
      {selected ? (
        <Line
          x1={Math.max(0, center - 4)}
          x2={Math.min(plot.width, center + 4)}
          y1={plot.y(bar.top)}
          y2={plot.y(bar.top)}
          stroke={color}
          strokeWidth={2.5}
        />
      ) : null}
    </G>
  );
});

/** Recorded carbohydrate events have their own gram scale; they are not COB. */
const CarbEventsMiniGraph: React.FC<Props> = props => {
  const {foodItems, bgSamples, xDomain, cursorTimeMs, locale = 'en'} = props;
  const theme = useTheme();
  const palette = getChartPalette(theme);
  const domain = useMemo(
    () =>
      resolveMiniDomain(
        bgSamples.length
          ? bgSamples
          : (foodItems ?? []).map(event => ({date: event.timestamp})),
        xDomain,
      ),
    [bgSamples, foodItems, xDomain],
  );
  const events = useMemo(
    () => buildCarbEvents(foodItems, domain),
    [foodItems, domain],
  );
  const bars = useMemo(() => {
    const totals = new Map<number, number>();
    return events.map(event => {
      const base = totals.get(event.timestamp) ?? 0;
      const top = base + event.carbs;
      totals.set(event.timestamp, top);
      return {event, base, top};
    });
  }, [events]);
  const maximum = useMemo(
    () => Math.max(1, ...bars.map(bar => bar.top)),
    [bars],
  );
  const selected = useMemo(
    () =>
      new Set(
        cursorTimeMs == null
          ? []
          : events.filter(
              event =>
                Math.abs(event.timestamp - cursorTimeMs) <=
                BOLUS_DETECTION_WINDOW_MS,
            ),
      ),
    [events, cursorTimeMs],
  );
  const readout = cursorTimeMs == null ? events : [...selected];
  const total = readout.reduce((sum, event) => sum + event.carbs, 0);
  const he = locale === 'he';
  const title = he ? 'פחמימות שנרשמו · g' : 'Recorded carbs · g';
  const detail =
    cursorTimeMs == null
      ? he
        ? `${events.length} רישומים בטווח`
        : `${events.length} records in range`
      : readout.length === 1
      ? formatMiniTime(readout[0]!.timestamp)
      : he
      ? `${readout.length} רישומים בסמוך לבחירה`
      : `${readout.length} records near selection`;
  return (
    <MiniChartLane
      {...props}
      title={
        props.compact && cursorTimeMs == null
          ? `${title} · ${he ? 'סה״כ בטווח' : 'range total'}`
          : title
      }
      color={palette.cob}
      emptyText={
        he ? 'אין רישומי פחמימות בטווח' : 'No recorded carbs in this range'
      }
      hasData={events.length > 0}
      domain={domain}
      yDomain={[0, maximum]}
      valueText={readout.length ? `${formatMiniValue(total)} g` : '—'}
      detailText={detail}>
      {plot =>
        bars.map((bar, index) => (
          <CarbEventBar
            key={`${bar.event.id}:${index}`}
            bar={bar}
            plot={plot}
            selected={selected.has(bar.event)}
            color={palette.cob}
            surface={palette.surface}
          />
        ))
      }
    </MiniChartLane>
  );
};

export default React.memo(CarbEventsMiniGraph);
