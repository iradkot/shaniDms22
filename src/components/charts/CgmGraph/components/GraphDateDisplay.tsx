import React, {useContext, useMemo} from 'react';
import {G, Text} from 'react-native-svg';
import {useTheme} from 'styled-components/native';

import {GraphStyleContext} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';
import type {ThemeType} from 'app/types/theme';
import {formatDateToLocaleDateString} from 'app/utils/datetime.utils';

export interface GraphDateLabel {
  readonly date: Date;
  readonly positionRatio: number;
}

/**
 * Places each calendar date at the center of the part of that date that is
 * visible. A single-day chart therefore gets one centered, unclipped label.
 */
export const buildGraphDateLabels = (
  startMs: number,
  endMs: number,
): readonly GraphDateLabel[] => {
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return [];
  }

  const labels: GraphDateLabel[] = [];
  const finalVisibleMs = endMs - 1;
  let dayStart = new Date(startMs);
  dayStart.setHours(0, 0, 0, 0);

  while (dayStart.getTime() <= finalVisibleMs) {
    const nextDayStart = new Date(dayStart);
    nextDayStart.setDate(nextDayStart.getDate() + 1);
    const visibleStartMs = Math.max(startMs, dayStart.getTime());
    const visibleEndMs = Math.min(endMs, nextDayStart.getTime());
    if (visibleEndMs > visibleStartMs) {
      const midpointMs = visibleStartMs + (visibleEndMs - visibleStartMs) / 2;
      labels.push({
        date: new Date(dayStart),
        positionRatio: (midpointMs - startMs) / (endMs - startMs),
      });
    }
    dayStart = nextDayStart;
  }

  return labels;
};

const selectEvenly = (
  values: readonly GraphDateLabel[],
  maximum: number,
): readonly GraphDateLabel[] => {
  if (values.length <= maximum) {
    return values;
  }
  return Array.from({length: maximum}, (_, index) => {
    const sourceIndex = Math.round(
      (index * (values.length - 1)) / (maximum - 1),
    );
    return values[sourceIndex]!;
  });
};

const GraphDateDisplay = () => {
  const [{xScale, graphWidth}] = useContext(GraphStyleContext);
  const theme = useTheme() as ThemeType;
  const labels = useMemo(() => {
    const domain = xScale.domain();
    const start = domain[0];
    const end = domain[domain.length - 1];
    if (!start || !end) {
      return [];
    }
    return selectEvenly(
      buildGraphDateLabels(start.getTime(), end.getTime()),
      4,
    );
  }, [xScale]);

  return (
    <>
      {labels.map(label => (
        <G key={label.date.toISOString()}>
          <Text
            x={label.positionRatio * graphWidth}
            y={0}
            fontSize={10}
            fill={theme.textColor}
            opacity={0.7}
            textAnchor="middle">
            {formatDateToLocaleDateString(label.date)}
          </Text>
        </G>
      ))}
    </>
  );
};

export default GraphDateDisplay;
