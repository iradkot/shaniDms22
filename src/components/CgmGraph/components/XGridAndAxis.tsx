import React, {useContext} from 'react';
import { G, Line, Text as SvgText } from 'react-native-svg';
import {GraphStyleContext} from 'app/components/CgmGraph/contextStores/GraphStyleContext';
import { CHART_COLORS, CHART_OPACITY } from 'app/components/shared/GlucoseChart';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import subMinutes from "date-fns/subMinutes";

const XGridAndAxis = () => {
  const [{xScale, graphHeight, graphWidth}] = useContext(GraphStyleContext);
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
  
  // Create more grid lines for consistent coverage
  const gridLineCount = Math.max(ticksAmount * 2, 8); // At least 8 vertical lines
  const gridLines = Array.from({length: gridLineCount}, (_, i) => i);
  
  // Create time points for labels (fewer than grid lines)
  const ticks = Array.from({length: ticksAmount}, (_, i) => i);  return (
    <>
      {/* Render consistent vertical grid lines across entire chart */}
      {gridLines.map((_, index) => {
        const x = xScale.range()[0] + 
          ((xScale.range()[1] - xScale.range()[0]) / (gridLineCount - 1)) * index;
        
        return (
          <G key={`grid-line-${index}`}>
            <Line
              x1={x}
              y1={0}
              x2={x}
              y2={graphHeight}
              stroke={CHART_COLORS.gridMinor}
              strokeWidth={1}
              opacity={CHART_OPACITY.medium}
            />
          </G>
        );
      })}
        {/* Render time axis labels at major tick positions */}
      {ticks.map((_, index) => {
        const tickX =
          xScale.range()[0] +
          ((xScale.range()[1] - xScale.range()[0]) / (ticksAmount - 1)) * index;
        
        // Calculate the time for this tick
        const domain = xScale.domain();
        const timeRatio = tickX / (xScale.range()[1] - xScale.range()[0]);
        const timeDiff = Date.parse(domain[1].toString()) - Date.parse(domain[0].toString());
        const tickTime = new Date(Date.parse(domain[0].toString()) + (timeRatio * timeDiff));
        
        // Round to nearest hour for cleaner display
        const roundHourOffset = tickTime.getMinutes() % 60;
        const roundHourDate = subMinutes(tickTime, roundHourOffset);

        return (
          <G key={`tick-${index}`}>
            {/* Time Label */}
            <SvgText
              x={tickX}
              y={graphHeight + 15}
              fontSize={11}
              fill={CHART_COLORS.textSecondary}
              textAnchor="middle"
              opacity={CHART_OPACITY.strong}
            >
              {formatDateToLocaleTimeString(roundHourDate)}
            </SvgText>
          </G>
        );
      })}
    </>
  );
};

export default XGridAndAxis;
