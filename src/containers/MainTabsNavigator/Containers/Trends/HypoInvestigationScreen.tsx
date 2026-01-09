import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {FlatList, Pressable} from 'react-native';
import styled, {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {BgSample} from 'app/types/day_bgs.types';
import {addOpacity} from 'app/style/styling.utils';
import {formatDateToDateAndTimeString} from 'app/utils/datetime.utils';
import {FULL_SCREEN_VIEW_SCREEN} from 'app/constants/SCREEN_NAMES';
import {StackActions, useNavigation, useRoute} from '@react-navigation/native';
import {dispatchToParentOrSelf} from 'app/utils/navigationDispatch.utils';
import {BasalProfile} from 'app/types/insulin.types';
import {
  buildFullScreenStackedChartsParams,
  enrichBgSamplesWithDeviceStatusForRange,
  fetchStackedChartsDataForRange,
} from 'app/utils/stackedChartsData.utils';
import {formatIobSplitLabel} from 'app/utils/tooltipFormatting.utils';

import {
  extractHypoEvents,
  HYPO_INVESTIGATION_CONSTANTS,
  HypoEvent,
} from 'app/containers/MainTabsNavigator/Containers/Trends/utils/hypoInvestigation.utils';

type RouteParams = {
  bgData: BgSample[];
  startMs: number;
  endMs: number;
  lowThreshold: number;
};

const HypoInvestigationScreen: React.FC = () => {
  const theme = useTheme() as ThemeType;
  const navigation = useNavigation();
  const route = useRoute();

  const params = (route as any)?.params as RouteParams | undefined;

  const bgData = params?.bgData ?? [];
  const rangeStartMs = typeof params?.startMs === 'number' ? params.startMs : null;
  const rangeEndMs = typeof params?.endMs === 'number' ? params.endMs : null;
  const lowThreshold =
    typeof params?.lowThreshold === 'number' && Number.isFinite(params.lowThreshold)
      ? params.lowThreshold
      : 70;

  const [enrichedBgData, setEnrichedBgData] = useState<BgSample[]>(bgData);
  const [isEnriching, setIsEnriching] = useState(false);
  const [basalProfileData, setBasalProfileData] = useState<BasalProfile>([]);
  const [openingEventId, setOpeningEventId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function enrichWithDeviceStatus() {
      if (!bgData?.length) {
        setEnrichedBgData([]);
        return;
      }

      if (rangeStartMs == null || rangeEndMs == null) {
        // Fallback: show raw data if no explicit range.
        setEnrichedBgData(bgData);
        return;
      }

      setIsEnriching(true);
      try {
        const next = await enrichBgSamplesWithDeviceStatusForRange({
          startMs: rangeStartMs,
          endMs: rangeEndMs,
          bgSamples: bgData,
        });
        if (cancelled) return;
        setEnrichedBgData(next);
      } catch (e) {
        if (cancelled) return;
        setEnrichedBgData(bgData);
      } finally {
        if (!cancelled) setIsEnriching(false);
      }
    }

    enrichWithDeviceStatus();
    return () => {
      cancelled = true;
    };
  }, [bgData, rangeEndMs, rangeStartMs]);

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
  }, [rangeStartMs]);

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

  const openHypoWindow = useCallback(async (event: HypoEvent) => {
    const anchorMs = event.nadirMs;
    const startMs = anchorMs - HYPO_INVESTIGATION_CONSTANTS.windowHoursBefore * 60 * 60 * 1000;
    const endMs = anchorMs + HYPO_INVESTIGATION_CONSTANTS.windowHoursAfter * 60 * 60 * 1000;

    setOpeningEventId(event.id);

    const windowRawSamples = (bgData ?? []).filter(
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

    const action = StackActions.push(FULL_SCREEN_VIEW_SCREEN, payload);
    dispatchToParentOrSelf({
      navigation,
      action,
      fallbackNavigate: () => (navigation as any).navigate?.(FULL_SCREEN_VIEW_SCREEN, payload),
    });
  }, [basalProfileData, enrichedBgData, navigation]);

  const formatDuration = (startMs: number, endMs: number) => {
    const ms = Math.max(0, endMs - startMs);
    const minutes = Math.max(1, Math.round(ms / 60_000));
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  };

  const renderItem = ({item}: {item: HypoEvent}) => {
    const title = formatDateToDateAndTimeString(item.nadirMs);
    const subtitleParts: string[] = [];
    if (typeof item.nadirSgv === 'number' && Number.isFinite(item.nadirSgv)) {
      subtitleParts.push(`${Math.round(item.nadirSgv)} mg/dL nadir`);
    }

    subtitleParts.push(`Duration ${formatDuration(item.startMs, item.endMs)}`);

    if (item.driver) {
      subtitleParts.push(`${item.driver === 'basal' ? 'Basal' : 'Bolus'}-driven`);
    }

    if (item.iobBolusU != null || item.iobBasalU != null) {
      const total = (item.iobBolusU ?? 0) + (item.iobBasalU ?? 0);

      subtitleParts.push(
        formatIobSplitLabel({
          totalU: total,
          bolusU: item.iobBolusU ?? 0,
          basalU: item.iobBasalU ?? 0,
          digits: 1,
          formatTotal: u => `IOB ${u.toFixed(1)}U`,
          formatBolus: u => `${u.toFixed(1)} bolus`,
          formatBasal: u => `${u.toFixed(1)} basal`,
        }),
      );
    }

    return (
      <RowButton disabled={openingEventId === item.id} onPress={() => openHypoWindow(item)}>
        <RowLeft>
          <RowTitle numberOfLines={1}>{title}</RowTitle>
          <RowSub numberOfLines={1}>{subtitleParts.join(' • ')}</RowSub>
        </RowLeft>
        <RowRight>
          <RowChevron style={{color: addOpacity(theme.textColor, 0.65)}}>{'›'}</RowChevron>
        </RowRight>
      </RowButton>
    );
  };

  const keyExtractor = (item: HypoEvent) => item.id;

  return (
    <Screen>
      <Header>
        <Title>Hypo investigation</Title>
        <SubTitle>
          Severe hypos: events &lt; {lowThreshold} mg/dL
        </SubTitle>
        {isEnriching ? (
          <SubTitle>Loading active insulin / device status…</SubTitle>
        ) : null}
      </Header>

      <CardsRow>
        <Card>
          <CardTitle>Basal-driven</CardTitle>
          <CardValue>{summary.basalCount}</CardValue>
          <CardSubtle>
            {summary.classifiedEvents > 0 && summary.basalPct != null
              ? `${Math.round(summary.basalPct)}% of classified`
              : '—'}
          </CardSubtle>
        </Card>

        <Card>
          <CardTitle>Bolus-driven</CardTitle>
          <CardValue>{summary.bolusCount}</CardValue>
          <CardSubtle>
            {summary.classifiedEvents > 0 && summary.bolusPct != null
              ? `${Math.round(summary.bolusPct)}% of classified`
              : '—'}
          </CardSubtle>
        </Card>
      </CardsRow>

      <ListHeader>
        <ListHeaderText>
          Hypos ({summary.totalEvents})
        </ListHeaderText>
        <ListHeaderHint>Tap a hypo to open a ±3h chart window</ListHeaderHint>
      </ListHeader>

      <FlatList
        data={hypoEvents}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <Separator />}
        ListEmptyComponent={
          <EmptyWrap>
            <EmptyText>No severe hypos in this range.</EmptyText>
          </EmptyWrap>
        }
        contentContainerStyle={hypoEvents.length ? undefined : {flexGrow: 1}}
      />
    </Screen>
  );
};

