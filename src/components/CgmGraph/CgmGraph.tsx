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
import GraphDateDisplay from './components/GraphDateDisplay';
import {formattedItemDTO} from 'app/types/food.types';
import FoodItemsRenderer from 'app/components/CgmGraph/components/FoodItemsRenderer';

interface Props {
  bgSamples: BgSample[];
  foodItems: formattedItemDTO[] | null;
  width: number;
  height: number;
}

const StyledSvg = styled(Svg)`
  height: 100%;
  width: 100%;
  viewbox: '0 0 100 100';
`;

// This component displays a graph of continuous glucose monitor data using D3.js
const CGMGraph: React.FC<Props> = ({bgSamples, width, height, foodItems}) => {
  // Graph margins
  const topMargin = 20;
  const bottomMargin = 10;
  const leftMargin = 30;
  const rightMargin = 15;
  const graphWidth = width - leftMargin - rightMargin;
  const graphHeight = height - topMargin - bottomMargin;

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
    .domain(d3.extent(bgSamples, xAccessor))
    .range([0, graphWidth]);

  // Calculate y-axis scale
  const yScale = d3
    .scaleLinear()
    .domain([0, highestBgThreshold])
    .range([graphHeight, 0]);

  if (!bgSamples?.length) {
    return null;
  }

  return (
    <View
      ref={containerRef}
      style={{
        width,
        height,
      }}>
      <StyledSvg
        width={width}
        height={height}
        x={0}
        y={0}
        viewBox={`0 0 ${width} ${height}`}>
        <G x={leftMargin} y={topMargin}>
          <GraphDateDisplay xScale={xScale} />
          <CGMSamplesRenderer
            data={bgSamples}
            xScale={xScale}
            yScale={yScale}
          />
          <XGridAndAxis graphHeight={graphHeight} xScale={xScale} />
          <YGridAndAxis
            graphWidth={graphWidth}
            graphHeight={graphHeight}
            highestBgThreshold={highestBgThreshold}
          />
          <FoodItemsRenderer
            foodItems={foodItems}
            xScale={xScale}
            yScale={yScale}
          />
        </G>
      </StyledSvg>
    </View>
  );
};

export default CGMGraph;
