/** Compact view keeps different physical units in independently labelled lanes. */
import React from 'react';
import {View} from 'react-native';
import type {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import BasalMiniGraph from '../BasalMiniGraph/BasalMiniGraph';
import ActiveInsulinMiniGraph from '../ActiveInsulinMiniGraph/ActiveInsulinMiniGraph';
import CobMiniGraph from '../CobMiniGraph/CobMiniGraph';
import type {MiniChartProps} from '../miniChartData';

type Props = MiniChartProps & {
  insulinData?: InsulinDataEntry[] | undefined;
  basalProfileData?: BasalProfile | undefined;
};

const MixedMiniChart: React.FC<Props> = ({testID, height, ...props}) => {
  const laneHeight = Math.max(110, Math.floor(height / 3));
  return (
    <View testID={testID} style={{width: props.width}}>
      <BasalMiniGraph
        {...props}
        compact
        height={laneHeight}
        testID="mixed-basal-lane"
      />
      <ActiveInsulinMiniGraph
        {...props}
        compact
        height={laneHeight}
        testID="mixed-iob-lane"
      />
      <CobMiniGraph
        {...props}
        compact
        height={laneHeight}
        testID="mixed-cob-lane"
      />
    </View>
  );
};

export default React.memo(MixedMiniChart);
