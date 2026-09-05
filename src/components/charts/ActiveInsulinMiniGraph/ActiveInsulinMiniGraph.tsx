import React from 'react';
import LoadMiniGraph from './LoadMiniGraph';
import type {MiniChartProps} from '../miniChartData';

const ActiveInsulinMiniGraph: React.FC<MiniChartProps> = props => (
  <LoadMiniGraph {...props} kind="iob" />
);
export default React.memo(ActiveInsulinMiniGraph);
