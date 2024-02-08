import React, {useContext} from 'react';
import * as d3 from 'd3';
import {BgSample} from 'app/types/day_bgs.types';
import {Circle, G} from 'react-native-svg';
import {xAccessor, yAccessor} from 'app/components/CgmGraph/utils';
import {cgmRange} from 'app/constants/PLAN_CONFIG';
import {theme} from 'app/style/theme';
import {GraphStyleContext} from 'app/components/CgmGraph/contextStores/GraphStyleContext';

interface CGMComponentProps {
  data: BgSample[];
}

const CGMSamplesRenderer = () => {
  const [{xScale, yScale, bgSamples: data}] = useContext(GraphStyleContext);
  return data?.length ? (
    <>
      {data.map(d => {
        const x = xScale(xAccessor(d));
        const y = yScale(yAccessor(d));
        const radius = 2;
        const color =
          yAccessor(d) < cgmRange.TARGET.min
            ? theme.belowRangeColor
            : yAccessor(d) > cgmRange.TARGET.max
              ? theme.aboveRangeColor
              : theme.inRangeColor;
        return (
          <G key={d.dateString}>
            <Circle
              cx={x}
              cy={y}
              r={radius}
              stroke={color}
              strokeWidth={1}
              fill={color}
            />
          </G>
        );
      })}
    </>
  ) : (
    <></>
  );
};

export default CGMSamplesRenderer;
