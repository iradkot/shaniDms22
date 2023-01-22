import React, {useRef, useEffect, useState} from 'react';
import {View, Text} from 'react-native';
import * as d3 from 'd3';
import {Line, G, Svg} from 'react-native-svg';
import {TrendDirectionString} from 'app/types/notifications';

interface BgSample {
  sgv: number;
  date: number; // timestamp in ms
  dateString: string;
  trend: number;
  direction: TrendDirectionString;
  device: string;
  type: string;
}

interface Props {
  data: BgSample[];
  width: number;
  height: number;
}

const BgGraph: React.FC<Props> = ({data, width, height}) => {
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

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(data, yAccessor)])
      .range([height, 0]);

    const line = d3
      .line<BgSample>()
      .x(d => xScale(xAccessor(d)))
      .y(d => yScale(yAccessor(d)));

    const pathData = line(data);
    setPath(pathData);
    return () => {
      // cleanup
    };
  }, [containerRef, data, width, height]);

  return (
    <View ref={containerRef}>
      <Svg width={width} height={height}>
        <G>
          <Line d={path} stroke="black" strokeWidth={1} fill="none" />
        </G>
      </Svg>
    </View>
  );
};

export default BgGraph;
