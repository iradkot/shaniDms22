import React, {useCallback, useEffect, useMemo, useState} from 'react';

import styled from 'styled-components/native';
import CgmRows from 'app/components/CgmCardListDisplay/CgmRows';
import DateNavigatorRow from 'app/containers/MainTabsNavigator/Containers/Home/components/dateNavigatorRow/DateNavigatorRow';
import StatsRow, {
  type BgStatsKey,
  type BgStatsNavigatePayload,
} from 'app/containers/MainTabsNavigator/Containers/Home/components/StatsRow';
import {useDebouncedState} from 'app/hooks/useDebouncedState';
import {ThemeType} from 'app/types/theme';
import {useNavigation, StackActions} from '@react-navigation/native';
import {useBgData} from 'app/hooks/useBgData';
import {useFoodItems} from 'app/hooks/useFoodItems';
import {bgSortFunction} from 'app/utils/bg.utils';
import InsulinStatsRow from 'app/containers/MainTabsNavigator/Containers/Home/components/InsulinStatsRow/InsulinStatsRow';
import {useInsulinData} from 'app/hooks/useInsulinData';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {FULL_SCREEN_VIEW_SCREEN} from 'app/constants/SCREEN_NAMES';
import {isE2E} from 'app/utils/e2e';
import {makeE2EBgSamplesForDate} from 'app/utils/e2eFixtures';
import {getLoadReferences} from 'app/utils/loadBars.utils';

import HomeHeaderSection from 'app/containers/MainTabsNavigator/Containers/Home/sections/HomeHeaderSection';
import HomeSectionSwitcher from 'app/containers/MainTabsNavigator/Containers/Home/sections/HomeSectionSwitcher';
import HomeChartSection from 'app/containers/MainTabsNavigator/Containers/Home/sections/HomeChartSection';
import {useHomeChartViewport} from 'app/containers/MainTabsNavigator/Containers/Home/hooks/useHomeChartViewport';
import {
  HOME_SECTION_KEYS,
  type HomeSection,
} from 'app/containers/MainTabsNavigator/Containers/Home/homeSections';

const HomeContainer = styled.View`
  flex: 1;
  background-color: ${(props: {theme: ThemeType}) => props.theme.backgroundColor};
`;

