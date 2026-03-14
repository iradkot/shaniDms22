import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {RefreshControl, ScrollView, View, Text} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
import {DAILY_REVIEW_SCREEN} from 'app/constants/SCREEN_NAMES';
import {getLatestDailyBrief} from 'app/services/proactiveCare/dailyBrief';
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

const DailySummaryAlert = styled.Pressable<{theme: ThemeType}>`
  margin-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius + 2}px;
  background-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.accentColor, 0.08)};
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.accentColor, 0.35)};
`;

const TodayRecommendationCard = styled.View<{theme: ThemeType}>`
  margin-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius + 2}px;
  background-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.accentColor, 0.08)};
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.accentColor, 0.35)};
  overflow: hidden;
`;

const TodayRecommendationHeader = styled.Pressable<{theme: ThemeType}>`
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const TodayRecommendationBody = styled.View<{theme: ThemeType}>`
  padding-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  padding-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
`;

// create dummy home component with typescript
const DAILY_SUMMARY_SEEN_KEY = 'home.dailySummary.lastSeenDate.v1';

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

  const [showTodayRecommendation, setShowTodayRecommendation] = useState(true);

  const todayRecommendation = useMemo(() => {
    if (!isShowingToday) return null;

    const bg = liveBgSample?.sgv;
    const dir = liveBgSample?.direction;
    const iob = typeof liveBgSample?.iob === 'number' ? liveBgSample.iob : null;
    const cob = typeof liveBgSample?.cob === 'number' ? liveBgSample.cob : null;
    const nextValues = (liveSnapshot?.predictions ?? []).map(p => p.sgv).filter(v => Number.isFinite(v));
    const nextPeak = nextValues.length ? Math.max(...nextValues) : null;
    const projectedRise = typeof bg === 'number' && typeof nextPeak === 'number' ? nextPeak - bg : null;

    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    const lastMealMs = lastMealSegment?.startMs ?? null;
    const minsSinceMeal = lastMealMs ? Math.round((Date.now() - lastMealMs) / 60000) : null;

    const details =
      typeof bg === 'number'
        ? tr(language, 'home.todayRecoDetails', {
            now: bg,
            next: nextValues.join('→') || '—',
            iob: iob != null ? iob.toFixed(1) : '—',
            cob: cob != null ? Math.round(cob) : '—',
          })
        : null;

    if (typeof bg === 'number' && bg < 75) {
      return {
        title: tr(language, 'home.todayRecoHypoTitle'),
        body: tr(language, 'home.todayRecoHypoBody'),
        details,
      };
    }

    if (typeof bg === 'number' && bg <= 95 && ['SingleDown', 'DoubleDown', 'FortyFiveDown'].includes(String(dir))) {
      return {
        title: tr(language, 'home.todayRecoWatchLowTitle'),
        body: tr(language, 'home.todayRecoWatchLowBody'),
        details,
      };
    }

    if (
      minsSinceMeal != null &&
      minsSinceMeal <= 150 &&
      typeof bg === 'number' &&
      bg >= 85 &&
      bg <= 150 &&
      iob != null &&
      iob >= 1 &&
      projectedRise != null &&
      projectedRise >= 8 &&
      projectedRise <= 45
    ) {
      return {
        title: tr(language, 'home.todayRecoPostMealLoopTitle'),
        body: tr(language, 'home.todayRecoPostMealLoopBody'),
        details,
      };
    }

    if (
      minsSinceMeal != null &&
      minsSinceMeal >= 45 &&
      minsSinceMeal <= 120 &&
      typeof bg === 'number' &&
      bg >= 80 &&
      bg <= 160 &&
      iob != null &&
      iob >= 0.8
    ) {
      return {
        title: tr(language, 'home.todayRecoWalkTitle'),
        body: tr(language, 'home.todayRecoWalkBody'),
        details,
      };
    }

    if (typeof bg === 'number' && bg >= 180 && (iob == null || iob < 0.6)) {
      return {
        title: tr(language, 'home.todayRecoHighTitle'),
        body: tr(language, 'home.todayRecoHighBody'),
        details,
      };
    }

    if (hour >= 10.5 && hour <= 13.5 && (minsSinceMeal == null || minsSinceMeal > 180)) {
      return {
        title: tr(language, 'home.todayRecoMealPrepTitle'),
        body: tr(language, 'home.todayRecoMealPrepBody'),
        details,
      };
    }

    return {
      title: tr(language, 'home.todayRecoStableTitle'),
      body: tr(language, 'home.todayRecoStableBody'),
      details,
    };
  }, [
    isShowingToday,
    language,
    lastMealSegment?.startMs,
    liveBgSample?.cob,
    liveBgSample?.direction,
    liveBgSample?.iob,
    liveBgSample?.sgv,
    liveSnapshot?.predictions,
  ]);

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

  const [showDailySummaryAlert, setShowDailySummaryAlert] = useState(false);
  const [pendingSummaryDate, setPendingSummaryDate] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        const summaryDate = format(subDays(new Date(), 1), 'yyyy-MM-dd');
        const latestBrief = await getLatestDailyBrief();
        const seenDate = await AsyncStorage.getItem(DAILY_SUMMARY_SEEN_KEY);

        if (!mounted) return;

        const hasBrief = !!latestBrief?.body;
        setPendingSummaryDate(summaryDate);
        setShowDailySummaryAlert(Boolean(isShowingToday && hasBrief && seenDate !== summaryDate));
      } catch {
        if (mounted) {
          setShowDailySummaryAlert(false);
          setPendingSummaryDate(null);
        }
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, [isShowingToday]);

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

        {showDailySummaryAlert ? (
          <DailySummaryAlert
            onPress={async () => {
              if (pendingSummaryDate) {
                await AsyncStorage.setItem(DAILY_SUMMARY_SEEN_KEY, pendingSummaryDate);
              }
              setShowDailySummaryAlert(false);
              (navigation as any).navigate(DAILY_REVIEW_SCREEN);
            }}
          >
            <Text style={{fontWeight: '800', color: theme.textColor, fontSize: 15}}>{tr(language, 'home.yesterdaySummaryReadyTitle')}</Text>
            <Text style={{marginTop: 4, color: addOpacity(theme.textColor, 0.78)}}>{tr(language, 'home.yesterdaySummaryReadyBody')}</Text>
            <Text style={{marginTop: 8, color: theme.accentColor, fontWeight: '700'}}>{tr(language, 'home.viewYesterdaySummary')}</Text>
          </DailySummaryAlert>
        ) : !isShowingToday ? (
          <DailySummaryAlert onPress={() => (navigation as any).navigate(DAILY_REVIEW_SCREEN)}>
            <Text style={{fontWeight: '700', color: theme.textColor, fontSize: 14}}>{tr(language, 'home.openDailySummary')}</Text>
          </DailySummaryAlert>
        ) : null}

        {isShowingToday && todayRecommendation ? (
          <TodayRecommendationCard>
            <TodayRecommendationHeader onPress={() => setShowTodayRecommendation(prev => !prev)}>
              <Text style={{fontWeight: '800', color: theme.textColor, fontSize: 15}}>
                {tr(language, 'home.todayRecommendationTitle')}
              </Text>
              <Icon
                name={showTodayRecommendation ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={addOpacity(theme.textColor, 0.6)}
              />
            </TodayRecommendationHeader>
            {showTodayRecommendation ? (
              <TodayRecommendationBody>
                <Text style={{fontWeight: '700', color: theme.textColor}}>{todayRecommendation.title}</Text>
                <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.82)}}>{todayRecommendation.body}</Text>
                {todayRecommendation.details ? (
                  <Text style={{marginTop: 8, color: addOpacity(theme.textColor, 0.68), fontSize: 12}}>
                    {todayRecommendation.details}
                  </Text>
                ) : null}
              </TodayRecommendationBody>
            ) : null}
          </TodayRecommendationCard>
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

