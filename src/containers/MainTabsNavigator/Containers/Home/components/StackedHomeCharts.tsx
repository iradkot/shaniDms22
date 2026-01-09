import React, {useMemo, useState} from 'react';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

import {Pressable, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import styled, {useTheme} from 'styled-components/native';

import BgGraph from 'app/components/charts/CgmGraph/CgmGraph';
import type {CGMGraphExternalTooltipPayload} from 'app/components/charts/CgmGraph/CgmGraph';
import BasalMiniGraph from 'app/components/charts/BasalMiniGraph/BasalMiniGraph';
import ActiveInsulinMiniGraph from 'app/components/charts/ActiveInsulinMiniGraph/ActiveInsulinMiniGraph';
import {findClosestBgSample} from 'app/components/charts/CgmGraph/utils';
import {findBolusEventsInTooltipWindow, findClosestBolus} from 'app/components/charts/CgmGraph/utils/bolusUtils';
import {findCarbEventsInTooltipWindow, findClosestCarbEvent} from 'app/components/charts/CgmGraph/utils/carbsUtils';
import HomeChartsTooltip from 'app/containers/MainTabsNavigator/Containers/Home/components/HomeChartsTooltip';
import {ChartMargin} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';

import {BgSample} from 'app/types/day_bgs.types';
import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

export type StackedHomeChartsProps = {
  bgSamples: BgSample[];
  foodItems: Array<FoodItemDTO | formattedFoodItemDTO> | null;
  insulinData?: InsulinDataEntry[];
  basalProfileData?: BasalProfile;

  width: number;

  /**
   * Height (px) of the CGM graph.
   */
  cgmHeight: number;

  /**
   * Height (px) of each mini chart (basal + active insulin).
   */
  miniChartHeight: number;

  /**
   * Optional override for the x-axis time domain.
   *
   * When not provided, the domain is derived from the BG sample extent.
   */
  xDomain?: [Date, Date] | null;

  /**
   * Optional time used when there is no active touch.
   *
   * Home uses this to anchor the tooltip to the latest BG.
   */
  fallbackAnchorTimeMs?: number;

  /**
   * Shared margin for stacked charts.
   *
   * Passing the same left/right margins ensures all charts map time -> x pixels identically.
   */
  margin?: ChartMargin;

  /**
   * Whether to show a fullscreen button overlay.
   */
  showFullScreenButton?: boolean;

  /**
   * Called when the fullscreen button is pressed.
   */
  onPressFullScreen?: () => void;

  /**
   * Optional E2E selector.
   */
  testID?: string;

  /**
   * Controls where the unified tooltip is positioned.
   *
   * - `above` (default): renders above the CGM chart.
   * - `inside`: renders inside the CGM chart area (useful for fullscreen screens that
   *   clip overflow).
   */
  tooltipPlacement?: 'above' | 'inside';

  /**
   * Controls horizontal alignment when `tooltipPlacement="inside"`.
   */
  tooltipAlign?: 'left' | 'right' | 'auto';

  /**
   * When false, the tooltip sizes to its content (useful for landscape).
   */
  tooltipFullWidth?: boolean;

  /**
   * Optional max width for the tooltip container (px).
   * Useful in fullscreen landscape to avoid covering charts.
   */
  tooltipMaxWidthPx?: number;
};

const StackedHomeCharts: React.FC<StackedHomeChartsProps> = props => {
  const {
    bgSamples,
    foodItems,
    insulinData,
    basalProfileData,
    width,
    cgmHeight,
    miniChartHeight,
    xDomain,
    fallbackAnchorTimeMs,
    margin: marginOverride,
    showFullScreenButton = true,
    onPressFullScreen,
    testID,
    tooltipPlacement = 'above',
    tooltipAlign = 'left',
    tooltipFullWidth = true,
    tooltipMaxWidthPx,
  } = props;

  const theme = useTheme() as ThemeType;

  const [chartsTooltip, setChartsTooltip] = useState<CGMGraphExternalTooltipPayload | null>(null);

  const stackedChartsMargin = useMemo<ChartMargin>(
    () =>
      marginOverride ?? {
        top: 20,
        right: 15,
        bottom: 30,
        left: 50,
      },
    [marginOverride],
  );

  const shouldShowTooltip = chartsTooltip != null;

  const fallbackAnchorResolvedMs = useMemo(() => {
    return typeof fallbackAnchorTimeMs === 'number' && Number.isFinite(fallbackAnchorTimeMs)
      ? fallbackAnchorTimeMs
      : null;
  }, [fallbackAnchorTimeMs]);

  const latestBgTimeMs = useMemo(() => {
    if (fallbackAnchorResolvedMs != null) return fallbackAnchorResolvedMs;
    if (!bgSamples?.length) return Date.now();
    let best = bgSamples[0]?.date ?? Date.now();
    for (const s of bgSamples) {
      if (typeof s?.date === 'number' && s.date > best) {
        best = s.date;
      }
    }
    return best;
  }, [bgSamples, fallbackAnchorResolvedMs]);

  const tooltipAnchorTimeMs = useMemo(() => {
    // When touching, treat `touchTimeMs` as the input signal and compute a stable anchor.
    // This prevents the tooltip / focus-line from lagging a render behind.
    if (chartsTooltip?.touchTimeMs != null) {
      const touchTimeMs = chartsTooltip.touchTimeMs;

      const closestBolus = insulinData?.length ? findClosestBolus(touchTimeMs, insulinData) : null;
      if (closestBolus?.timestamp) {
        const t = Date.parse(closestBolus.timestamp);
        if (Number.isFinite(t)) return t;
      }

      const closestCarb = foodItems?.length ? findClosestCarbEvent(touchTimeMs, foodItems) : null;
      if (closestCarb?.timestamp != null) {
        return closestCarb.timestamp;
      }

      return touchTimeMs;
    }
    if (fallbackAnchorResolvedMs != null) return fallbackAnchorResolvedMs;
    return latestBgTimeMs;
  }, [chartsTooltip?.touchTimeMs, fallbackAnchorResolvedMs, foodItems, insulinData, latestBgTimeMs]);

  const cursorTimeMs = useMemo(() => {
    // Show the cross-chart focus only while touching.
    return shouldShowTooltip ? tooltipAnchorTimeMs : null;
  }, [shouldShowTooltip, tooltipAnchorTimeMs]);

  const resolvedTooltipAlign = useMemo<'left' | 'right'>(() => {
    if (tooltipAlign !== 'auto') return tooltipAlign;
    if (!shouldShowTooltip || cursorTimeMs == null) return 'right';

    const graphWidth = Math.max(1, width - stackedChartsMargin.left - stackedChartsMargin.right);

    const startMs = xDomain?.[0] ? xDomain[0].getTime() : NaN;
    const endMs = xDomain?.[1] ? xDomain[1].getTime() : NaN;
    const spanMs = Number.isFinite(startMs) && Number.isFinite(endMs) ? endMs - startMs : NaN;
    if (!(spanMs > 0)) return 'right';

    const t = clamp01((cursorTimeMs - startMs) / spanMs);
    const cursorX = t * graphWidth;

    // If the user is focusing the right side, dock tooltip left (and vice versa).
    return cursorX > graphWidth / 2 ? 'left' : 'right';
  }, [cursorTimeMs, shouldShowTooltip, stackedChartsMargin.left, stackedChartsMargin.right, tooltipAlign, width, xDomain]);

  const tooltipBgSample = useMemo(() => {
    if (!shouldShowTooltip) return null;
    if (!bgSamples?.length) return null;
    return findClosestBgSample(tooltipAnchorTimeMs, bgSamples);
  }, [bgSamples, shouldShowTooltip, tooltipAnchorTimeMs]);

  const activeInsulinU = useMemo(() => {
    if (!tooltipBgSample) return null;
    if (typeof tooltipBgSample.iob === 'number') return tooltipBgSample.iob;
    if (
      typeof tooltipBgSample.iobBolus === 'number' ||
      typeof tooltipBgSample.iobBasal === 'number'
    ) {
      return (typeof tooltipBgSample.iobBolus === 'number' ? tooltipBgSample.iobBolus : 0) +
        (typeof tooltipBgSample.iobBasal === 'number' ? tooltipBgSample.iobBasal : 0);
    }
    return null;
  }, [tooltipBgSample]);

  const cobG = useMemo(() => {
    if (!tooltipBgSample) return null;
    return typeof tooltipBgSample.cob === 'number' ? tooltipBgSample.cob : null;
  }, [tooltipBgSample]);

  const tooltipBolusEvents = useMemo(() => {
    if (!shouldShowTooltip) return [];
    if (!insulinData?.length) return [];
    return findBolusEventsInTooltipWindow({anchorTimeMs: tooltipAnchorTimeMs, insulinData});
  }, [insulinData, shouldShowTooltip, tooltipAnchorTimeMs]);

  const tooltipCarbEvents = useMemo(() => {
    if (!shouldShowTooltip) return [];
    if (!foodItems?.length) return [];
    return findCarbEventsInTooltipWindow({anchorTimeMs: tooltipAnchorTimeMs, foodItems});
  }, [foodItems, shouldShowTooltip, tooltipAnchorTimeMs]);

  const bolusSummary = useMemo(() => {
    const totalU = tooltipBolusEvents.reduce(
      (sum, b) => sum + (typeof (b as any).amount === 'number' ? (b as any).amount : 0),
      0,
    );
    return {count: tooltipBolusEvents.length, totalU};
  }, [tooltipBolusEvents]);

  const carbsSummary = useMemo(() => {
    const totalG = tooltipCarbEvents.reduce(
      (sum, c) => sum + (typeof (c as any).carbs === 'number' ? (c as any).carbs : 0),
      0,
    );
    return {count: tooltipCarbEvents.length, totalG};
  }, [tooltipCarbEvents]);

  const basalRateUhr = useMemo(() => {
    if (!shouldShowTooltip) return null;
    const ms = tooltipAnchorTimeMs;

    const tempBasals = (insulinData ?? [])
      .filter(e => e.type === 'tempBasal')
      .map(e => {
        const startMs = e.startTime ? Date.parse(e.startTime) : e.timestamp ? Date.parse(e.timestamp) : NaN;
        const durationMin = typeof e.duration === 'number' && Number.isFinite(e.duration) ? e.duration : 0;
        const endMs = e.endTime
          ? Date.parse(e.endTime)
          : Number.isFinite(startMs) && durationMin > 0
            ? startMs + durationMin * 60_000
            : NaN;
        const rate = typeof e.rate === 'number' && Number.isFinite(e.rate) ? e.rate : NaN;
        return {startMs, endMs, rate};
      })
      .filter(x => Number.isFinite(x.startMs) && Number.isFinite(x.rate));

    const activeTemp = tempBasals
      .filter(x => Number.isFinite(x.endMs) && ms >= x.startMs && ms <= x.endMs)
      .sort((a, b) => b.startMs - a.startMs)[0];

    if (activeTemp && Number.isFinite(activeTemp.rate)) {
      return activeTemp.rate;
    }

    if (!basalProfileData?.length) return null;

    const d = new Date(ms);
    const seconds = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    const sorted = [...basalProfileData]
      .map(e => ({
        value: e.value,
        sec:
          typeof e.timeAsSeconds === 'number' && Number.isFinite(e.timeAsSeconds)
            ? e.timeAsSeconds
            : (() => {
                const [hh, mm] = String(e.time).split(':');
                const h = parseInt(hh, 10);
                const m = parseInt(mm, 10);
                return (Number.isFinite(h) ? h : 0) * 3600 + (Number.isFinite(m) ? m : 0) * 60;
              })(),
      }))
      .sort((a, b) => a.sec - b.sec);

    const match = [...sorted].reverse().find(e => e.sec <= seconds) ?? sorted[sorted.length - 1];
    return typeof match?.value === 'number' && Number.isFinite(match.value) ? match.value : null;
  }, [basalProfileData, insulinData, shouldShowTooltip, tooltipAnchorTimeMs]);

  const tooltipOverlayTestID = testID ? `${testID}.tooltipOverlay` : undefined;
  const tooltipDockTestID = testID ? `${testID}.tooltipDock` : undefined;

  return (
    <View testID={testID}>
      <ChartStack>
        {shouldShowTooltip ? (
          <ChartTooltipOverlay
            $placement={tooltipPlacement}
            pointerEvents="none"
            testID={tooltipOverlayTestID}
          >
            <TooltipDock
              testID={tooltipDockTestID}
              style={{justifyContent: resolvedTooltipAlign === 'right' ? 'flex-end' : 'flex-start'}}
            >
              <HomeChartsTooltip
                anchorTimeMs={tooltipAnchorTimeMs}
                bgSample={tooltipBgSample}
                activeInsulinU={activeInsulinU}
                cobG={cobG}
                basalRateUhr={basalRateUhr}
                bolusSummary={bolusSummary}
                carbsSummary={carbsSummary}
                fullWidth={tooltipFullWidth}
                maxWidthPx={tooltipMaxWidthPx}
              />
            </TooltipDock>
          </ChartTooltipOverlay>
        ) : null}

        {showFullScreenButton && onPressFullScreen ? (
          <FullScreenButtonOverlay>
            <FullScreenButton
              onPress={onPressFullScreen}
              accessibilityRole="button"
              accessibilityLabel="Full screen"
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
            >
              <Icon name="fullscreen" size={20} color={theme.textColor} />
            </FullScreenButton>
          </FullScreenButtonOverlay>
        ) : null}

        <BgGraph
          bgSamples={bgSamples}
          width={width}
          height={cgmHeight}
          foodItems={foodItems}
          insulinData={insulinData}
          xDomain={xDomain}
          margin={stackedChartsMargin}
          testID={testID}
          showFullScreenButton={false}
          tooltipMode="external"
          onTooltipChange={setChartsTooltip}
          cursorTimeMs={cursorTimeMs}
        />
      </ChartStack>

      <BasalMiniGraph
        bgSamples={bgSamples}
        insulinData={insulinData}
        width={width}
        height={miniChartHeight}
        xDomain={xDomain}
        margin={{
          top: 8,
          right: stackedChartsMargin.right,
          bottom: 12,
          left: stackedChartsMargin.left,
        }}
        cursorTimeMs={cursorTimeMs}
      />

      <ActiveInsulinMiniGraph
        bgSamples={bgSamples}
        width={width}
        height={miniChartHeight}
        xDomain={xDomain}
        margin={{
          top: 18,
          right: stackedChartsMargin.right,
          bottom: 12,
          left: stackedChartsMargin.left,
        }}
        cursorTimeMs={cursorTimeMs}
      />
    </View>
  );
};

const ChartStack = styled.View`
  position: relative;
`;

const ChartTooltipOverlay = styled.View<{$placement: 'above' | 'inside'}>`
  position: absolute;
  left: 0;
  right: 0;
  ${({$placement}: {$placement: 'above' | 'inside'}) =>
    $placement === 'inside' ? 'top: 0;' : 'bottom: 100%;'}
  z-index: 999;
  elevation: 20;
`;

const TooltipDock = styled.View`
  width: 100%;
  flex-direction: row;
`;

const FullScreenButtonOverlay = styled.View`
  position: absolute;
  top: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  right: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  z-index: 100;
  elevation: 10;
`;

const FullScreenButton = styled(Pressable)`
  width: 40px;
  height: 40px;
  border-radius: 20px;
  align-items: center;
  justify-content: center;
  background-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.white, 0.9)};
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.12)};
`;

export default StackedHomeCharts;
