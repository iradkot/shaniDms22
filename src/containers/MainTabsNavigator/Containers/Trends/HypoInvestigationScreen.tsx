import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, View} from 'react-native';
import styled, {useTheme} from 'styled-components/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {ThemeType} from 'app/types/theme';
import {BgSample} from 'app/types/day_bgs.types';
import {addOpacity} from 'app/style/styling.utils';
import {formatDateToDateAndTimeString, formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import {useNavigation, useRoute} from '@react-navigation/native';
import {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import {FoodItemDTO} from 'app/types/food.types';
import {
  buildFullScreenStackedChartsParams,
  enrichBgSamplesWithDeviceStatusForRange,
  fetchStackedChartsDataForRange,
} from 'app/utils/stackedChartsData.utils';
import {pushFullScreenStackedCharts} from 'app/utils/fullscreenNavigation.utils';
import {fetchTreatmentsForDateRangeUncached} from 'app/api/apiRequests';
import {
  mapNightscoutTreatmentsToCarbFoodItems,
  mapNightscoutTreatmentsToInsulinDataEntries,
} from 'app/utils/nightscoutTreatments.utils';

import {
  extractHypoEvents,
  HYPO_INVESTIGATION_CONSTANTS,
  HypoEvent,
} from 'app/containers/MainTabsNavigator/Containers/Trends/utils/hypoInvestigation.utils';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';

type RouteParams = {
  bgData?: BgSample[];
  startMs: number;
  endMs: number;
  lowThreshold: number;
};

function safeFiniteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function deriveIobCobFromSample(sample: BgSample | null): {
  totalIobU: number | null;
  bolusIobU: number | null;
  basalIobU: number | null;
  cobG: number | null;
  hasSplitIob: boolean;
} {
  if (!sample) {
    return {
      totalIobU: null,
      bolusIobU: null,
      basalIobU: null,
      cobG: null,
      hasSplitIob: false,
    };
  }

  const totalIobU = safeFiniteNumber((sample as any).iob);
  const bolusIobU = safeFiniteNumber((sample as any).iobBolus);
  const basalIobU = safeFiniteNumber((sample as any).iobBasal);
  const cobG = safeFiniteNumber((sample as any).cob);

  const hasSplitIob = bolusIobU != null || basalIobU != null;

  if (totalIobU != null) {
    return {totalIobU, bolusIobU, basalIobU, cobG, hasSplitIob};
  }

  if (hasSplitIob) {
    return {
      totalIobU: (bolusIobU ?? 0) + (basalIobU ?? 0),
      bolusIobU,
      basalIobU,
      cobG,
      hasSplitIob,
    };
  }

  return {totalIobU: null, bolusIobU: null, basalIobU: null, cobG, hasSplitIob: false};
}

function safeDateParseMs(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

function summarizeBolusesInRange(params: {
  boluses: InsulinDataEntry[];
  startMs: number;
  endMs: number;
}): {count: number; totalU: number} {
  const {boluses, startMs, endMs} = params;
  let count = 0;
  let totalU = 0;

  for (const e of boluses ?? []) {
    if (e?.type !== 'bolus') continue;
    const ts = safeDateParseMs((e as any).timestamp);
    if (ts == null || ts < startMs || ts > endMs) continue;
    const amount = safeFiniteNumber((e as any).amount);
    if (amount == null || amount <= 0) continue;
    count += 1;
    totalU += amount;
  }

  return {count, totalU};
}

function summarizeCarbsInRange(params: {
  foodItems: FoodItemDTO[];
  startMs: number;
  endMs: number;
}): {count: number; totalG: number} {
  const {foodItems, startMs, endMs} = params;
  let count = 0;
  let totalG = 0;

  for (const f of foodItems ?? []) {
    const ts = safeFiniteNumber((f as any).timestamp);
    if (ts == null || ts < startMs || ts > endMs) continue;
    const carbs = safeFiniteNumber((f as any).carbs);
    if (carbs == null || carbs <= 0) continue;
    count += 1;
    totalG += carbs;
  }

  return {count, totalG};
}

function formatBolusSummary(summary: {count: number; totalU: number}): string {
  if (!summary.count) return '—';
  const u = summary.totalU;
  const value = u >= 10 ? u.toFixed(1) : u.toFixed(2);
  return `${value} U (${summary.count})`;
}

function formatCarbsSummary(summary: {count: number; totalG: number}): string {
  if (!summary.count) return '—';
  return `${Math.round(summary.totalG)} g (${summary.count})`;
}

const HypoInvestigationScreen: React.FC = () => {
  const theme = useTheme() as ThemeType;
  const navigation = useNavigation();
  const route = useRoute();

  const params = (route as any)?.params as RouteParams | undefined;

  const rangeStartMs = typeof params?.startMs === 'number' ? params.startMs : null;
  const rangeEndMs = typeof params?.endMs === 'number' ? params.endMs : null;
  const lowThreshold =
    typeof params?.lowThreshold === 'number' && Number.isFinite(params.lowThreshold)
      ? params.lowThreshold
      : 70;

  const [rawBgData, setRawBgData] = useState<BgSample[] | null>(params?.bgData ?? null);
  const [enrichedBgData, setEnrichedBgData] = useState<BgSample[]>(params?.bgData ?? []);
  const [isFetchingBg, setIsFetchingBg] = useState<boolean>(params?.bgData == null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [basalProfileData, setBasalProfileData] = useState<BasalProfile>([]);
  const [openingEventId, setOpeningEventId] = useState<string | null>(null);
  const [rangeInsulinData, setRangeInsulinData] = useState<InsulinDataEntry[]>([]);
  const [rangeFoodItems, setRangeFoodItems] = useState<FoodItemDTO[]>([]);
  const [isFetchingTreatments, setIsFetchingTreatments] = useState(false);

  const isStillFetchingBg = isFetchingBg && enrichedBgData.length === 0;

  const withTimeout = useCallback(<T,>(promise: Promise<T>, ms: number): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const id = setTimeout(() => reject(new Error('Timeout')), ms);
      promise
        .then(v => {
          clearTimeout(id);
          resolve(v);
        })
        .catch(e => {
          clearTimeout(id);
          reject(e);
        });
    });
  }, []);

  const hasAnyIob = useCallback((samples: BgSample[]) => {
    return (samples ?? []).some(
      s =>
        typeof s?.iob === 'number' ||
        typeof s?.iobBasal === 'number' ||
        typeof s?.iobBolus === 'number',
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function ensureBgDataLoaded() {
      if (rawBgData != null) return;
      if (rangeStartMs == null || rangeEndMs == null) {
        setRawBgData([]);
        setEnrichedBgData([]);
        return;
      }

      setIsFetchingBg(true);
      try {
        const data = await withTimeout(
          fetchStackedChartsDataForRange({
          startMs: rangeStartMs,
          endMs: rangeEndMs,
          existingBgSamples: [],
          includeDeviceStatus: true,
          includeTreatments: false,
          includeProfile: false,
          }),
          20_000,
        );
        if (cancelled) return;
        setRawBgData(data.bgSamples);
        setEnrichedBgData(data.bgSamples);
      } catch (e) {
        if (cancelled) return;
        setRawBgData([]);
        setEnrichedBgData([]);
      } finally {
        if (!cancelled) setIsFetchingBg(false);
      }
    }

    ensureBgDataLoaded();
    return () => {
      cancelled = true;
    };
  }, [rangeEndMs, rangeStartMs, rawBgData, withTimeout]);

  useEffect(() => {
    if (rawBgData != null && enrichedBgData.length >= 0) {
      setIsFetchingBg(false);
    }
  }, [enrichedBgData.length, rawBgData]);

  useEffect(() => {
    let cancelled = false;

    async function enrichWithDeviceStatus() {
      const base = rawBgData ?? [];
      if (!base?.length) {
        setEnrichedBgData([]);
        return;
      }

      if (rangeStartMs == null || rangeEndMs == null) {
        // Fallback: show raw data if no explicit range.
        setEnrichedBgData(base);
        return;
      }

      // If we already have IOB split data, skip enrichment.
      if (hasAnyIob(base)) {
        setEnrichedBgData(base);
        return;
      }

      setIsEnriching(true);
      try {
        const next = await enrichBgSamplesWithDeviceStatusForRange({
          startMs: rangeStartMs,
          endMs: rangeEndMs,
          bgSamples: base,
        });
        if (cancelled) return;
        setEnrichedBgData(next);
      } catch (e) {
        if (cancelled) return;
        setEnrichedBgData(base);
      } finally {
        if (!cancelled) setIsEnriching(false);
      }
    }

    enrichWithDeviceStatus();
    return () => {
      cancelled = true;
    };
  }, [hasAnyIob, rangeEndMs, rangeStartMs, rawBgData]);

  useEffect(() => {
    let cancelled = false;

    async function fetchTreatments() {
      if (rangeStartMs == null || rangeEndMs == null) return;

      setIsFetchingTreatments(true);
      try {
        const treatments = await fetchTreatmentsForDateRangeUncached(
          new Date(rangeStartMs),
          new Date(rangeEndMs),
        );
        if (cancelled) return;
        setRangeInsulinData(mapNightscoutTreatmentsToInsulinDataEntries(treatments));
        setRangeFoodItems(mapNightscoutTreatmentsToCarbFoodItems(treatments));
      } catch (e) {
        if (cancelled) return;
        setRangeInsulinData([]);
        setRangeFoodItems([]);
      } finally {
        if (!cancelled) setIsFetchingTreatments(false);
      }
    }

    fetchTreatments();
    return () => {
      cancelled = true;
    };
  }, [rangeEndMs, rangeStartMs]);

  useEffect(() => {
    let cancelled = false;

    async function fetchBasalProfile() {
      if (rangeStartMs == null || rangeEndMs == null) return;
      try {
        const data = await fetchStackedChartsDataForRange({
          startMs: rangeStartMs,
          endMs: rangeEndMs,
          existingBgSamples: [],
          includeDeviceStatus: false,
          includeTreatments: false,
          includeProfile: true,
        });
        if (cancelled) return;
        setBasalProfileData(data.basalProfileData);
      } catch (e) {
        if (!cancelled) setBasalProfileData([]);
      }
    }

    fetchBasalProfile();
    return () => {
      cancelled = true;
    };
  }, [rangeEndMs, rangeStartMs]);

  const hypoEvents = useMemo(() => {
    return extractHypoEvents({bgData: enrichedBgData, lowThreshold});
  }, [enrichedBgData, lowThreshold]);

  const summary = useMemo(() => {
    const classified = hypoEvents.filter(e => e.driver != null);
    const total = classified.length;
    const basal = classified.filter(e => e.driver === 'basal').length;
    const bolus = classified.filter(e => e.driver === 'bolus').length;

    const pct = (n: number) => (total > 0 ? (n / total) * 100 : null);

    return {
      totalEvents: hypoEvents.length,
      classifiedEvents: total,
      basalCount: basal,
      bolusCount: bolus,
      basalPct: pct(basal),
      bolusPct: pct(bolus),
    };
  }, [hypoEvents]);

  const avgDurationLabel = useMemo(() => {
    if (!hypoEvents.length) return null;
    const minutes = hypoEvents
      .map(e => Math.max(0, e.endMs - e.startMs))
      .map(ms => ms / 60_000);
    const avg = minutes.reduce((a, b) => a + b, 0) / Math.max(1, minutes.length);
    const rounded = Math.max(1, Math.round(avg));
    if (rounded < 60) return `${rounded}m`;
    const h = Math.floor(rounded / 60);
    const m = rounded % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }, [hypoEvents]);

  const openHypoWindow = useCallback(async (event: HypoEvent) => {
    if (openingEventId != null) return;

    const anchorMs = event.nadirMs;
    const startMs = anchorMs - HYPO_INVESTIGATION_CONSTANTS.windowHoursBefore * 60 * 60 * 1000;
    const endMs = anchorMs + HYPO_INVESTIGATION_CONSTANTS.windowHoursAfter * 60 * 60 * 1000;

    setOpeningEventId(event.id);

    const windowRawSamples = (enrichedBgData ?? []).filter(
      s => typeof s?.date === 'number' && s.date >= startMs && s.date <= endMs,
    );

    const data = await fetchStackedChartsDataForRange({
      startMs,
      endMs,
      existingBgSamples: windowRawSamples,
      includeDeviceStatus: true,
      includeTreatments: true,
      includeProfile: false,
    });

    setOpeningEventId(null);

    const payload = buildFullScreenStackedChartsParams({
      title: 'Hypo window',
      bgSamples: data.bgSamples,
      foodItems: data.foodItems,
      insulinData: data.insulinData,
      basalProfileData,
      xDomainMs: {startMs, endMs},
      fallbackAnchorTimeMs: anchorMs,
    });

    pushFullScreenStackedCharts({navigation, payload});
  }, [basalProfileData, enrichedBgData, navigation, openingEventId]);

  const formatDuration = (startMs: number, endMs: number) => {
    const ms = Math.max(0, endMs - startMs);
    const minutes = Math.max(1, Math.round(ms / 60_000));
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  };

  const renderItem = ({item}: {item: HypoEvent}) => {
    const isOpening = openingEventId === item.id;
    const title = formatDateToDateAndTimeString(item.nadirMs);
    const durationLabel = formatDuration(item.startMs, item.endMs);
    const timeRangeLabel = `${formatDateToLocaleTimeString(item.startMs)}–${formatDateToLocaleTimeString(
      item.endMs,
    )}`;
    const nadirLabel =
      typeof item.nadirSgv === 'number' && Number.isFinite(item.nadirSgv)
        ? `${Math.round(item.nadirSgv)}`
        : '—';

    const derived = deriveIobCobFromSample(item.nadirSample);
    const iobAtNadirLabel = derived.totalIobU != null ? `${derived.totalIobU.toFixed(1)} U` : '—';
    const cobAtNadirLabel = derived.cobG != null ? `${Math.round(derived.cobG)} g` : '—';

    const WINDOW_1H_MS = 60 * 60 * 1000;
    const WINDOW_2H_MS = 2 * 60 * 60 * 1000;
    const WINDOW_3H_MS = 3 * 60 * 60 * 1000;

    const bolusBefore = summarizeBolusesInRange({
      boluses: rangeInsulinData,
      startMs: item.startMs - WINDOW_1H_MS,
      endMs: item.startMs,
    });
    const carbsBefore = summarizeCarbsInRange({
      foodItems: rangeFoodItems,
      startMs: item.startMs - WINDOW_2H_MS,
      endMs: item.startMs,
    });
    const carbsDuring = summarizeCarbsInRange({
      foodItems: rangeFoodItems,
      startMs: item.startMs,
      endMs: item.endMs,
    });
    const bolusAfter = summarizeBolusesInRange({
      boluses: rangeInsulinData,
      startMs: item.endMs,
      endMs: item.endMs + WINDOW_3H_MS,
    });
    const HIGH_TOTAL_IOB_U = 2.0;
    const HIGH_BOLUS_IOB_U = 1.2;
    const HIGH_BASAL_IOB_U = 1.2;

    const badges: Array<{label: string; tone: 'danger' | 'info' | 'neutral'}> = [];
    if (derived.totalIobU != null && derived.totalIobU >= HIGH_TOTAL_IOB_U) {
      badges.push({label: 'High IOB', tone: 'danger'});
    }
    if (derived.bolusIobU != null && derived.bolusIobU >= HIGH_BOLUS_IOB_U) {
      badges.push({label: 'High bolus IOB', tone: 'info'});
    }
    if (derived.basalIobU != null && derived.basalIobU >= HIGH_BASAL_IOB_U) {
      badges.push({label: 'High basal IOB', tone: 'info'});
    }
    if (item.driver) {
      badges.push({
        label: item.driver === 'basal' ? 'Basal-driven' : 'Bolus-driven',
        tone: 'neutral',
      });
    }

    return (
      <EventCard
        disabled={openingEventId != null}
        onPress={() => openHypoWindow(item)}
        style={({pressed}: {pressed: boolean}) => ({
          opacity: openingEventId != null ? 0.65 : pressed ? 0.9 : 1,
          transform: [{scale: pressed ? 0.995 : 1}],
        })}
      >
        <EventTopRow>
          <EventTitle numberOfLines={1}>{title}</EventTitle>
          <BgPill>
            <BgPillValue>{nadirLabel}</BgPillValue>
            <BgPillUnit>mg/dL</BgPillUnit>
          </BgPill>
        </EventTopRow>

        <EventStatsRow>
          <StatBlock>
            <StatLabel>Duration</StatLabel>
            <StatValue>{durationLabel}</StatValue>
            <StatSub numberOfLines={1}>{timeRangeLabel}</StatSub>
          </StatBlock>

          <StatBlock $align="right">
            <StatLabel>At nadir</StatLabel>
            <StatValue>{`IOB ${iobAtNadirLabel}`}</StatValue>
            <StatSub numberOfLines={1}>{`COB ${cobAtNadirLabel}`}</StatSub>
          </StatBlock>
        </EventStatsRow>

        <TreatmentsGrid>
          <TreatmentCell>
            <TreatmentLabelRow>
              <Icon name="needle" size={14} color={theme.colors.insulinSecondary} />
              <TreatmentLabel>Bolus</TreatmentLabel>
              <TreatmentWindow>−1h</TreatmentWindow>
            </TreatmentLabelRow>
            <TreatmentValue>{isFetchingTreatments ? '…' : formatBolusSummary(bolusBefore)}</TreatmentValue>
          </TreatmentCell>

          <TreatmentCell>
            <TreatmentLabelRow>
              <Icon name="bread-slice-outline" size={14} color={theme.colors.carbs} />
              <TreatmentLabel>Carbs</TreatmentLabel>
              <TreatmentWindow>−2h</TreatmentWindow>
            </TreatmentLabelRow>
            <TreatmentValue>{isFetchingTreatments ? '…' : formatCarbsSummary(carbsBefore)}</TreatmentValue>
          </TreatmentCell>

          <TreatmentCell>
            <TreatmentLabelRow>
              <Icon name="food-apple" size={14} color={theme.colors.carbs} />
              <TreatmentLabel>Carbs</TreatmentLabel>
              <TreatmentWindow>during</TreatmentWindow>
            </TreatmentLabelRow>
            <TreatmentValue>{isFetchingTreatments ? '…' : formatCarbsSummary(carbsDuring)}</TreatmentValue>
          </TreatmentCell>

          <TreatmentCell>
            <TreatmentLabelRow>
              <Icon name="needle" size={14} color={theme.colors.insulinSecondary} />
              <TreatmentLabel>Bolus</TreatmentLabel>
              <TreatmentWindow>+3h</TreatmentWindow>
            </TreatmentLabelRow>
            <TreatmentValue>{isFetchingTreatments ? '…' : formatBolusSummary(bolusAfter)}</TreatmentValue>
          </TreatmentCell>
        </TreatmentsGrid>

        <BadgesRow>
          {badges.slice(0, 3).map(b => (
            <Badge key={b.label} $tone={b.tone}>
              <BadgeText $tone={b.tone}>{b.label}</BadgeText>
            </Badge>
          ))}

          <View style={{flex: 1}} />
          {isOpening ? (
            <ActivityIndicator size="small" color={theme.accentColor} />
          ) : (
            <Chevron style={{color: addOpacity(theme.textColor, 0.55)}}>{'›'}</Chevron>
          )}
        </BadgesRow>
      </EventCard>
    );
  };

  const keyExtractor = (item: HypoEvent) => item.id;

  return (
    <Screen testID={E2E_TEST_IDS.hypoInvestigation.screen}>
      <Header>
        <SubTitle>Severe hypos: events &lt; {lowThreshold} mg/dL</SubTitle>
        {avgDurationLabel ? <SubTitle>Avg duration: {avgDurationLabel}</SubTitle> : null}
        {isStillFetchingBg ? (
          <LoadingRow>
            <ActivityIndicator size="small" color={theme.accentColor} />
            <LoadingText>Loading hypos…</LoadingText>
          </LoadingRow>
        ) : null}
        {!isFetchingBg && isEnriching ? <SubTitle>Loading active insulin / device status…</SubTitle> : null}
      </Header>

      {summary.classifiedEvents > 0 ? (
        <CardsRow>
          <Card>
            <CardTitle>Basal-driven</CardTitle>
            <CardValue>{summary.basalCount}</CardValue>
            <CardSubtle>
              {summary.basalPct != null ? `${Math.round(summary.basalPct)}% of classified` : '—'}
            </CardSubtle>
          </Card>

          <Card>
            <CardTitle>Bolus-driven</CardTitle>
            <CardValue>{summary.bolusCount}</CardValue>
            <CardSubtle>
              {summary.bolusPct != null ? `${Math.round(summary.bolusPct)}% of classified` : '—'}
            </CardSubtle>
          </Card>
        </CardsRow>
      ) : null}

      <ListHeader>
        <ListHeaderText>
          Hypos ({summary.totalEvents})
        </ListHeaderText>
        <ListHeaderHint>
          Tap a hypo to open a chart window: 3 hours before and 3 hours after the lowest reading.
        </ListHeaderHint>
      </ListHeader>

      <FlatList
        data={isStillFetchingBg ? [] : hypoEvents}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{height: 10}} />}
        ListEmptyComponent={
          <EmptyWrap>
            {isStillFetchingBg ? (
              <EmptyText>Loading hypos…</EmptyText>
            ) : (
              <EmptyText>No severe hypos in this range.</EmptyText>
            )}
          </EmptyWrap>
        }
        contentContainerStyle={hypoEvents.length ? {paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg} : {flexGrow: 1}}
      />
    </Screen>
  );
};

