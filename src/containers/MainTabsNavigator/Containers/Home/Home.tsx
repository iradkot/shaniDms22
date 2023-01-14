import React, {useEffect, useMemo, useState} from 'react';
import styled from 'styled-components/native';
import {FirestoreManager} from 'app/services/FirestoreManager';
import {BgSample} from 'app/types/day_bgs';
import CgmCardListDisplay from 'app/components/CgmCardListDisplay/CgmCardListDisplay';
import {Timer} from './components/Timer';
import TimeInRangeRow from 'app/containers/MainTabsNavigator/Containers/Home/components/TimeInRangeRow';
import DateNavigatorRow from 'app/containers/MainTabsNavigator/Containers/Home/components/dateNavigatorRow/DateNavigatorRow';
import StatsRow from 'app/containers/MainTabsNavigator/Containers/Home/components/StatsRow';
import Collapsable from 'app/containers/MainTabsNavigator/Containers/Home/components/Collapsable';
import {useDebouncedState} from 'app/hooks/useDebouncedState';
import BGValueRow from 'app/containers/MainTabsNavigator/Containers/Home/components/LatestBgValueRow';

const HomeContainer = styled.View`
  flex: 1;
  background-color: #fff;
`;

const sortFunction = (a: BgSample, b: BgSample) => {
  return b.date - a.date;
};

// create dummy home component with typescript
const Home: React.FC = () => {
  const [latestBgSample, setLatestBgSample] = useState<BgSample>();
  const [bgData, setBgData] = React.useState<BgSample[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [currentDate, setCurrentDate] = React.useState<Date>(new Date());
  const isShowingToday = useMemo(() => {
    const today = new Date();
    return (
      today.getFullYear() === currentDate.getFullYear() &&
      today.getMonth() === currentDate.getMonth() &&
      today.getDate() === currentDate.getDate()
    );
  }, [currentDate]);
  const getBgDataByDate = async (date: Date) => {
    setIsLoading(true);
    const fsManager = new FirestoreManager();
    const bgData = await fsManager.getBgDataByDateFS(date ?? new Date());
    const sortedBgData = bgData.sort(sortFunction);
    setBgData(sortedBgData);
    setIsLoading(false);
  };

  const [debouncedCurrentDate, setDebouncedCurrentDate] = useDebouncedState(
    currentDate,
    500,
  );
  useEffect(() => {
    setDebouncedCurrentDate(currentDate);
    setIsLoading(currentDate !== debouncedCurrentDate);
  }, [currentDate]);

  useEffect(() => {
    getBgDataByDate(debouncedCurrentDate);
  }, [debouncedCurrentDate]);
  // getUpdatedBgData - get the bg data for today and update the state
  const getUpdatedBgData = async () => {
    // noinspection JSIgnoredPromiseFromCall
    getBgDataByDate(new Date());
  };

  const pullToRefreshBgData = isShowingToday ? getUpdatedBgData : undefined;

  const setCustomDate = (date: Date) => {
    setCurrentDate(date);
  };
  const getNextDate = () => {
    setCurrentDate(new Date(currentDate.setDate(currentDate.getDate() + 1)));
  };
  const getPreviousDate = () => {
    setCurrentDate(new Date(currentDate.setDate(currentDate.getDate() - 1)));
  };

  useEffect(() => {
    if (
      bgData?.length &&
      (!latestBgSample || bgData[0].date > latestBgSample?.date)
    ) {
      setLatestBgSample(bgData[0]);
    }
  }, [bgData]);

  return (
    <HomeContainer>
      <BGValueRow
        bgData={latestBgSample}
        getUpdatedBgDataCallback={getUpdatedBgData}
      />
      <TimeInRangeRow bgData={bgData} />
      <Collapsable title={'Stats'}>
        <StatsRow bgData={bgData} />
      </Collapsable>
      {/*{isShowingToday && (*/}
      {/*  <Timer latestBgSample={latestBgSample} callback={getUpdatedBgData} />*/}
      {/*)}*/}
      <CgmCardListDisplay
        onPullToRefreshRefresh={pullToRefreshBgData}
        isLoading={isLoading}
        bgData={bgData}
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
