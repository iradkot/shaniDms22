import * as d3 from 'd3';
import {createContext, useState} from 'react';
import {BgSample} from 'app/types/day_bgs';
import {xAccessor} from 'app/components/CgmGraph/utils';

interface GraphStyleContextInterface {
  width: number;
  height: number;
  margin: {top: number; right: number; bottom: number; left: number};
  xScale: d3.ScaleTime<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  bgSamples: BgSample[];
  graphWidth: number;
  graphHeight: number;
}

export const GraphStyleContext = createContext<
  [GraphStyleContextInterface, (values: GraphStyleContextInterface) => void]
>([
  {
    width: 0,
    height: 0,
    margin: {top: 0, right: 0, bottom: 0, left: 0},
    xScale: d3.scaleTime(),
    yScale: d3.scaleLinear(),
    bgSamples: [],
    graphWidth: 0,
    graphHeight: 0,
  },
  () => {},
]);

export const useGraphStyleContext = (
  initialWidth: number,
  initialHeight: number,
  initialBgSamples: BgSample[],
): [
  GraphStyleContextInterface,
  (values: GraphStyleContextInterface) => void,
] => {
  const highestBgThreshold = 300;
  const [width, setWidth] = useState(initialWidth);
  const [height, setHeight] = useState(initialHeight);
  const [bgSamples, setBgSamples] = useState(initialBgSamples);
  const [margin] = useState({
    top: 20,
    right: 15,
    bottom: 30,
    left: 50,
  });

  const xExtent = d3.extent(bgSamples, xAccessor);
  const xDomain = xExtent[0] !== undefined ? xExtent : [new Date(), new Date()]; // set default domain if extent is undefined
  const xScale = d3
    .scaleTime()
    .domain(xDomain)
    .range([0, width - margin.left - margin.right]);
  const yScale = d3
    .scaleLinear()
    .domain([0, highestBgThreshold])
    .range([height - margin.top - margin.bottom, 0]);

  const graphStyleContextValue: GraphStyleContextInterface = {
    width,
    height,
    margin,
    xScale,
    yScale,
    graphWidth: width - 50 - 15,
    graphHeight: height - 20 - 30,
    bgSamples,
  };

  const setGraphStyleContextValue = (values: GraphStyleContextInterface) => {
    if (values.width) {
      setWidth(values.width);
    }
    if (values.height) {
      setHeight(values.height);
    }
    if (values.bgSamples) {
      setBgSamples(values.bgSamples);
    }
  };

  return [graphStyleContextValue, setGraphStyleContextValue];
};
