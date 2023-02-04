import Svg, {G, Line, Path, Text} from 'react-native-svg';
import React, {useEffect, useRef, useState} from 'react';
import {View} from 'react-native';
import * as d3 from 'd3';
import styled from 'styled-components';
import {BgSample} from 'app/types/day_bgs';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';

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

  // Accessors for D3 calculations
  const xAccessor = (d: BgSample) => new Date(d.date);
  const yAccessor = (d: BgSample) => d.sgv;
  const [path, setPath] = useState<string>('');

  // Maximum value for y-axis
  const highestBgThreshold = 300;

  // D3 calculations for graph rendering
  useEffect(() => {
    // If the container is not available or there's no data, do nothing
    if (!containerRef.current || !data.length) {
      return;
    }

    // Calculate x-axis scale
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

    // Calculate path for graph line
    const line = d3
      .line<BgSample>()
      .x(d => xScale(xAccessor(d)))
      .y(d => yScale(yAccessor(d)));

    const pathData = line(data);
    pathData && setPath(pathData);

    // Return cleanup function (not needed in this case)
    return () => {};
  }, [containerRef, data, graphWidth, graphHeight]);

  // Start and end dates of data
  const dataStartDateTime = data[0].date;
  const dataEndDateTime = data[data.length - 1].date;

  // X-axis component
  const XAxis = () => {
    const ticksAmount = 6;
    const ticks = Array.from({length: ticksAmount}, (_, i) => i);
    return (
      <>
        {ticks.map((tick, index) => (
          <G>
            <Line
              key={index}
              x1={(graphWidth / ticksAmount) * index}
              y1={0}
              x2={(graphWidth / ticksAmount) * index}
              y2={graphHeight}
              stroke="black"
              opacity={0.2}
              strokeWidth={1}
            />
            <Text
              x={(graphWidth / ticksAmount) * index}
              y={graphHeight}
              fontSize={10}
              fill="black"
              opacity={0.5}
              textAnchor="middle">
              {formatDateToLocaleTimeString(
                dataStartDateTime +
                  (dataEndDateTime - dataStartDateTime) * (index / ticksAmount),
              )}
            </Text>
          </G>
        ))}
      </>
    );
  };
  const YAxis = () => {
    const ticksAmount = 6;
    const ticks = Array.from({length: ticksAmount}, (_, i) => i);
    return (
      <>
        {ticks.map((tick, index) => (
          <G>
            <Line
              key={index}
              x1={0}
              y1={(graphHeight / ticksAmount) * index}
              x2={graphWidth}
              y2={(graphHeight / ticksAmount) * index}
              stroke="black"
              opacity={0.2}
              strokeWidth={1}
            />
            <Text
              x={0}
              y={(graphHeight / ticksAmount) * index}
              fontSize={10}
              fill="black"
              opacity={0.5}
              textAnchor="middle">
              {Math.round(
                highestBgThreshold - (highestBgThreshold / ticksAmount) * index,
              )}
            </Text>
          </G>
        ))}
      </>
    );
  };

  return (
    <View ref={containerRef}>
      <StyledSvg
        width={width}
        height={height}
        x={0}
        y={0}
        viewBox={`0 0 ${width} ${height}`}>
        <G x={graphMargin} y={graphMargin}>
          <Path d={path} stroke="black" strokeWidth={1} fill="none" />
          <XAxis />
          <YAxis />
        </G>
      </StyledSvg>
    </View>
  );
};

export default CGMGraph;
