import React from 'react';

import TimeInRangeRow from 'app/containers/MainTabsNavigator/Containers/Home/components/TimeInRangeRow';
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
  headerLatestBgSample,
  headerLatestPrevBgSample,
  maxIobReference,
  maxCobReference,
}) => {
  return (
    <>
      <TimeInRangeRow bgData={bgData} />

      {/* Always show the live/current header, even when browsing past dates. */}
      <SmartExpandableHeader
        fallbackLatestBgSample={headerLatestBgSample ?? undefined}
        latestPrevBgSample={headerLatestPrevBgSample ?? undefined}
        maxIobReference={maxIobReference}
        maxCobReference={maxCobReference}
      />
    </>
  );
};

export default HomeHeaderSection;