// create dummy home component with typescript
const Home: React.FC = () => {
  const navigation = useNavigation();
  const [selectedSection, setSelectedSection] = useState<HomeSection | null>(null);
  const [currentDate, setCurrentDate] = React.useState<Date>(new Date());

  const [activeBgStatsKey, setActiveBgStatsKey] = useState<BgStatsKey | null>(null);
  const [bgStatsFocusToken, setBgStatsFocusToken] = useState<number>(0);
  const [bgStatsFocusTargetDateMs, setBgStatsFocusTargetDateMs] =
    useState<number | null>(null);
  const [bgStatsHighlightDateMs, setBgStatsHighlightDateMs] = useState<number[]>([]);
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
    carbTreatments,
    isLoading: insulinIsLoading,
    getUpdatedInsulinData,
  } = useInsulinData(debouncedCurrentDate);

  const startOfDay = new Date(debouncedCurrentDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(debouncedCurrentDate);
  endOfDay.setHours(23, 59, 59, 999);

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

  const chartFoodItems = useMemo(() => {
    const a = foodItems ?? [];
    const b = carbTreatments ?? [];
    if (!a.length) return b;
    if (!b.length) return a;
    return [...a, ...b];
  }, [foodItems, carbTreatments]);

  const memoizedBgSamples = useMemo(() => {
    const effectiveBgData =
      bgData.length === 0 && isE2E
        ? makeE2EBgSamplesForDate(debouncedCurrentDate)
        : bgData;

    return Array.from(effectiveBgData).sort(bgSortFunction(true));
  }, [bgData, debouncedCurrentDate]);

  const chartDataExtentMs = useMemo(() => {
    if (!memoizedBgSamples.length) {
      const now = Date.now();
      return {minMs: now, maxMs: now};
    }

    const minMs = memoizedBgSamples[0].date;
    const maxMs = memoizedBgSamples[memoizedBgSamples.length - 1].date;
    return {minMs, maxMs};
  }, [memoizedBgSamples]);

  const listBgData = useMemo(() => {
    // In E2E, ensure the glucose log list has deterministic data even when the
    // account/environment has no CGM entries.
    if (bgData.length === 0 && isE2E) {
      return Array.from(makeE2EBgSamplesForDate(debouncedCurrentDate)).sort(bgSortFunction(true));
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

  const {
    chartXDomain,
    isZoomed,
    canPanLeft,
    canPanRight,
    handleToggleZoom,
    handlePan,
  } = useHomeChartViewport({
    extentMs: chartDataExtentMs,
    anchorMs: headerLatestBgSample?.date ?? latestBgSample?.date,
  });

  const fullXDomain = useMemo<[Date, Date]>(() => {
    return [new Date(chartDataExtentMs.minMs), new Date(chartDataExtentMs.maxMs)];
  }, [chartDataExtentMs.maxMs, chartDataExtentMs.minMs]);

  const {maxIobReference, maxCobReference} = useMemo(
    () => getLoadReferences(listBgData),
    [listBgData],
  );

  const handleOpenStackedChartsFullScreen = useCallback(() => {
    const xDomainMs = chartXDomain
      ? {startMs: chartXDomain[0].getTime(), endMs: chartXDomain[1].getTime()}
      : null;

    const fullScreenPayload = {
      mode: 'stackedCharts' as const,
      bgSamples: memoizedBgSamples,
      foodItems: chartFoodItems,
      insulinData,
      basalProfileData,
      xDomainMs,
      fallbackAnchorTimeMs: headerLatestBgSample?.date ?? latestBgSample?.date,
    };

    try {
      const action = StackActions.push(FULL_SCREEN_VIEW_SCREEN, fullScreenPayload);
      (navigation as any).dispatch(action);
    } catch (e) {
      (navigation as any).navigate?.(FULL_SCREEN_VIEW_SCREEN, fullScreenPayload);
    }
  }, [
    basalProfileData,
    chartFoodItems,
    chartXDomain,
    headerLatestBgSample?.date,
    insulinData,
    latestBgSample?.date,
    memoizedBgSamples,
    navigation,
  ]);

  const handleToggleSection = useCallback((section: HomeSection) => {
    setSelectedSection(prev => (prev === section ? null : section));
  }, []);

  const handleNavigateToBgSample = useCallback((payload: BgStatsNavigatePayload) => {
    const token = Date.now();
    setBgStatsFocusToken(token);
    setBgStatsFocusTargetDateMs(payload.targetDateMs);
    setBgStatsHighlightDateMs(payload.highlightDateMs);
    setActiveBgStatsKey(payload.key);
  }, []);

  useEffect(() => {
    if (!bgStatsFocusToken) return;
    const timeoutId = setTimeout(() => {
      setActiveBgStatsKey(null);
    }, 1400);
    return () => clearTimeout(timeoutId);
  }, [bgStatsFocusToken]);

  const homeSectionNodes = useMemo(() => {
    const nodes: Record<HomeSection, React.ReactNode> = {
      bgStats: (
        <StatsRow
          bgData={bgData}
          activeKey={activeBgStatsKey}
          onNavigateToSample={handleNavigateToBgSample}
        />
      ),
      insulinStats: (
        <InsulinStatsRow
          insulinData={insulinData}
          basalProfileData={basalProfileData}
          startDate={startOfDay}
          endDate={endOfDay}
        />
      ),
      chart: null,
    };

    return nodes;
  }, [
    activeBgStatsKey,
    basalProfileData,
    bgData,
    endOfDay,
    handleNavigateToBgSample,
    insulinData,
    startOfDay,
  ]);

  return (
    <HomeContainer testID={E2E_TEST_IDS.screens.home}>
      <HomeHeaderSection
        bgData={bgData}
        isShowingToday={isShowingToday}
        headerLatestBgSample={headerLatestBgSample ?? undefined}
        headerLatestPrevBgSample={headerLatestPrevBgSample ?? undefined}
        latestBgSample={latestBgSample ?? undefined}
        latestPrevBgSample={latestPrevBgSample ?? undefined}
        listBgData={listBgData}
        maxIobReference={maxIobReference}
        maxCobReference={maxCobReference}
        onRefreshBgData={getUpdatedBgData}
      />

      <HomeSectionSwitcher
        selectedSection={selectedSection}
        onToggle={handleToggleSection}
      />

      {selectedSection && selectedSection !== HOME_SECTION_KEYS.chart
        ? homeSectionNodes[selectedSection]
        : null}

      <HomeChartSection
        visible={selectedSection === HOME_SECTION_KEYS.chart}
        isZoomed={isZoomed}
        canPanLeft={canPanLeft}
        canPanRight={canPanRight}
        onPan={handlePan}
        onToggleZoom={handleToggleZoom}
        bgSamples={memoizedBgSamples}
        foodItems={chartFoodItems}
        insulinData={insulinData}
        basalProfileData={basalProfileData}
        xDomain={chartXDomain ?? fullXDomain}
        fallbackAnchorTimeMs={headerLatestBgSample?.date ?? latestBgSample?.date}
        onPressFullScreen={handleOpenStackedChartsFullScreen}
        testID={E2E_TEST_IDS.charts.cgmGraph}
      />

      <CgmRows
        onPullToRefreshRefresh={getUpdatedBgData}
        isLoading={isLoading}
        bgData={listBgData}
        isToday={isShowingToday}
        focusTargetDateMs={bgStatsFocusTargetDateMs}
        focusHighlightDateMs={bgStatsHighlightDateMs}
        focusToken={bgStatsFocusToken}
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
