import React, {useEffect, useMemo} from 'react';
import {Text} from 'react-native';
import styled from 'styled-components/native';
import {FirestoreManager} from 'app/services/FirestoreManager';
import {BgSample} from 'app/types/day_bgs';
import CgmCardListDisplay from 'app/components/CgmCardListDisplay/CgmCardListDisplay';
import {Timer} from './components/Timer';
import {ActionButton} from './components/ActionButton';
import TimeInRangeRow from 'app/containers/MainTabsNavigator/Containers/Home/components/TimeInRangeRow';
import DateNavigatorRow from 'app/containers/MainTabsNavigator/Containers/Home/components/DateNavigatorRow';
import StatsRow from 'app/containers/MainTabsNavigator/Containers/Home/components/StatsRow';

const HomeContainer = styled.View`
  flex: 1;
  background-color: #fff;
`;

const sortFunction = (a: BgSample, b: BgSample) => {
  return b.date - a.date;
};

// create dummy home component with typescript
const Home: React.FC = () => {
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
  useEffect(() => {
    // noinspection JSIgnoredPromiseFromCall
    getBgDataByDate(currentDate);
  }, [currentDate]);

  // getUpdatedBgData - get the bg data for today and update the state
  const getUpdatedBgData = async () => {
    // noinspection JSIgnoredPromiseFromCall
    getBgDataByDate(new Date());
  };

  const latestBgSample = useMemo(() => {
    return bgData[0];
  }, [bgData]);

  return (
    <HomeContainer>
      <DateNavigatorRow
        date={currentDate}
        onGoBack={() =>
          setCurrentDate(
            new Date(currentDate.setDate(currentDate.getDate() - 1)),
          )
        }
        onGoForward={() =>
          setCurrentDate(
            new Date(currentDate.setDate(currentDate.getDate() + 1)),
          )
        }
        resetToCurrentDate={() => setCurrentDate(new Date())}
      />
      <TimeInRangeRow bgData={bgData} />
      <StatsRow bgData={bgData} />
      {isShowingToday && (
        <Timer latestBgSample={latestBgSample} callback={getUpdatedBgData} />
      )}
      <CgmCardListDisplay
        onPullToRefreshRefresh={getUpdatedBgData}
        isLoading={isLoading}
        bgData={bgData}
      />
    </HomeContainer>
  );
};

export default Home;