const Screen = styled.View`
  flex: 1;
  background-color: ${({theme}: {theme: ThemeType}) => theme.backgroundColor};
`;

const Header = styled.View`
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.lg}px;
  padding-bottom: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
`;

const Title = styled.Text`
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.lg}px;
  font-weight: 900;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

const SubTitle = styled.Text`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
  font-weight: 600;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.7)};
`;

const CardsRow = styled.View`
  flex-direction: row;
  padding-left: ${({theme}: {theme: ThemeType}) => theme.spacing.lg}px;
  padding-right: ${({theme}: {theme: ThemeType}) => theme.spacing.lg}px;
  padding-bottom: ${({theme}: {theme: ThemeType}) => theme.spacing.lg}px;
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

const RowButton = styled(Pressable)`
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px
    ${({theme}: {theme: ThemeType}) => theme.spacing.lg}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const RowLeft = styled.View`
  flex: 1;
  flex-direction: column;
`;

const RowRight = styled.View`
  width: 24px;
  align-items: flex-end;
`;

const RowTitle = styled.Text`
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
  font-weight: 800;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

const RowSub = styled.Text`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.xs / 2}px;
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.xs}px;
  font-weight: 600;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.65)};
`;

const RowChevron = styled.Text`
  font-size: 22px;
  font-weight: 900;
`;

const Separator = styled.View`
  height: 1px;
  background-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.08)};
  margin-left: ${({theme}: {theme: ThemeType}) => theme.spacing.lg}px;
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
