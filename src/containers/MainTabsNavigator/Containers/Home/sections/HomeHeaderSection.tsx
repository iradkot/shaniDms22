import React from 'react';

import TimeInRangeRow from 'app/containers/MainTabsNavigator/Containers/Home/components/TimeInRangeRow';
import LatestCgmRow from 'app/containers/MainTabsNavigator/Containers/Home/components/LatestCgmRow';
import SmartExpandableHeader from 'app/containers/MainTabsNavigator/Containers/Home/components/SmartExpandableHeader';
import type {BgSample} from 'app/types/day_bgs.types';

type Props = {
  bgData: BgSample[];
  isShowingToday: boolean;

  headerLatestBgSample?: BgSample;
  headerLatestPrevBgSample?: BgSample;

  latestBgSample?: BgSample;
  latestPrevBgSample?: BgSample;
  listBgData: BgSample[];

  maxIobReference: number;
  maxCobReference: number;

  onRefreshBgData: () => void;
};

export const HomeHeaderSection: React.FC<Props> = ({
  bgData,
  isShowingToday,
  headerLatestBgSample,
  headerLatestPrevBgSample,
  latestBgSample,
  latestPrevBgSample,
  listBgData,
  maxIobReference,
  maxCobReference,
  onRefreshBgData,
}) => {
  return (
    <>
      <TimeInRangeRow bgData={bgData} />

      {isShowingToday ? (
        <SmartExpandableHeader
          fallbackLatestBgSample={headerLatestBgSample ?? undefined}
          latestPrevBgSample={headerLatestPrevBgSample ?? undefined}
          maxIobReference={maxIobReference}
          maxCobReference={maxCobReference}
        />
      ) : (
        <LatestCgmRow
          latestPrevBgSample={latestPrevBgSample}
          latestBgSample={latestBgSample}
          allBgData={listBgData}
          onRefresh={onRefreshBgData}
        />
      )}
    </>
  );
};

export default HomeHeaderSection;
