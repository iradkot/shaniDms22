import React, {useContext} from 'react';
import XTick from 'app/components/charts/CgmGraph/components/XTick';
import {GraphStyleContext} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';

const XGridAndAxis = (props: {
  xTickLabelFormatter?: ((d: Date) => string) | null | undefined;
}) => {
  const [{xScale, graphWidth}] = useContext(GraphStyleContext);
  const naturalTicks = xScale.ticks(
    Math.max(2, Math.min(6, Math.floor(graphWidth / 80))),
  );
  const domain = xScale.domain();
  const start = domain[0];
  const end = domain[domain.length - 1];
  if (!start || !end || end.getTime() <= start.getTime()) {
    return null;
  }
  // Always identify the visible time window, and leave enough room for a
  // complete time label between its edges and the intermediate hour ticks.
  const minimumLabelSpacing = 54;
  const ticks = [start];
  for (const tick of naturalTicks) {
    const last = ticks[ticks.length - 1]!;
    if (
      xScale(tick) - xScale(last) >= minimumLabelSpacing &&
      xScale(end) - xScale(tick) >= minimumLabelSpacing
    ) {
      ticks.push(tick);
    }
  }
  ticks.push(end);

  return (
    <>
      {ticks.map(tick => {
        return (
          <XTick
            key={tick.getTime()}
            x={xScale(tick)}
            withDate
            {...(props.xTickLabelFormatter
              ? {labelFormatter: props.xTickLabelFormatter}
              : {})}
          />
        );
      })}
    </>
  );
};

export default XGridAndAxis;
