import React, {useContext} from 'react';
import XTick from 'app/components/CgmGraph/components/XTick';
import {GraphStyleContext} from 'app/components/CgmGraph/contextStores/GraphStyleContext';
const XGridAndAxis = () => {
  const [{xScale}] = useContext(GraphStyleContext);
  const getTicksAmount = (duration: number) => {
    const durationInHours = duration / 1000 / 60 / 60;
    if (durationInHours < 1) {
      return 2;
    } else if (durationInHours < 2) {
      return 3;
    } else if (durationInHours < 3) {
      return 4;
    } else {
      return 5;
    }
  };

  const duration = xScale.domain()[1] - xScale.domain()[0];
  const ticksAmount = getTicksAmount(duration);
  const ticks = Array.from({length: ticksAmount}, (_, i) => i);

  return (
    <>
      {ticks.map((_, index) => {
        const tickX =
          xScale.range()[0] +
          ((xScale.range()[1] - xScale.range()[0]) / (ticksAmount - 1)) * index;

        return <XTick key={index} x={tickX} withDate />;
      })}
    </>
  );
};

export default XGridAndAxis;
