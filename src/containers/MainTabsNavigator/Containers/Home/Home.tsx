import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {RefreshControl, ScrollView, View, Text} from 'react-native';

import styled, {useTheme} from 'styled-components/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DateNavigatorRow from 'app/containers/MainTabsNavigator/Containers/Home/components/dateNavigatorRow/DateNavigatorRow';
import StatsRow from 'app/containers/MainTabsNavigator/Containers/Home/components/StatsRow';
import InsulinStatsRow from 'app/containers/MainTabsNavigator/Containers/Home/components/InsulinStatsRow/InsulinStatsRow';
import {useDebouncedState} from 'app/hooks/useDebouncedState';
import {ThemeType} from 'app/types/theme';
import {useNavigation} from '@react-navigation/native';
import {useBgData} from 'app/hooks/useBgData';
import {useFoodItems} from 'app/hooks/useFoodItems';
import {bgSortFunction} from 'app/utils/bg.utils';
import {useInsulinData} from 'app/hooks/useInsulinData';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {isE2E} from 'app/utils/e2e';
import {makeE2EBgSamplesForDate} from 'app/utils/e2eFixtures';
import {getLoadReferences} from 'app/utils/loadBars.utils';
import {buildFullScreenStackedChartsParams} from 'app/utils/stackedChartsData.utils';
import {pushFullScreenStackedCharts} from 'app/utils/fullscreenNavigation.utils';
import {useLatestNightscoutSnapshot} from 'app/hooks/useLatestNightscoutSnapshot';
import {addOpacity} from 'app/style/styling.utils';

import HomeHeaderSection from 'app/containers/MainTabsNavigator/Containers/Home/sections/HomeHeaderSection';
import CompactDayChart from 'app/containers/MainTabsNavigator/Containers/Home/sections/CompactDayChart';
import PreMealCard from 'app/containers/MainTabsNavigator/Containers/Home/components/PreMealCard';
import MealTimeline from 'app/containers/MainTabsNavigator/Containers/Home/components/MealTimeline';
import HomeChartsTooltip from 'app/containers/MainTabsNavigator/Containers/Home/components/HomeChartsTooltip';
import type {StackedChartsTooltipModel} from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts';
import {useHomeChartViewport} from 'app/containers/MainTabsNavigator/Containers/Home/hooks/useHomeChartViewport';
import {useMealSegments} from 'app/containers/MainTabsNavigator/Containers/Home/hooks/useMealSegments';
import type {MealSegment} from 'app/containers/MainTabsNavigator/Containers/Home/hooks/useMealSegments';
import {useMealTags} from 'app/hooks/useMealTags';
import TagMealSheet from 'app/components/MealTagging/TagMealSheet';
import {format, subDays} from 'date-fns';
import {fetchBgDataForDateRangeUncached} from 'app/api/apiRequests';
import {DAILY_REVIEW_SCREEN} from 'app/constants/SCREEN_NAMES';
import {getLatestDailyBrief} from 'app/services/proactiveCare/dailyBrief';
import {getInsulinRangeMetrics} from 'app/services/insulin/insulinRangeMetrics';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

const HomeContainer = styled.View`
  flex: 1;
  background-color: ${(props: {theme: ThemeType}) => props.theme.backgroundColor};
`;

const TooltipOverlay = styled.View<{theme: ThemeType}>`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 999;
  elevation: 30;
  padding-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
  padding-top: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
`;

const StatsToggleRow = styled.Pressable<{theme: ThemeType}>`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding-vertical: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  margin-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius + 2}px;
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.12)};
  background-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.white, 0.9)};
`;

const StatsToggleText = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  font-weight: 700;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.6)};
  margin-left: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
