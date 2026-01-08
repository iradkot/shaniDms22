import React, {useCallback, useEffect, useMemo} from 'react';

import styled from 'styled-components/native';
import CgmRows from 'app/components/CgmCardListDisplay/CgmRows';
import TimeInRangeRow from 'app/containers/MainTabsNavigator/Containers/Home/components/TimeInRangeRow';
import DateNavigatorRow from 'app/containers/MainTabsNavigator/Containers/Home/components/dateNavigatorRow/DateNavigatorRow';
import StatsRow from 'app/containers/MainTabsNavigator/Containers/Home/components/StatsRow';
import Collapsable from 'app/components/Collapsable';
import {useDebouncedState} from 'app/hooks/useDebouncedState';
import LatestCgmRow from 'app/containers/MainTabsNavigator/Containers/Home/components/LatestCgmRow';
import SmartExpandableHeader from 'app/containers/MainTabsNavigator/Containers/Home/components/SmartExpandableHeader';
import BgGraph from 'app/components/charts/CgmGraph/CgmGraph';
import {cloneDeep} from 'lodash';
import {Theme} from 'app/types/theme';
import {Dimensions, SafeAreaView, Text} from 'react-native';
import {useBgData} from 'app/hooks/useBgData';
import {useFoodItems} from 'app/hooks/useFoodItems';
import {bgSortFunction} from 'app/utils/bg.utils';
import InsulinStatsRow from 'app/containers/MainTabsNavigator/Containers/Home/components/InsulinStatsRow/InsulinStatsRow';
import {useInsulinData} from 'app/hooks/useInsulinData';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {isE2E} from 'app/utils/e2e';
import {makeE2EBgSamplesForDate} from 'app/utils/e2eFixtures';
import {getLoadReferences} from 'app/utils/loadBars.utils';

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
    basalProfileData,
    isLoading: insulinIsLoading,
    getUpdatedInsulinData,
  } = useInsulinData(debouncedCurrentDate);

  const startOfDay = new Date(debouncedCurrentDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(debouncedCurrentDate);
  endOfDay.setHours(23, 59, 59, 999);

  const refreshAll = useCallback(async () => {
    await Promise.all([getUpdatedBgData(), getUpdatedInsulinData()]);
  }, [getUpdatedBgData, getUpdatedInsulinData]);

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
    const effectiveBgData =
      bgData.length === 0 && isE2E
        ? makeE2EBgSamplesForDate(debouncedCurrentDate)
        : bgData;

    return cloneDeep(effectiveBgData).sort(bgSortFunction(true));
  }, [bgData, debouncedCurrentDate]);

  const listBgData = useMemo(() => {
    // In E2E, ensure the glucose log list has deterministic data even when the
    // account/environment has no CGM entries.
    if (bgData.length === 0 && isE2E) {
      return cloneDeep(makeE2EBgSamplesForDate(debouncedCurrentDate)).sort(
        bgSortFunction(true),
      );
    }
    return bgData;
  }, [bgData, debouncedCurrentDate]);

  const headerLatestBgSample = useMemo(() => {
    if (latestBgSample) return latestBgSample;
    if (!isE2E) return latestBgSample;
    if (!listBgData.length) return undefined;

    let best = listBgData[0];
    for (const sample of listBgData) {
      if (sample.date > best.date) best = sample;
    }
    return best;
  }, [latestBgSample, listBgData]);

  const headerLatestPrevBgSample = useMemo(() => {
    if (latestPrevBgSample) return latestPrevBgSample;
    if (!isE2E) return latestPrevBgSample;
    if (listBgData.length < 2) return undefined;

    let best = listBgData[0];
    let second = listBgData[1];
    if (second.date > best.date) {
      const tmp = best;
      best = second;
      second = tmp;
    }

    for (const sample of listBgData) {
      if (sample.date > best.date) {
        second = best;
        best = sample;
      } else if (sample.date > second.date && sample.date !== best.date) {
        second = sample;
      }
    }

    return second;
  }, [latestPrevBgSample, listBgData]);

  const {maxIobReference, maxCobReference} = useMemo(
    () => getLoadReferences(listBgData),
    [listBgData],
  );

  return (
    <HomeContainer testID={E2E_TEST_IDS.screens.home}>
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
            onRefresh={getUpdatedBgData}
          />
        )}
        <Collapsable title={'BG Stats'}>
          <StatsRow bgData={bgData} />
        </Collapsable>
        <Collapsable title={'Insulin Stats'}>
          <InsulinStatsRow
            insulinData={insulinData}
            basalProfileData={basalProfileData}
            startDate={startOfDay}
            endDate={endOfDay}
            onRefresh={refreshAll}
          />
        </Collapsable>
        <Collapsable title={'chart'} testID={E2E_TEST_IDS.charts.cgmSection}>
          <BgGraph
            bgSamples={memoizedBgSamples}
            width={Dimensions.get('window').width}
            height={200}
            foodItems={foodItems}
            insulinData={insulinData}
            testID={E2E_TEST_IDS.charts.cgmGraph}
          />
        </Collapsable>
        <CgmRows
          onPullToRefreshRefresh={getUpdatedBgData}
          isLoading={isLoading}
          bgData={listBgData}
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
