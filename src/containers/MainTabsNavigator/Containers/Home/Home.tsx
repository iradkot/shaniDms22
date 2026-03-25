import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {RefreshControl, ScrollView, View, Text, Pressable} from 'react-native';
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
import {AI_ANALYST_TAB_SCREEN, DAILY_REVIEW_SCREEN, LOOP_ADJUSTMENT_ASSIST_SCREEN} from 'app/constants/SCREEN_NAMES';
import {getLatestDailyBrief} from 'app/services/proactiveCare/dailyBrief';
import {detectLoopAdjustmentTrend, LoopTrendSignal} from 'app/services/loopAssist/loopAdjustmentAssist';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {useAiSettings} from 'app/contexts/AiSettingsContext';
import {OpenAIProvider} from 'app/services/llm/providers/openaiProvider';
import {t as tr} from 'app/i18n/translations';
import {
  addMemoryEntry,
  buildCompactPatientMemory,
  markEpisodeKeyIfNew,
  upsertProfileSnapshot,
} from 'app/services/aiMemory/aiMemoryStore';

const HOME_RECOMMENDATION_STORAGE_KEY = 'home:todayRecommendation:v1';
const LOOP_ASSIST_STATUS_KEY = 'loopAssist:status:v1';

function normalizeRecommendationText(input: string): string {
  if (!input) return '';
  return input
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function summarizeBgWindow(samples: Array<{date: number; sgv: number}>, windowMinutes: number) {
  const now = Date.now();
  const fromMs = now - windowMinutes * 60 * 1000;
  const rows = (samples ?? []).filter(s => s?.date >= fromMs && Number.isFinite(s?.sgv));
  if (!rows.length) {
    return {count: 0, avg: null as number | null, min: null as number | null, max: null as number | null, delta: null as number | null};
  }

  const sorted = [...rows].sort((a, b) => a.date - b.date);
  const values = sorted.map(r => r.sgv);
  const avg = Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const delta = sorted[sorted.length - 1].sgv - sorted[0].sgv;

  return {count: sorted.length, avg, min, max, delta};
}

function summarizeMealResponse(
  meal: MealSegment,
  bgSamples: Array<{date: number; sgv: number}>,
) {
  const start = meal.startMs;
  const end = start + 4 * 60 * 60 * 1000;

  const pre = [...bgSamples]
    .filter(s => s.date <= start && s.date >= start - 45 * 60 * 1000)
    .sort((a, b) => b.date - a.date)[0];
  const postRows = bgSamples.filter(s => s.date >= start && s.date <= end);

  if (!pre || !postRows.length) {
    return {preMeal: pre?.sgv ?? null, peak: null as number | null, peakDelta: null as number | null};
  }

  const peak = Math.max(...postRows.map(s => s.sgv));
  return {
    preMeal: pre.sgv,
    peak,
    peakDelta: peak - pre.sgv,
  };
}

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
  const {settings: aiSettings} = useAiSettings();
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

  useEffect(() => {
    let mounted = true;

    const persistMealEpisodes = async () => {
      const recentMeals = taggedSegments.slice(-8);
      for (const meal of recentMeals) {
        if (!mounted) return;
        const key = `meal:${format(new Date(meal.startMs), 'yyyy-MM-dd')}:${meal.id}`;
        const isNew = await markEpisodeKeyIfNew(key);
        if (!isNew) continue;

        const response = summarizeMealResponse(meal, listBgData);
        await addMemoryEntry({
          type: 'episode',
          tags: ['meal', 'postprandial', ...(meal.tags ?? []).slice(0, 3)],
          textSummary:
            language === 'he'
              ? `ארוחה ${meal.label} (${Math.round(meal.totalCarbs || 0)}g) עם תגובה אחרי ארוחה: פיק ${response.peak ?? '—'} ודלתא ${response.peakDelta ?? '—'}.`
              : `Meal ${meal.label} (${Math.round(meal.totalCarbs || 0)}g) post-meal response: peak ${response.peak ?? '—'} and delta ${response.peakDelta ?? '—'}.`,
          facts: {
            mealId: meal.id,
            startedAt: meal.startMs,
            carbsG: Math.round(meal.totalCarbs || 0),
            bolusU: Number((meal.totalBolus || 0).toFixed(2)),
            response,
          },
          source: 'sensor',
          confidence: 0.75,
          expiresAt: Date.now() + 120 * 24 * 60 * 60 * 1000,
        });
      }
    };

    persistMealEpisodes();
    return () => {
      mounted = false;
    };
  }, [language, listBgData, taggedSegments]);

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
  const [isRefreshingRecommendation, setIsRefreshingRecommendation] = useState(false);
  const [aiRecommendationBody, setAiRecommendationBody] = useState<string | null>(null);
  const [recommendationGeneratedAt, setRecommendationGeneratedAt] = useState<number>(Date.now());
  const [hasLoadedSavedRecommendation, setHasLoadedSavedRecommendation] = useState(false);

  const recentBgContext = useMemo(() => {
    const short = summarizeBgWindow(listBgData, 90);
    const medium = summarizeBgWindow(listBgData, 240);
    return {last90m: short, last4h: medium};
  }, [listBgData]);

  const todayYmd = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(HOME_RECOMMENDATION_STORAGE_KEY);
        if (!mounted) return;
        if (!raw) {
          setHasLoadedSavedRecommendation(true);
          return;
        }
        const parsed = JSON.parse(raw) as {date?: string; text?: string; generatedAt?: number};
        if (parsed?.date === todayYmd && parsed?.text) {
          setAiRecommendationBody(normalizeRecommendationText(parsed.text));
          setRecommendationGeneratedAt(
            typeof parsed.generatedAt === 'number' ? parsed.generatedAt : Date.now(),
          );
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setHasLoadedSavedRecommendation(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [todayYmd]);

  const recommendationContextPrompt = useMemo(() => {
    if (!todayRecommendation) return '';
    const payload = {
      generatedAt: new Date(recommendationGeneratedAt).toISOString(),
      title: todayRecommendation.title,
      recommendation: aiRecommendationBody || todayRecommendation.body,
      details: todayRecommendation.details || null,
      currentBg: liveBgSample?.sgv ?? null,
      trend: liveBgSample?.direction ?? null,
      iobU: typeof liveBgSample?.iob === 'number' ? Number(liveBgSample.iob.toFixed(2)) : null,
      cobG: typeof liveBgSample?.cob === 'number' ? Math.round(liveBgSample.cob) : null,
      predictionsNext: (liveSnapshot?.predictions ?? []).map(p => p.sgv),
      recentBg: recentBgContext,
      recommendationKind: 'general',
      lastMeal: lastMealSegment
        ? {
            startedAt: new Date(lastMealSegment.startMs).toISOString(),
            carbsG: Math.round(lastMealSegment.totalCarbs || 0),
            bolusU: Number((lastMealSegment.totalBolus || 0).toFixed(2)),
            minutesSinceMeal: Math.round((Date.now() - lastMealSegment.startMs) / 60000),
          }
        : null,
    };

    return `${language === 'he' ? 'קונטקסט מהמלצה במסך הבית' : 'Context from Home recommendation'}:\n${JSON.stringify(payload)}`;
  }, [
    aiRecommendationBody,
    language,
    lastMealSegment,
    liveBgSample?.cob,
    liveBgSample?.direction,
    liveBgSample?.iob,
    liveBgSample?.sgv,
    liveSnapshot?.predictions,
    recentBgContext,
    recommendationGeneratedAt,
    todayRecommendation,
  ]);

  const mealRecommendationContextPrompt = useMemo(() => {
    const recentMeals = taggedSegments
      .slice(-6)
      .map(m => ({
        startedAt: new Date(m.startMs).toISOString(),
        label: m.label,
        carbsG: Math.round(m.totalCarbs || 0),
        bolusU: Number((m.totalBolus || 0).toFixed(2)),
        tags: m.tags,
        response: summarizeMealResponse(m, listBgData),
      }));

    const instruction =
      language === 'he'
        ? 'בבקשה קודם בקש מהמשתמש תמונה או תיאור מדויק של הארוחה הקרובה. אל תיתן המלצה עד שיש תמונה/תיאור. אחרי שהמשתמש שולח, החזר המלצה לארוחה הקרובה עם: הערכת פחמימות, זמן השפעה משוער (1-8 שעות, ויותר אם הדפוס מצביע על כך), השוואה לארוחות דומות אחרונות, ומה לעשות מול הלופ (מתי להמתין לתיקון אוטומטי ומתי לשקול פעולה). השתמש בכלי זיכרון (getPatientProfileSnapshot/searchMemory) אם צריך שליפה היסטורית רלוונטית. בלי מינוני אינסולין מדויקים.'
        : 'First ask the user for a meal photo or a clear meal description. Do not give meal guidance until they provide one. After they provide it, return a near-meal recommendation including: carb estimate, expected impact window (1-8h, and longer if pattern suggests), comparison to similar recent meals, and what to let Loop handle vs when to consider action. Use memory tools (getPatientProfileSnapshot/searchMemory) when relevant history is needed. No exact insulin dosing.';

    const payload = {
      currentState: {
        bg: liveBgSample?.sgv ?? null,
        trend: liveBgSample?.direction ?? null,
        iobU: typeof liveBgSample?.iob === 'number' ? Number(liveBgSample.iob.toFixed(2)) : null,
        cobG: typeof liveBgSample?.cob === 'number' ? Math.round(liveBgSample.cob) : null,
        predictionsNext: (liveSnapshot?.predictions ?? []).map(p => p.sgv),
      },
      recentBg: recentBgContext,
      recentMeals,
      mealRecommendationMode: true,
    };

    return `${instruction}\n\n${language === 'he' ? 'קונטקסט' : 'Context'}:\n${JSON.stringify(payload)}`;
  }, [
    language,
    listBgData,
    liveBgSample?.cob,
    liveBgSample?.direction,
    liveBgSample?.iob,
    liveBgSample?.sgv,
    liveSnapshot?.predictions,
    recentBgContext,
    taggedSegments,
  ]);

  const recommendationTimeLabel = useMemo(() => {
    return new Date(recommendationGeneratedAt).toLocaleTimeString(
      language === 'he' ? 'he-IL' : 'en-US',
      {hour: '2-digit', minute: '2-digit'},
    );
  }, [language, recommendationGeneratedAt]);

  const handleRefreshRecommendation = useCallback(async () => {
    if (!todayRecommendation || isRefreshingRecommendation) return;
    setIsRefreshingRecommendation(true);

    try {
      const apiKey = (aiSettings.apiKey ?? '').trim();
      if (!aiSettings.enabled || !apiKey) {
        return;
      }

      const latestBoluses = insulinData
        .filter(e => e.type === 'bolus' && e.amount && e.timestamp)
        .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime())
        .slice(0, 4)
        .map(e => ({
          time: new Date(e.timestamp!).toISOString(),
          units: Number(e.amount?.toFixed?.(2) ?? e.amount),
        }));

      const recentTempBasalUnits = insulinData
        .filter(e => e.type === 'tempBasal' && e.amount && e.timestamp)
        .filter(e => Date.now() - new Date(e.timestamp!).getTime() <= 2 * 60 * 60 * 1000)
        .reduce((sum, e) => sum + (e.amount ?? 0), 0);

      const patientMemory = await buildCompactPatientMemory();

      await upsertProfileSnapshot({
        communicationStyle: language === 'he' ? 'hebrew-concise-practical' : 'english-concise-practical',
        notes: ['prefers concise practical recommendations', 'prefers context-aware guidance over generic bolus focus'],
      });

      const provider = new OpenAIProvider({apiKey});
      const model = (aiSettings.openAiModel ?? 'gpt-5.4').trim() || 'gpt-5.4';

      const response = await provider.sendChat({
        model,
        temperature: 0.5,
        maxOutputTokens: 220,
        messages: [
          {
            role: 'system',
            content:
              language === 'he'
                ? 'אתה מאמן סוכרת פרקטי וזהיר. תן המלצה כללית לרגע זה (2-4 משפטים): משפט 1 מה המצב עכשיו, משפט 2 מה השתנה לאחרונה (90 דקות/4 שעות), משפט 3 מה לעשות בשעה הקרובה. אל תתמקד בבולוס אלא אם הנתונים מצביעים שזה קריטי. אל תתן מינוני אינסולין מדויקים. אם המצב יציב, אמור להמשיך כרגיל עם מעקב. כתוב טקסט רגיל בלבד, בלי Markdown.'
                : 'You are a practical, cautious diabetes coach. Give a general recommendation for right now (2-4 sentences): sentence 1 current state, sentence 2 what changed recently (last 90m/4h), sentence 3 what to do in the next hour. Do not focus on bolus unless data suggests it is truly important. Do not provide exact insulin dosing. If stable, explicitly say continue as-is with monitoring. Return plain text only, no Markdown.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              now: new Date().toISOString(),
              currentBg: liveBgSample?.sgv ?? null,
              trend: liveBgSample?.direction ?? null,
              iobU: typeof liveBgSample?.iob === 'number' ? Number(liveBgSample.iob.toFixed(2)) : null,
              cobG: typeof liveBgSample?.cob === 'number' ? Math.round(liveBgSample.cob) : null,
              predictionsNext: (liveSnapshot?.predictions ?? []).map(p => p.sgv),
              recentBg: recentBgContext,
              recommendationKind: 'general',
              patientMemory,
              meal: lastMealSegment
                ? {
                    startedAt: new Date(lastMealSegment.startMs).toISOString(),
                    carbsG: Math.round(lastMealSegment.totalCarbs || 0),
                    bolusU: Number((lastMealSegment.totalBolus || 0).toFixed(2)),
                    minutesSinceMeal: Math.round((Date.now() - lastMealSegment.startMs) / 60000),
                  }
                : null,
              recentBoluses: latestBoluses,
              tempBasalLast2hU: Number(recentTempBasalUnits.toFixed(2)),
              heuristic: todayRecommendation,
            }),
          },
        ],
      });

      const rawText = (response.content ?? '').trim();
      const text = normalizeRecommendationText(rawText);
      const nowMs = Date.now();
      setAiRecommendationBody(text || null);
      setRecommendationGeneratedAt(nowMs);
      if (text) {
        await AsyncStorage.setItem(
          HOME_RECOMMENDATION_STORAGE_KEY,
          JSON.stringify({date: todayYmd, text, generatedAt: nowMs}),
        );

        await addMemoryEntry({
          type: 'chat_summary',
          tags: ['home_recommendation', 'general_guidance', isShowingToday ? 'today' : 'history'],
          textSummary: text,
          facts: {
            currentBg: liveBgSample?.sgv ?? null,
            trend: liveBgSample?.direction ?? null,
            iob: liveBgSample?.iob ?? null,
            cob: liveBgSample?.cob ?? null,
            recommendationKind: 'general',
          },
          source: 'ai',
          confidence: 0.7,
          expiresAt: Date.now() + 45 * 24 * 60 * 60 * 1000,
        });
      }
    } catch {
      // keep last successful recommendation
    } finally {
      setIsRefreshingRecommendation(false);
    }
  }, [
    aiSettings.apiKey,
    aiSettings.enabled,
    aiSettings.openAiModel,
    insulinData,
    isRefreshingRecommendation,
    isShowingToday,
    language,
    lastMealSegment,
    liveBgSample?.cob,
    liveBgSample?.direction,
    liveBgSample?.iob,
    liveBgSample?.sgv,
    liveSnapshot?.predictions,
    recentBgContext,
    todayRecommendation,
    todayYmd,
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
  const [loopTrendSignal, setLoopTrendSignal] = useState<LoopTrendSignal | null>(null);
  const [loopAssistStatus, setLoopAssistStatus] = useState<{status: 'running' | 'ready' | 'failed'; startedAt?: string; readyAt?: string; failedAt?: string; errorMessage?: string} | null>(null);

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

  useEffect(() => {
    let mounted = true;

    const loadLoopAssistStatus = async () => {
      try {
        const raw = await AsyncStorage.getItem(LOOP_ASSIST_STATUS_KEY);
        if (!mounted) return;
        if (!raw) {
          setLoopAssistStatus(null);
          return;
        }
        const parsed = JSON.parse(raw);
        if (parsed?.status === 'running' || parsed?.status === 'ready' || parsed?.status === 'failed') {
          setLoopAssistStatus(parsed);
        } else {
          setLoopAssistStatus(null);
        }
      } catch {
        if (mounted) setLoopAssistStatus(null);
      }
    };

    loadLoopAssistStatus();
    const interval = setInterval(loadLoopAssistStatus, 8000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isShowingToday]);

  useEffect(() => {
    let mounted = true;

    const runTrendDetect = async () => {
      try {
        const signal = await detectLoopAdjustmentTrend({daysWindow: 5});
        if (!mounted) return;
        setLoopTrendSignal(signal);
      } catch {
        if (mounted) setLoopTrendSignal(null);
      }
    };

    if (isShowingToday) {
      runTrendDetect();
    }

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

        {isShowingToday && loopTrendSignal?.detected ? (
          <DailySummaryAlert
            onPress={() =>
              (navigation as any).navigate(LOOP_ADJUSTMENT_ASSIST_SCREEN, {
                trend: loopTrendSignal,
                status: loopAssistStatus,
                source: 'home-nudge',
              })
            }
          >
            <Text style={{fontWeight: '800', color: theme.textColor, fontSize: 15}}>
              {language === 'he' ? 'זיהינו מגמה עקבית שכדאי לחקור יחד' : 'We detected a stable pattern worth exploring together'}
            </Text>
            <Text style={{marginTop: 4, color: addOpacity(theme.textColor, 0.78)}}>
              {language === 'he' ? loopTrendSignal.summaryHe : loopTrendSignal.summaryEn}
            </Text>
            <Text style={{marginTop: 8, color: theme.accentColor, fontWeight: '700'}}>
              {language === 'he' ? 'פתח סייע התאמת לופ' : 'Open Loop Tuning Assist'}
            </Text>
          </DailySummaryAlert>
        ) : null}

        {isShowingToday && loopAssistStatus ? (
          <DailySummaryAlert
            onPress={() =>
              (navigation as any).navigate(LOOP_ADJUSTMENT_ASSIST_SCREEN, {
                trend: loopTrendSignal,
                status: loopAssistStatus,
                source: 'home-status-center',
              })
            }
          >
            <Text style={{fontWeight: '800', color: theme.textColor, fontSize: 15}}>
              {language === 'he' ? 'מרכז סטטוס התאמת לופ' : 'Loop Tuning Status Center'}
            </Text>
            <Text style={{marginTop: 4, color: addOpacity(theme.textColor, 0.78)}}>
              {loopAssistStatus.status === 'running'
                ? (language === 'he' ? 'בהכנה: החישוב רץ ברקע. נעדכן כשההמלצה מוכנה.' : 'In progress: analysis is running in background. We will notify when ready.')
                : loopAssistStatus.status === 'ready'
                ? (language === 'he' ? 'מוכן: יש המלצה שמורה במכשיר, אפשר לפתוח עכשיו.' : 'Ready: a recommendation is saved on device and ready to view.')
                : (language === 'he' ? 'נכשל: החישוב האחרון נכשל. אפשר לפתוח ולייצא לוג שגיאה.' : 'Failed: the last run failed. Open to export full error log.')}
            </Text>
            <Text style={{marginTop: 8, color: theme.accentColor, fontWeight: '700'}}>
              {language === 'he' ? 'פתח מרכז סטטוס לופ' : 'Open Loop Status Center'}
            </Text>
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

                {aiRecommendationBody ? (
                  <>
                    <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.82)}}>
                      {aiRecommendationBody}
                    </Text>
                    {todayRecommendation.details ? (
                      <Text style={{marginTop: 8, color: addOpacity(theme.textColor, 0.68), fontSize: 12}}>
                        {todayRecommendation.details}
                      </Text>
                    ) : null}
                    <View style={{marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                      <Text style={{fontSize: 12, color: addOpacity(theme.textColor, 0.62)}}>
                        {tr(language, 'home.recommendationUpdatedAt', {time: recommendationTimeLabel})}
                      </Text>
                      <Pressable onPress={handleRefreshRecommendation} disabled={isRefreshingRecommendation}>
                        <Text style={{fontSize: 12, fontWeight: '700', color: theme.accentColor}}>
                          {isRefreshingRecommendation
                            ? tr(language, 'home.recommendationRefreshing')
                            : tr(language, 'home.recommendationRefresh')}
                        </Text>
                      </Pressable>
                    </View>
                    <Pressable
                      style={{marginTop: 10}}
                      onPress={() =>
                        (navigation as any).navigate(AI_ANALYST_TAB_SCREEN, {
                          homeRecommendationContext: recommendationContextPrompt,
                        })
                      }>
                      <Text style={{fontSize: 13, fontWeight: '700', color: theme.accentColor}}>
                        {tr(language, 'home.recommendationStartChat')}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={{marginTop: 8}}
                      onPress={() =>
                        (navigation as any).navigate(AI_ANALYST_TAB_SCREEN, {
                          homeRecommendationContext: mealRecommendationContextPrompt,
                        })
                      }>
                      <Text style={{fontSize: 13, fontWeight: '700', color: theme.accentColor}}>
                        {language === 'he' ? 'המלצה לארוחה' : 'Meal recommendation'}
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.72)}}>
                      {hasLoadedSavedRecommendation
                        ? tr(language, 'home.recommendationNotRequestedYet')
                        : tr(language, 'home.recommendationLoading')}
                    </Text>
                    <Pressable
                      style={{marginTop: 10}}
                      onPress={handleRefreshRecommendation}
                      disabled={isRefreshingRecommendation || !hasLoadedSavedRecommendation}>
                      <Text style={{fontSize: 13, fontWeight: '700', color: theme.accentColor}}>
                        {isRefreshingRecommendation
                          ? tr(language, 'home.recommendationRefreshing')
                          : tr(language, 'home.recommendationRequest')}
                      </Text>
                    </Pressable>
                  </>
                )}
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

