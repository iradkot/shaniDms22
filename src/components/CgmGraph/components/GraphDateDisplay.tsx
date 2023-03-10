import {formatDateToLocaleDateString} from 'app/utils/datetime.utils';
import React, {useContext} from 'react';
import {G, Text} from 'react-native-svg';
import {
  createGraphStyleContext,
  GraphStyleContext,
} from 'app/components/CgmGraph/contextStores/GraphStyleContext';

interface Props {
  xScale: any;
}

interface ShownDay {
  date: Date;
  x: number;
}

/**
 * returns the shown days in the graph with the x position of where the day starts
 * @param xScale
 * @returns {ShownDay[]}
 */
const getShownDays: (xScale: any) => ShownDay[] = xScale => {
  const startDateTime = xScale.domain()[0];
  const endDateTime = xScale.domain()[1];
  const shownDays: ShownDay[] = [];
  let currentDay = new Date(startDateTime);
  while (currentDay <= endDateTime) {
    const shownDay = new Date(currentDay);
    shownDay.setHours(0, 0, 0, 0);
    shownDays.push({
      date: shownDay,
      x: xScale(shownDay),
    });
    currentDay = new Date(shownDay);
    currentDay.setDate(currentDay.getDate() + 1);
  }
  return shownDays;
};

const GraphDateDisplay = () => {
  const [{xScale}] = useContext(GraphStyleContext);
  const shownDays = getShownDays(xScale);
  const minTicksAmount = 1;
  const maxTicksAmount = 4;
  const ticksAmount = Math.min(
    Math.max(shownDays.length, minTicksAmount),
    maxTicksAmount,
  );
  const ticks = Array.from({length: ticksAmount}, (_, i) => i);
  const GridLabel = ({x, index}: {x: number; index: number}) => (
    <Text x={x} y={0} fontSize={10} fill="black" textAnchor="middle">
      {formatDateToLocaleDateString(shownDays[index].date)}
    </Text>
  );

  return (
    <>
      {ticks.map((tick, index) => (
        <G key={index}>
          <GridLabel x={shownDays[index].x} index={index} />
        </G>
      ))}
    </>
  );
};

export default GraphDateDisplay;
