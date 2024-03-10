import React, {useContext} from 'react';
import {Circle, G} from 'react-native-svg';
import {xAccessor, yAccessor} from 'app/components/CgmGraph/utils';
import {cgmRange} from 'app/constants/PLAN_CONFIG';
import {theme} from 'app/style/theme';
import {GraphStyleContext} from 'app/components/CgmGraph/contextStores/GraphStyleContext';
const CGMSamplesRenderer = () => {
  const [{xScale, yScale, bgSamples: data}] = useContext(GraphStyleContext);
  return data?.length ? (
    <>
      {data.map(d => {
        /**
         * I encountered some data I got with mbg(with source of iPhone instead of loop), instead of sgv - which we don't need to handle + it had the same dateString as an svg event which causes warning of same key twice etc.
         */
        if (!d?.sgv) return null;
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
