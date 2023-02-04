import Svg, {G} from 'react-native-svg';
import React, {useRef} from 'react';
import {View} from 'react-native';
import * as d3 from 'd3';
import styled from 'styled-components';
import {BgSample} from 'app/types/day_bgs';
import XGridAndAxis from 'app/components/CgmGraph/components/XGridAndAxis';
import YGridAndAxis from 'app/components/CgmGraph/components/YGridAndAxis';
import {xAccessor} from 'app/components/CgmGraph/utils';
import CGMSamplesRenderer from 'app/components/CgmGraph/components/CGMSamplesRenderer';

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

// This component displays a graph of continuous glucose monitor data using D3.js
const CGMGraph: React.FC<Props> = ({data, width, height}) => {
  // Graph margins
  const graphMargin = 28;
  const graphWidth = width - graphMargin * 2;
  const graphHeight = height - graphMargin * 2;

  // Reference to container view for D3 calculations
  const containerRef = useRef<View>(null);

  // Maximum value for y-axis
  const highestBgThreshold = 300;

  // Calculate x-axis scale
  // Example:
  //   domain: [0, 100]
  //   range: [0, 5]
  //   xScale(0) = 0
  //   xScale(50) = 2.5
  // Just in this case we use scaleTime instead of scaleLinear
  // because we're dealing with dates
  // Example:
  //   domain: [new Date(2020, 1, 1), new Date(2020, 1, 2)]
  //   range: [0, 5]
  //   xScale(new Date(2020, 1, 1, 12, 0, 0)) = 2.5
  //   xScale(new Date(2020, 1, 1, 18, 0, 0)) = 3.75
  const xScale = d3
    .scaleTime()
    // @ts-ignore
    .domain(d3.extent(data, xAccessor))
    .range([0, graphWidth]);

  // Calculate y-axis scale
  const yScale = d3
    .scaleLinear()
    .domain([0, highestBgThreshold])
    .range([graphHeight, 0]);

  // Start and end dates of data
  const dataStartDateTime = data[0].date;
  const dataEndDateTime = data[data.length - 1].date;

  return (
    <View ref={containerRef}>
      <StyledSvg
        width={width}
        height={height}
        x={0}
        y={0}
        viewBox={`0 0 ${width} ${height}`}>
        <G x={graphMargin} y={graphMargin}>
          <CGMSamplesRenderer
            containerRef={containerRef}
            data={data}
            graphWidth={graphWidth}
            graphHeight={graphHeight}
            xScale={xScale}
            yScale={yScale}
          />
          <XGridAndAxis
            graphWidth={graphWidth}
            graphHeight={graphHeight}
            dataEndDateTime={dataEndDateTime}
            dataStartDateTime={dataStartDateTime}
            xScale={xScale}
          />
          <YGridAndAxis
            graphWidth={graphWidth}
            graphHeight={graphHeight}
            highestBgThreshold={highestBgThreshold}
          />
        </G>
      </StyledSvg>
    </View>
  );
};

export default CGMGraph;
