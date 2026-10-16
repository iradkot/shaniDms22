import React, {useContext} from 'react';
import {Line, Rect} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import {GraphStyleContext} from '../contextStores/GraphStyleContext';
import {useGlucoseChartThresholds} from '../../GlucoseChartThresholdsContext';

// Cursor movement does not change range geometry. Context changes still update
// this layer when the patient's thresholds, chart dimensions or theme change.
export const GlucoseTargetRange = React.memo(() => {
  const [{graphWidth, graphHeight, yScale}] = useContext(GraphStyleContext);
  const thresholds = useGlucoseChartThresholds();
  const theme = useTheme();
  const top = Math.max(
    0,
    Math.min(graphHeight, yScale(thresholds.targetMaxMgDl)),
  );
  const bottom = Math.max(
    0,
    Math.min(graphHeight, yScale(thresholds.targetMinMgDl)),
  );
  return (
    <>
      <Rect
        x={0}
        y={top}
        width={graphWidth}
        height={Math.max(0, bottom - top)}
        fill={theme.inRangeColor}
        opacity={0.08}
        testID="cgm-target-range"
      />
      {[thresholds.targetMinMgDl, thresholds.targetMaxMgDl].map(value => (
        <Line
          key={value}
          x1={0}
          x2={graphWidth}
          y1={yScale(value)}
          y2={yScale(value)}
          stroke={theme.inRangeColor}
          opacity={0.55}
          strokeDasharray="4 4"
          strokeWidth={1}
          testID={`cgm-target-boundary-${value}`}
        />
      ))}
    </>
  );
});
