import Svg, {G, Path} from 'react-native-svg';

import React, {useEffect, useRef, useState} from 'react';
import {View} from 'react-native';
import * as d3 from 'd3';
import styled from 'styled-components';
import {BgSample} from 'app/types/day_bgs';

interface Props {
  data: BgSample[];
  width: number;
  height: number;
}

const StyledSvg = styled(Svg)`
  height: 100%;
  width: 100%;
  viewbox: '0 0 100 100';
`;

const CGMGraph: React.FC<Props> = ({data, width, height}) => {
  const containerRef = useRef<View>(null);
  const xAccessor = (d: BgSample) => new Date(d.date);
  const yAccessor = (d: BgSample) => d.sgv;
  const [path, setPath] = useState<string>('');

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(data, xAccessor))
      .range([0, width]);

    const yScale = d3.scaleLinear().domain([0, 300]).range([height, 0]);

    const line = d3
      .line<BgSample>()
      .x(d => xScale(xAccessor(d)))
      .y(d => yScale(yAccessor(d)));

    const pathData = line(data);
    pathData && setPath(pathData);
    return () => {
      // cleanup
    };
  }, [containerRef, data, width, height]);

  return (
    <View ref={containerRef}>
      <StyledSvg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}>
        <G>
          <Path d={path} stroke="black" strokeWidth={1} fill="none" />
        </G>
      </StyledSvg>
    </View>
  );
};

export default CGMGraph;
