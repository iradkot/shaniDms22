import React, {useContext} from 'react';
import XTick from 'app/components/charts/CgmGraph/components/XTick';
import {GraphStyleContext} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';

const XGridAndAxis = (props: {xTickLabelFormatter?: ((d: Date) => string) | null}) => {
  const [{xScale}] = useContext(GraphStyleContext);
  const getTicksAmount = (duration: number) => {
    const durationInHours = duration / 1000 / 60 / 60;
    if (durationInHours < 1) {
      return 2;
    } else if (durationInHours < 2) {
      return 2;
    } else if (durationInHours < 3) {
      return 4;
    } else {
      return 5;
    }
  };

  const domain = xScale.domain();
  const duration =
    Date.parse(domain[1].toString()) - Date.parse(domain[0].toString());

  const ticksAmount = getTicksAmount(duration);
  const ticks = Array.from({length: ticksAmount}, (_, i) => i);

  return (
    <>
      {ticks.map((_, index) => {
        const tickX =
          xScale.range()[0] +
          ((xScale.range()[1] - xScale.range()[0]) / (ticksAmount - 1)) * index;

        return (
          <XTick
            key={index}
            x={tickX}
            withDate
            roundTicks
            labelFormatter={props.xTickLabelFormatter ?? undefined}
          />
        );
      })}
    </>
  );
};

export default XGridAndAxis;