const Screen = styled.View.attrs({collapsable: false})`
  flex: 1;
  background-color: ${({theme}: {theme: ThemeType}) => theme.backgroundColor};
`;

const Header = styled.View`
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
  padding-bottom: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
`;

const SubTitle = styled.Text`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
  font-weight: 600;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.7)};
`;

const LoadingRow = styled.View`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
  flex-direction: row;
  align-items: center;
`;

const LoadingText = styled.Text`
  margin-left: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
  font-weight: 700;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.7)};
`;

const CardsRow = styled.View`
  flex-direction: row;
  padding-left: ${({theme}: {theme: ThemeType}) => theme.spacing.lg}px;
  padding-right: ${({theme}: {theme: ThemeType}) => theme.spacing.lg}px;
  padding-bottom: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
`;

const Card = styled.View`
  flex: 1;
  background-color: ${({theme}: {theme: ThemeType}) => theme.white};
  border-radius: ${({theme}: {theme: ThemeType}) => theme.borderRadius + 4}px;
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.12)};
`;

const CardTitle = styled.Text`
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.xs}px;
  font-weight: 800;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.7)};
`;

const CardValue = styled.Text`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.xl}px;
  font-weight: 900;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

const CardSubtle = styled.Text`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.xs}px;
  font-weight: 700;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.6)};
