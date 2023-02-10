import React, {useEffect, useMemo, useState} from 'react';
import styled from 'styled-components/native';
import {FirebaseService} from 'app/services/firebase/FirebaseService';
import {BgSample} from 'app/types/day_bgs';
import CgmCardListDisplay from 'app/components/CgmCardListDisplay/CgmCardListDisplay';
import TimeInRangeRow from 'app/containers/MainTabsNavigator/Containers/Home/components/TimeInRangeRow';
import DateNavigatorRow from 'app/containers/MainTabsNavigator/Containers/Home/components/dateNavigatorRow/DateNavigatorRow';
import StatsRow from 'app/containers/MainTabsNavigator/Containers/Home/components/StatsRow';
import Collapsable from 'app/containers/MainTabsNavigator/Containers/Home/components/Collapsable';
import {useDebouncedState} from 'app/hooks/useDebouncedState';
import BGValueRow from 'app/containers/MainTabsNavigator/Containers/Home/components/LatestBgValueRow';
import BgGraph from 'app/components/CgmGraph/CgmGraph';
import {cloneDeep} from 'lodash';
import {Theme} from 'app/types/theme';
import {Dimensions} from 'react-native';

const HomeContainer = styled.View<{theme: Theme}>`
  flex: 1;
  background-color: ${({theme}) => theme.backgroundColor};
`;

/**
 * This is a curried function that returns a function that sorts an array of BgSample objects
 * @param ascending
 * @returns {(a: BgSample, b: BgSample) => number}
 * @example
 * const sortedBgData = bgData.sort(sortFunction(false));
 **/
const sortFunction =
  (ascending = false) =>
  (a: BgSample, b: BgSample) => {
    if (ascending) {
      return a.date - b.date;
    } else {
      return b.date - a.date;
    }
  };

// create dummy home component with typescript
const Home: React.FC = () => {
  const [latestBgSample, setLatestBgSample] = useState<BgSample>();
  const [bgData, setBgData] = React.useState<BgSample[]>([]);
  const [todayBgData, setTodayBgData] = React.useState<BgSample[]>([]);
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
  const getBgDataByDate = async (date?: Date): Promise<void> => {
    setIsLoading(true);
    const fsManager = new FirebaseService();
    const bgData = await fsManager.getBgDataByDate({
      endDate: date ?? new Date(),
      getWholeDays: true,
    });
    const sortedBgData = bgData.sort(sortFunction(false));
    if (!date || isShowingToday) {
      setTodayBgData(sortedBgData);
      if (isShowingToday) {
        setBgData(sortedBgData);
      }
    } else {
      setBgData(sortedBgData);
    }
    setIsLoading(false);
  };

  const [debouncedCurrentDate, setDebouncedCurrentDate] = useDebouncedState(
    currentDate,
    500,
  );
  useEffect(() => {
    setDebouncedCurrentDate(currentDate);
    setIsLoading(currentDate !== debouncedCurrentDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  useEffect(() => {
    // noinspection JSIgnoredPromiseFromCall
    getBgDataByDate(debouncedCurrentDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedCurrentDate]);
  // getUpdatedBgData - get the bg data for today and update the state
  const getUpdatedBgData = async () => {
    // noinspection JSIgnoredPromiseFromCall
    await getBgDataByDate();
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
      todayBgData?.length &&
      (!latestBgSample || todayBgData[0].date > latestBgSample?.date)
    ) {
      setLatestBgSample(todayBgData[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayBgData]);

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
      <Collapsable title={'chart'}>
        <BgGraph
          data={cloneDeep(bgData).sort(sortFunction(true))}
          width={Dimensions.get('window').width}
          height={200}
        />
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