`;

const DailySummaryCard = styled.Pressable<{theme: ThemeType}>`
  margin-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius + 2}px;
  background-color: ${(p: {theme: ThemeType}) => p.theme.white};
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.12)};
`;

// create dummy home component with typescript
const Home: React.FC = () => {
  const navigation = useNavigation();
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();
  const [currentDate, setCurrentDate] = React.useState<Date>(new Date());
  const [showDetailedStats, setShowDetailedStats] = useState(false);
  const [tooltipModel, setTooltipModel] = useState<StackedChartsTooltipModel | null>(null);

  const handleTooltipModelChange = useCallback((model: StackedChartsTooltipModel) => {
    setTooltipModel(model.visible ? model : null);
  }, []);

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

    const fullScreenPayload = buildFullScreenStackedChartsParams({
      bgSamples: memoizedBgSamples,
      foodItems: chartFoodItems,
      insulinData,
      basalProfileData,
      xDomainMs,
      fallbackAnchorTimeMs: headerLatestBgSample?.date ?? latestBgSample?.date,
    });

    pushFullScreenStackedCharts({navigation, payload: fullScreenPayload});
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

  // ── Meal segments (auto-detected from carb/bolus events) ──────────────
  const mealSegments = useMealSegments({
    bgData: listBgData,
    insulinData,
    carbTreatments,
    foodItems: foodItems ?? [],
  });

  // ── Meal tags ─────────────────────────────────────────────────────────
  const allMealIds = useMemo(
    () => mealSegments.reduce<string[]>((acc, s) => {
      const ids = s.mealIds.length > 0 ? s.mealIds : [s.id];
      return acc.concat(ids);
    }, []),
    [mealSegments],
  );
  const {tagMap, suggestions, tagMeal} = useMealTags(allMealIds);

  // Merge async tags into segments
  const taggedSegments = useMemo(() => {
    return mealSegments.map(s => {
      const ids = s.mealIds.length > 0 ? s.mealIds : [s.id];
      const localTags = ids.reduce<string[]>((acc, id) => acc.concat(tagMap[id] ?? []), []);
      const merged = [...new Set([...s.tags, ...localTags])];
      return merged.length !== s.tags.length ? {...s, tags: merged} : s;
    });
  }, [mealSegments, tagMap]);

  // Tag sheet state
  const [tagSheetSegment, setTagSheetSegment] = useState<MealSegment | null>(null);

  const handleMealTagPress = useCallback((segment: MealSegment) => {
    setTagSheetSegment(segment);
  }, []);

  const handleTagSave = useCallback(
    async (tags: string[]) => {
      if (tagSheetSegment) {
        // Use mealIds if available, otherwise fall back to the segment id
        const ids = tagSheetSegment.mealIds.length > 0
          ? tagSheetSegment.mealIds
          : [tagSheetSegment.id];
        for (const id of ids) {
          await tagMeal(id, tags);
        }
      }
      setTagSheetSegment(null);
    },
    [tagSheetSegment, tagMeal],
  );

  const handleTagSheetClose = useCallback(() => {
    setTagSheetSegment(null);
  }, []);

  const tagSheetCurrentTags = useMemo(() => {
    if (!tagSheetSegment) return [];
    const ids = tagSheetSegment.mealIds.length > 0
      ? tagSheetSegment.mealIds
      : [tagSheetSegment.id];
    const localTags = ids.reduce<string[]>((acc, id) => acc.concat(tagMap[id] ?? []), []);
    return [...new Set([...tagSheetSegment.tags, ...localTags])];
  }, [tagSheetSegment, tagMap]);

  const tagSheetLabel = useMemo(() => {
    if (!tagSheetSegment) return '';
    return `${tagSheetSegment.label} · ${format(new Date(tagSheetSegment.startMs), 'HH:mm')}`;
  }, [tagSheetSegment]);

  const lastMealSegment = useMemo(() => {
    return taggedSegments.length ? taggedSegments[taggedSegments.length - 1] : null;
  }, [taggedSegments]);

  const handleRefreshAll = useCallback(() => {
    getUpdatedBgData();
    getUpdatedInsulinData();
  }, [getUpdatedBgData, getUpdatedInsulinData]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handlePullToRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([getUpdatedBgData(), getUpdatedInsulinData()]);
    setIsRefreshing(false);
  }, [getUpdatedBgData, getUpdatedInsulinData]);

  // ── Live BG snapshot for PreMealCard (polls Nightscout every 60s) ─────
  const {snapshot: liveSnapshot} = useLatestNightscoutSnapshot({
    pollingEnabled: isShowingToday,
  });

  const liveBgSample = useMemo(() => {
    if (liveSnapshot?.enrichedBg) return liveSnapshot.enrichedBg;
    return headerLatestBgSample ?? undefined;
  }, [liveSnapshot, headerLatestBgSample]);

  // ── InsulinStatsRow needs startOfDay / endOfDay ───────────────────────
  const startOfDay = useMemo(() => {
    const d = new Date(debouncedCurrentDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [debouncedCurrentDate]);

  const endOfDay = useMemo(() => {
    const d = new Date(debouncedCurrentDate);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [debouncedCurrentDate]);

  const [dailySummary, setDailySummary] = useState<{
    nightLine: string;
    actionLine: string;
    tirText: string;
    avgBgText: string;
    insulinText: string;
    trendText: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const isSelectedToday = startOfDay.getTime() === todayStart.getTime();

        const summaryStart = startOfDay;
        const summaryEnd = endOfDay;
        const prevDayStart = subDays(summaryStart, 1);
        const baselineEnd = summaryStart;
        const prevWeekStart = subDays(baselineEnd, 7);

        const [yRows, wRows, latestBrief] = await Promise.all([
          fetchBgDataForDateRangeUncached(summaryStart, summaryEnd, {throwOnError: false}),
          fetchBgDataForDateRangeUncached(prevWeekStart, baselineEnd, {throwOnError: false}),
          getLatestDailyBrief(),
        ]);

        const y = (yRows as any[]) ?? [];
        const w = (wRows as any[]) ?? [];

        const yTir = y.length ? Math.round((y.filter(r => r.sgv >= 70 && r.sgv <= 180).length / y.length) * 100) : 0;
        const wTir = w.length ? Math.round((w.filter(r => r.sgv >= 70 && r.sgv <= 180).length / w.length) * 100) : 0;
        const yLows = y.filter(r => r.sgv < 70).length;
        const yAvgBg = y.length ? Math.round(y.reduce((s, r) => s + (r.sgv ?? 0), 0) / y.length) : 0;

        const nightRows = y.filter(r => {
          const dt = r?.dateString ? new Date(r.dateString) : null;
          if (!dt || Number.isNaN(dt.getTime())) return false;
          const h = dt.getHours();
          return h >= 0 && h < 6;
        });
        const nightLows = nightRows.filter(r => r.sgv < 70).length;

        let insulinSelectedDay = 0;
        let insulinPrevDay = 0;
        let insulinAvgDaily = 0;

        try {
          const [selectedDayMetrics, prevDayMetrics, weekMetrics] = await Promise.all([
            getInsulinRangeMetrics(summaryStart, summaryEnd),
            getInsulinRangeMetrics(prevDayStart, summaryStart),
            getInsulinRangeMetrics(prevWeekStart, baselineEnd),
          ]);

          insulinSelectedDay = selectedDayMetrics.totalInsulin;
          insulinPrevDay = prevDayMetrics.totalInsulin;
          insulinAvgDaily = weekMetrics.totalInsulin > 0 ? weekMetrics.totalInsulin / 7 : 0;
        } catch {
          // keep insulin metrics at zero fallback
        }

        const insulinDelta = insulinSelectedDay - insulinPrevDay;

        const nightLine = nightLows > 0 ? tr(language, 'home.nightLows', {count: nightLows}) : tr(language, 'home.nightStable');
        const defaultActionLine = yLows > 0 ? tr(language, 'home.todayAvoidStacking') : tr(language, 'home.todayKeepRoutine');
        const briefLines = (latestBrief?.body || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
        const actionLine =
          briefLines.find((l: string) => l.startsWith('🎯') || l.toLowerCase().startsWith('today:') || l.includes('היום:')) ||
          briefLines[2] ||
          defaultActionLine;

        if (!mounted) return;
        setDailySummary({
          nightLine,
          actionLine,
          tirText: tr(language, 'home.tirVs7d', {tir: yTir, delta: `${yTir - wTir >= 0 ? '+' : ''}${yTir - wTir}`}),
          avgBgText: tr(language, 'home.avgBg', {value: yAvgBg}),
          insulinText: tr(language, 'home.insulinLine', {value: insulinSelectedDay.toFixed(1), delta: `${insulinDelta >= 0 ? '+' : ''}${insulinDelta.toFixed(1)}`, avg: insulinAvgDaily.toFixed(1)}),
          trendText: yLows > 0 ? tr(language, 'home.trendHypo') : tr(language, 'home.trendStable'),
        });
      } catch {
        if (mounted) {
          setDailySummary({
            nightLine: tr(language, 'home.nightNoData'),
            actionLine: tr(language, 'home.todayCollectMore'),
            tirText: tr(language, 'home.tirEmpty'),
            avgBgText: tr(language, 'home.avgBgEmpty'),
            insulinText: tr(language, 'home.insulinEmpty'),
            trendText: tr(language, 'home.trendCollectMore'),
          });
        }
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, [startOfDay, endOfDay, isShowingToday, debouncedCurrentDate, language]);

  return (
    <HomeContainer testID={E2E_TEST_IDS.screens.home}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handlePullToRefresh}
          />
        }>
        {/* 1. Hero: Live BG header + Time-in-Range bar */}
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

        {dailySummary ? (
          <DailySummaryCard onPress={() => (navigation as any).navigate(DAILY_REVIEW_SCREEN)}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
              <Text style={{fontWeight: '800', color: theme.textColor, fontSize: 16}}>{tr(language, 'home.yesterdaySummary')}</Text>
              <Text style={{color: addOpacity(theme.textColor, 0.65), fontSize: 12}}>{isShowingToday ? tr(language, 'common.today') : format(debouncedCurrentDate, 'dd/MM')}</Text>
            </View>

            <View style={{marginTop: 8, gap: 4}}>
              <Text style={{color: theme.textColor}}>{dailySummary.nightLine}</Text>
              <Text style={{color: addOpacity(theme.textColor, 0.86)}}>{dailySummary.actionLine}</Text>
            </View>

            <View style={{marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
              <View style={{paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, backgroundColor: addOpacity(theme.inRangeColor, 0.14)}}>
                <Text style={{color: theme.textColor, fontWeight: '700', fontSize: 12}}>{dailySummary.tirText}</Text>
              </View>
              <View style={{paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, backgroundColor: addOpacity(theme.accentColor, 0.14)}}>
                <Text style={{color: theme.textColor, fontWeight: '700', fontSize: 12}}>{dailySummary.avgBgText}</Text>
              </View>
              <View style={{paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, backgroundColor: addOpacity(theme.aboveRangeColor, 0.14)}}>
                <Text style={{color: theme.textColor, fontWeight: '700', fontSize: 12}}>{dailySummary.insulinText}</Text>
              </View>
            </View>

            <Text style={{marginTop: 10, color: addOpacity(theme.textColor, 0.75)}}>{dailySummary.trendText}</Text>
            <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.65)}}>{tr(language, 'home.tapForFullReview')}</Text>
          </DailySummaryCard>
        ) : null}

        {/* 2. Collapsible detailed stats (BG + Insulin) — at top for quick access */}
        <StatsToggleRow
          accessibilityRole="button"
          onPress={() => setShowDetailedStats(prev => !prev)}>
          <Icon
            name={showDetailedStats ? 'chevron-up' : 'chart-bar'}
            size={16}
            color={addOpacity('#000000', 0.5)}
          />
          <StatsToggleText>
            {showDetailedStats ? tr(language, 'home.hideDetailed') : tr(language, 'home.showDetailed')}
          </StatsToggleText>
        </StatsToggleRow>

        {showDetailedStats ? (
          <>
            <StatsRow bgData={bgData} />
            <InsulinStatsRow
              insulinData={insulinData}
              basalProfileData={basalProfileData}
              startDate={startOfDay}
              endDate={endOfDay}
            />
          </>
        ) : null}

        {/* 3. Compact day chart (always visible, with basal + insulin mini charts) */}
        <CompactDayChart
          bgSamples={memoizedBgSamples}
          foodItems={chartFoodItems}
          insulinData={insulinData}
          basalProfileData={basalProfileData}
          xDomain={fullXDomain}
          fallbackAnchorTimeMs={headerLatestBgSample?.date ?? latestBgSample?.date}
          onPressFullScreen={handleOpenStackedChartsFullScreen}
          onTooltipModelChange={handleTooltipModelChange}
          testID={E2E_TEST_IDS.charts.cgmGraph}
        />

        {/* 4. Pre-meal decision card (today only, uses live polling BG) */}
        {isShowingToday ? (
          <PreMealCard
            latestBgSample={liveBgSample}
            insulinData={insulinData}
            lastMealSegment={lastMealSegment}
          />
        ) : null}

        {/* 5. Meal-segmented timeline */}
        <MealTimeline
          meals={taggedSegments}
          isLoading={isLoading || insulinIsLoading}
          isToday={isShowingToday}
          onTagPress={handleMealTagPress}
        />
      </ScrollView>

      {/* Chart tooltip overlay — renders at the top of the screen, over header/TIR */}
      {tooltipModel ? (
        <TooltipOverlay pointerEvents="none">
          <HomeChartsTooltip
            anchorTimeMs={tooltipModel.anchorTimeMs}
            bgSample={tooltipModel.bgSample}
            activeInsulinU={tooltipModel.activeInsulinU}
            activeInsulinBolusU={tooltipModel.activeInsulinBolusU}
            activeInsulinBasalU={tooltipModel.activeInsulinBasalU}
            cobG={tooltipModel.cobG}
            basalRateUhr={tooltipModel.basalRateUhr}
            bolusSummary={tooltipModel.bolusSummary}
            carbsSummary={tooltipModel.carbsSummary}
            bolusEvents={tooltipModel.bolusEvents}
            carbEvents={tooltipModel.carbEvents}
            fullWidth={tooltipModel.fullWidth}
            maxWidthPx={tooltipModel.maxWidthPx}
          />
        </TooltipOverlay>
      ) : null}

      {/* Tag meal sheet */}
      <TagMealSheet
        visible={tagSheetSegment != null}
        mealLabel={tagSheetLabel}
        currentTags={tagSheetCurrentTags}
        suggestions={suggestions}
        onSave={handleTagSave}
        onClose={handleTagSheetClose}
      />

      {/* Date navigator (pinned to bottom, outside scroll) */}
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