`;

const ListHeader = styled.View`
  padding-left: ${({theme}: {theme: ThemeType}) => theme.spacing.lg}px;
  padding-right: ${({theme}: {theme: ThemeType}) => theme.spacing.lg}px;
  padding-bottom: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
`;

const ListHeaderText = styled.Text`
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
  font-weight: 900;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

const ListHeaderHint = styled.Text`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.xs / 2}px;
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.xs}px;
  font-weight: 600;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.65)};
`;

const EventCard = styled(Pressable)`
  background-color: ${({theme}: {theme: ThemeType}) => theme.white};
  border-radius: ${({theme}: {theme: ThemeType}) => theme.borderRadius + 6}px;
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.sm + 2}px;
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.08)};
`;

const EventTopRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const EventTitle = styled.Text`
  flex: 1;
  margin-right: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
  font-weight: 900;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

const BgPill = styled.View`
  padding: 6px 10px;
  border-radius: 999px;
  background-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.severeBelowRange, 0.12)};
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.severeBelowRange, 0.25)};
  flex-direction: row;
  align-items: baseline;
`;

const BgPillValue = styled.Text`
  font-size: 16px;
  font-weight: 900;
  color: ${({theme}: {theme: ThemeType}) => theme.severeBelowRange};
`;

const BgPillUnit = styled.Text`
  margin-left: 4px;
  font-size: 10px;
  font-weight: 800;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.severeBelowRange, 0.8)};
