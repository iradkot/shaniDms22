import React, {useMemo} from 'react';
import {View} from 'react-native';
import BgDataCard from 'app/components/CgmCardListDisplay/BgDataCard';
import {BgSample} from 'app/types/day_bgs.types';
import {getLoadReferences} from 'app/utils/loadBars.utils';
import {useTimer} from 'app/hooks/useTimer';

interface LatestCgmRowProps {
  latestBgSample?: BgSample;
  latestPrevBgSample?: BgSample;
  allBgData: BgSample[];
  onRefresh: () => void;
}

const LatestCgmRow: React.FC<LatestCgmRowProps> = ({
  latestBgSample,
  latestPrevBgSample,
  allBgData,
  onRefresh,
}) => {
  useTimer(latestBgSample, onRefresh);

  const {maxIobReference, maxCobReference} = useMemo(
    () => getLoadReferences(allBgData),
    [allBgData],
  );

  if (!latestBgSample) {
    return null;
  }

  return (
    <View>
      <BgDataCard
        bgData={latestBgSample}
        prevBgData={latestPrevBgSample}
        maxIobReference={maxIobReference}
        maxCobReference={maxCobReference}
        variant="featured"
      />
    </View>
  );
};

export default LatestCgmRow;
