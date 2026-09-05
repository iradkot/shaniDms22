import React from 'react';
import LoadMiniGraph from '../ActiveInsulinMiniGraph/LoadMiniGraph';
import type {MiniChartProps} from '../miniChartData';

const CobMiniGraph: React.FC<MiniChartProps> = props => (
  <LoadMiniGraph {...props} kind="cob" />
);
export default React.memo(CobMiniGraph);