`;

const EventStatsRow = styled.View`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
  flex-direction: row;
  align-items: flex-end;
  justify-content: space-between;
`;

const StatBlock = styled.View<{$align?: 'left' | 'right'}>`
  flex: 1;
  align-items: ${({$align}: {$align?: 'left' | 'right'}) =>
    $align === 'right' ? 'flex-end' : 'flex-start'};
`;

const StatLabel = styled.Text`
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.xs}px;
  font-weight: 800;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.6)};
`;

const StatValue = styled.Text`
  margin-top: 2px;
  font-size: 18px;
  font-weight: 900;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

const StatSub = styled.Text`
  margin-top: 2px;
  font-size: 12px;
  font-weight: 700;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.62)};
`;

const TreatmentsGrid = styled.View`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
`;

const TreatmentCell = styled.View`
  width: 48.5%;
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  border-radius: ${({theme}: {theme: ThemeType}) => theme.borderRadius + 4}px;
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.1)};
  background-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.03)};
`;

const TreatmentLabelRow = styled.View`
  flex-direction: row;
  align-items: center;
`;

const TreatmentLabel = styled.Text`
  margin-left: 6px;
  font-size: 12px;
  font-weight: 900;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.8)};
`;

const TreatmentWindow = styled.Text`
  margin-left: 6px;
  font-size: 11px;
  font-weight: 800;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.6)};
`;

