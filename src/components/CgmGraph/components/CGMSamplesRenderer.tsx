import React, {useEffect, useState} from 'react';
import * as d3 from 'd3';
import {BgSample} from 'app/types/day_bgs';
import {Path} from 'react-native-svg';
import {xAccessor, yAccessor} from 'app/components/CgmGraph/utils';
import {View} from 'react-native';

interface CGMComponentProps {
  containerRef: React.RefObject<View>;
  data: BgSample[];
  graphWidth: number;
  graphHeight: number;
  xScale: d3.ScaleTime<number, number>;
  yScale: d3.ScaleLinear<number, number>;
}

const CGMSamplesRenderer = ({
  containerRef,
  data,
  graphWidth,
  graphHeight,
  xScale,
  yScale,
}: CGMComponentProps) => {
  const [path, setPath] = useState<string>('');

  useEffect(() => {
    // If the container is not available or there's no data, do nothing
    if (!containerRef.current || !data.length) {
      return;
    }

    // Calculate path for graph line
    const line = d3
      .line<BgSample>()
      .x(d => xScale(xAccessor(d)))
      .y(d => yScale(yAccessor(d)));

    const pathData = line(data);
    pathData && setPath(pathData);

    // Return cleanup function (not needed in this case)
    return () => {};
  }, [containerRef, data, graphWidth, graphHeight, xScale, yScale]);

  return <Path d={path} stroke="black" strokeWidth={1} fill="none" />;
};

export default CGMSamplesRenderer;
