import React, {useEffect, useMemo} from 'react';
import styled from 'styled-components/native';
import CgmRows from 'app/components/CgmCardListDisplay/CgmRows';
import TimeInRangeRow from 'app/containers/MainTabsNavigator/Containers/Home/components/TimeInRangeRow';
import DateNavigatorRow from 'app/containers/MainTabsNavigator/Containers/Home/components/dateNavigatorRow/DateNavigatorRow';
import StatsRow from 'app/containers/MainTabsNavigator/Containers/Home/components/StatsRow';
import Collapsable from 'app/components/Collapsable';
import {useDebouncedState} from 'app/hooks/useDebouncedState';
import BGValueRow from 'app/containers/MainTabsNavigator/Containers/Home/components/LatestBgValueRow';
import BgGraph from 'app/components/CgmGraph/CgmGraph';
import {cloneDeep} from 'lodash';
import {Theme} from 'app/types/theme';
import {Dimensions} from 'react-native';
import {useBgData} from 'app/hooks/useBgData';
import {useFoodItems} from 'app/hooks/useFoodItems';
import {bgSortFunction} from 'app/utils/bg.utils';
import InsulinStatsRow from 'app/containers/MainTabsNavigator/Containers/Home/components/InsulinStatsRow/InsulinStatsRow';
import {useInsulinData} from 'app/hooks/useInsulinData';

const HomeContainer = styled.View<{theme: Theme}>`
  flex: 1;
  background-color: ${({theme}) => theme.backgroundColor};
`;

// create dummy home component with typescript
const Home: React.FC = () => {
  const [currentDate, setCurrentDate] = React.useState<Date>(new Date());
  const isShowingToday = useMemo(() => {
    const today = new Date();
    return (
      today.getFullYear() === currentDate.getFullYear() &&
      today.getMonth() === currentDate.getMonth() &&
      today.getDate() === currentDate.getDate()
    );
  }, [currentDate]);

  const [debouncedCurrentDate, setDebouncedCurrentDate] = useDebouncedState(
    currentDate,
    200,
  );
  const {
    bgData,
    latestBgSample,
    latestPrevBgSample,
    isLoading,
    getUpdatedBgData,
  } = useBgData(debouncedCurrentDate);

  const {
    insulinData,
    todayInsulinData,
    isLoading: insulinIsLoading,
    basalProfileData,
  } = useInsulinData(debouncedCurrentDate);

  useEffect(() => {
    setDebouncedCurrentDate(currentDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  const setCustomDate = (date: Date) => {
    setCurrentDate(date);
  };
  const getNextDate = () => {
    setCurrentDate(new Date(currentDate.setDate(currentDate.getDate() + 1)));
  };
  const getPreviousDate = () => {
    setCurrentDate(new Date(currentDate.setDate(currentDate.getDate() - 1)));
  };

  const {foodItems} = useFoodItems(currentDate);

  const memoizedBgSamples = useMemo(() => {
    return cloneDeep(bgData).sort(bgSortFunction(true));
  });

  return (
    <HomeContainer>
      <TimeInRangeRow bgData={bgData} />
      <BGValueRow
        prevBgData={latestPrevBgSample}
        bgData={latestBgSample}
        getUpdatedBgDataCallback={getUpdatedBgData}
      />
      <Collapsable title={'Stats'}>
        <StatsRow bgData={bgData} />
      </Collapsable>
      <Collapsable title={'Insulin stats'}>
        {/*<InsulinStatsRow insulinData={generateDummyInsulinData(10)} />*/}
        <InsulinStatsRow
          insulinData={insulinData}
          basalProfileData={basalProfileData}
        />
      </Collapsable>
      {/*<BgGraph*/}
      {/*  bgSamples={cloneDeep(bgData).sort(bgSortFunction(true))}*/}
      {/*  width={Dimensions.get('window').width}*/}
      {/*  height={200}*/}
      {/*  foodItems={foodItems}*/}
      {/*/>*/}
      <Collapsable title={'chart'}>
        <BgGraph
          bgSamples={memoizedBgSamples}
          width={Dimensions.get('window').width}
          height={200}
          foodItems={foodItems}
        />
      </Collapsable>
      <CgmRows
        onPullToRefreshRefresh={getUpdatedBgData}
        isLoading={isLoading}
        bgData={bgData}
        isToday={isShowingToday}
      />
      <DateNavigatorRow
        isLoading={isLoading || currentDate !== debouncedCurrentDate}
        date={currentDate}
        isToday={isShowingToday}
        setCustomDate={setCustomDate}
        onGoBack={getPreviousDate}
        onGoForward={getNextDate}
        resetToCurrentDate={() => setCurrentDate(new Date())}
      />
    </HomeContainer>
  );
};

export default Home;