const TreatmentValue = styled.Text`
  margin-top: 4px;
  font-size: 14px;
  font-weight: 900;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

const BadgesRow = styled.View`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  flex-direction: row;
  align-items: center;
`;

const Badge = styled.View<{$tone: 'danger' | 'info' | 'neutral'}>`
  margin-right: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
  padding: 4px 8px;
  border-radius: 999px;
  background-color: ${({theme, $tone}: {theme: ThemeType; $tone: 'danger' | 'info' | 'neutral'}) => {
    if ($tone === 'danger') return addOpacity(theme.severeBelowRange, 0.12);
    if ($tone === 'info') return addOpacity(theme.accentColor, 0.12);
    return addOpacity(theme.textColor, 0.07);
  }};
  border-width: 1px;
  border-color: ${({theme, $tone}: {theme: ThemeType; $tone: 'danger' | 'info' | 'neutral'}) => {
    if ($tone === 'danger') return addOpacity(theme.severeBelowRange, 0.18);
    if ($tone === 'info') return addOpacity(theme.accentColor, 0.18);
    return addOpacity(theme.textColor, 0.1);
  }};
`;

const BadgeText = styled.Text<{$tone: 'danger' | 'info' | 'neutral'}>`
  font-size: 11px;
  font-weight: 800;
  color: ${({theme, $tone}: {theme: ThemeType; $tone: 'danger' | 'info' | 'neutral'}) => {
    if ($tone === 'danger') return theme.severeBelowRange;
    if ($tone === 'info') return theme.accentColor;
    return addOpacity(theme.textColor, 0.75);
  }};
`;

const Chevron = styled.Text`
  font-size: 22px;
  font-weight: 900;
`;

const EmptyWrap = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.lg}px;
`;

const EmptyText = styled.Text`
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
  font-weight: 700;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.7)};
`;

export default HypoInvestigationScreen;
