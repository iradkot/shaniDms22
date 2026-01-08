import * as d3 from 'd3';
import {createContext, useCallback, useMemo} from 'react';
import {BgSample} from 'app/types/day_bgs.types';
import {xAccessor} from 'app/components/charts/CgmGraph/utils';

export type ChartMargin = {top: number; right: number; bottom: number; left: number};

interface GraphStyleContextInterface {
  width: number;
  height: number;
  margin: ChartMargin;
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

const DEFAULT_MARGIN: ChartMargin = {
  top: 20,
  right: 15,
  bottom: 30,
  left: 50,
};

function computeXDomainFromSamples(bgSamples: BgSample[]): [Date, Date] {
  if (!bgSamples.length) {
    const now = new Date();
    return [now, now];
  }

  // Prefer using the numeric timestamps already present on BgSample (ms since epoch).
  // This avoids allocating `Date` objects per sample.
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const s of bgSamples) {
    const t = typeof s.date === 'number' ? s.date : new Date(xAccessor(s)).getTime();
    if (!Number.isFinite(t)) continue;
    if (t < min) min = t;
    if (t > max) max = t;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    const now = new Date();
    return [now, now];
  }

  return [new Date(min), new Date(max)];
}

export const useGraphStyleContext = (
  width: number,
  height: number,
  bgSamples: BgSample[],
  xDomainOverride?: [Date, Date] | null,
  marginOverride?: ChartMargin,
): [
  GraphStyleContextInterface,
  (values: GraphStyleContextInterface) => void,
] => {
  const highestBgThreshold = 300;
  const margin = useMemo(() => marginOverride ?? DEFAULT_MARGIN, [marginOverride]);

  const graphWidth = Math.max(0, width - margin.left - margin.right);
  const graphHeight = Math.max(0, height - margin.top - margin.bottom);

  const xDomain = useMemo(() => {
    return xDomainOverride ?? computeXDomainFromSamples(bgSamples);
  }, [bgSamples, xDomainOverride]);

  const xScale = useMemo(() => {
    return d3.scaleTime<number, number>().domain(xDomain).range([0, graphWidth]);
  }, [graphWidth, xDomain]);

  const yScale = useMemo(() => {
    return d3
      .scaleLinear<number, number>()
      .domain([0, highestBgThreshold])
      .range([graphHeight, 0]);
  }, [graphHeight]);

  const graphStyleContextValue = useMemo<GraphStyleContextInterface>(() => {
    return {
      width,
      height,
      margin,
      xScale,
      yScale,
      graphWidth,
      graphHeight,
      bgSamples,
    };
  }, [bgSamples, graphHeight, graphWidth, height, margin, width, xScale, yScale]);

  /**
   * Setter kept for API compatibility.
   *
   * The chart styles are derived from `width`, `height`, `bgSamples`, `xDomainOverride`, and `marginOverride`.
   * We intentionally avoid internal state here to keep the context referentially stable during touch-move renders.
   */
  const setGraphStyleContextValue = useCallback((_values: GraphStyleContextInterface) => {
    // no-op by design
  }, []);

  return [graphStyleContextValue, setGraphStyleContextValue];
};
