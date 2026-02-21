import React, {useCallback, useMemo, useRef, useState} from 'react';

import {type GestureResponderEvent, Pressable, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import styled, {useTheme} from 'styled-components/native';
import * as d3 from 'd3';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';

import BgGraph from 'app/components/charts/CgmGraph/CgmGraph';
import type {CGMGraphExternalTooltipPayload} from 'app/components/charts/CgmGraph/CgmGraph';
import BasalMiniGraph from 'app/components/charts/BasalMiniGraph/BasalMiniGraph';
import ActiveInsulinMiniGraph from 'app/components/charts/ActiveInsulinMiniGraph/ActiveInsulinMiniGraph';
import CobMiniGraph from 'app/components/charts/CobMiniGraph/CobMiniGraph';
import MixedMiniChart from 'app/components/charts/MixedMiniChart/MixedMiniChart';
import HomeChartsTooltip from 'app/containers/MainTabsNavigator/Containers/Home/components/HomeChartsTooltip';
import {ChartMargin} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';
import {useStackedChartsTooltipModel} from 'app/containers/MainTabsNavigator/Containers/Home/components/hooks/useStackedChartsTooltipModel';
import {useBasalRateAtTime} from 'app/containers/MainTabsNavigator/Containers/Home/components/hooks/useBasalRateAtTime';
import {useBgTooltipDerivedMetrics} from 'app/containers/MainTabsNavigator/Containers/Home/components/hooks/useBgTooltipDerivedMetrics';
import {useTooltipEventsSummary} from 'app/containers/MainTabsNavigator/Containers/Home/components/hooks/useTooltipEventsSummary';

import {BgSample} from 'app/types/day_bgs.types';
import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

/** Tooltip state exposed to parent when `tooltipPlacement="none"`. */
export type StackedChartsTooltipModel = {
  visible: boolean;
  anchorTimeMs: number;
  bgSample: BgSample | null;
  activeInsulinU: number | null;
  activeInsulinBolusU: number | null;
  activeInsulinBasalU: number | null;
  cobG: number | null;
  basalRateUhr: number | null;
  bolusSummary: {count: number; totalU: number};
  carbsSummary: {count: number; totalG: number};
  bolusEvents: any[];
  carbEvents: any[];
  fullWidth: boolean;
  maxWidthPx?: number;
};

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
   * - `above` (default): renders above the CGM chart (absolute, overflows upward).
   * - `inside`: renders inside the CGM chart area (useful for fullscreen screens that
   *   clip overflow).
   * - `top`: renders above the chart in **normal document flow** (no absolute positioning,
   *   takes up layout space — ideal for inline expanded cards like the FoodTracker).
   * - `none`: suppresses tooltip rendering inside this component. Use `onTooltipModelChange`
   *   to render the tooltip externally (e.g., as a Home-level overlay).
   */
  tooltipPlacement?: 'above' | 'inside' | 'top' | 'none';

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

  /**
   * Controls how mini charts are displayed.
   *
   * - `separate` (default): Three distinct mini charts stacked vertically.
   * - `mixed`: Single overlaid area chart combining basal, IOB, and COB.
   */
  chartMode?: 'separate' | 'mixed';

  /**
   * Called whenever the tooltip model changes.
   * Use with `tooltipPlacement="none"` to render the tooltip externally.
   */
  onTooltipModelChange?: (model: StackedChartsTooltipModel) => void;
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
    chartMode = 'separate',
    onTooltipModelChange,
  } = props;

  const theme = useTheme() as ThemeType;

  const [chartsTooltip, setChartsTooltip] = useState<CGMGraphExternalTooltipPayload | null>(null);

  // Auto-hide tooltip after 4 s of no updates (safety net for stuck touch events).
  const tooltipTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTooltipTimer = React.useCallback(() => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  }, []);
  const handleTooltipChange = React.useCallback(
    (payload: CGMGraphExternalTooltipPayload | null) => {
      clearTooltipTimer();
      setChartsTooltip(payload);
      if (payload != null) {
        tooltipTimerRef.current = setTimeout(() => setChartsTooltip(null), 4000);
      }
    },
    [clearTooltipTimer],
  );
  React.useEffect(() => clearTooltipTimer, [clearTooltipTimer]);

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

  const {
    shouldShowTooltip,
    cgmAnchorTimeMs,
    cursorTimeMs,
    resolvedTooltipAlign,
    tooltipBgSample,
    tooltipBolusEvents,
    tooltipCarbEvents,
  } = useStackedChartsTooltipModel({
    chartsTooltip,
    bgSamples,
    foodItems,
    insulinData,
    fallbackAnchorTimeMs,
    width,
    marginLeft: stackedChartsMargin.left,
    marginRight: stackedChartsMargin.right,
    xDomain,
    tooltipAlign,
  });

  const {activeInsulinU, activeInsulinBolusU, activeInsulinBasalU, cobG} =
    useBgTooltipDerivedMetrics(tooltipBgSample);

  const {bolusSummary, carbsSummary} = useTooltipEventsSummary({
    bolusEvents: tooltipBolusEvents as any,
    carbEvents: tooltipCarbEvents as any,
  });

  const basalRateUhr = useBasalRateAtTime({
    enabled: shouldShowTooltip,
    timeMs: cgmAnchorTimeMs,
    insulinData,
    basalProfileData,
  });

  const tooltipOverlayTestID = testID ? `${testID}.tooltipOverlay` : undefined;
  const tooltipDockTestID = testID ? `${testID}.tooltipDock` : undefined;

  // ── Emit tooltip model to parent when placement is 'none' ─────────
  const prevModelRef = useRef<string>('');
  React.useEffect(() => {
    if (!onTooltipModelChange) return;
    const model: StackedChartsTooltipModel = {
      visible: shouldShowTooltip,
      anchorTimeMs: cgmAnchorTimeMs,
      bgSample: tooltipBgSample,
      activeInsulinU,
      activeInsulinBolusU,
      activeInsulinBasalU,
      cobG,
      basalRateUhr,
      bolusSummary,
      carbsSummary,
      bolusEvents: tooltipBolusEvents,
      carbEvents: tooltipCarbEvents,
      fullWidth: tooltipFullWidth,
      maxWidthPx: tooltipMaxWidthPx,
    };
    // Shallow key check to avoid excessive re-renders
    const key = `${model.visible}-${model.anchorTimeMs}`;
    if (key !== prevModelRef.current) {
      prevModelRef.current = key;
      onTooltipModelChange(model);
    }
  }, [
    onTooltipModelChange, shouldShowTooltip, cgmAnchorTimeMs,
    tooltipBgSample, activeInsulinU, activeInsulinBolusU,
    activeInsulinBasalU, cobG, basalRateUhr,
    bolusSummary, carbsSummary, tooltipBolusEvents, tooltipCarbEvents,
    tooltipFullWidth, tooltipMaxWidthPx,
  ]);

  // Whether to render the tooltip inside this component
  const renderTooltipInternally = tooltipPlacement !== 'none';

  // ── Touch forwarding for mini charts ───────────────────────────────
  // Mini charts don't have their own touch handlers, so we wrap them in a
  // View that translates touch x → time and forwards to the tooltip system.

  const miniChartXScale = useMemo(() => {
    const resolvedDomain = xDomain ?? (() => {
      const extent = d3.extent(bgSamples, s => new Date(s.date));
      if (extent[0] && extent[1]) return extent as [Date, Date];
      const now = new Date();
      return [now, now] as [Date, Date];
    })();
    const plotWidth = Math.max(1, width - stackedChartsMargin.left - stackedChartsMargin.right);
    return d3.scaleTime().domain(resolvedDomain).range([0, plotWidth]);
  }, [bgSamples, stackedChartsMargin.left, stackedChartsMargin.right, width, xDomain]);

  const miniTouchToTime = useCallback(
    (evt: GestureResponderEvent): number | null => {
      const rawX = evt.nativeEvent.locationX;
      if (typeof rawX !== 'number' || !Number.isFinite(rawX)) return null;
      const plotWidth = Math.max(1, width - stackedChartsMargin.left - stackedChartsMargin.right);
      const localX = Math.max(0, Math.min(rawX - stackedChartsMargin.left, plotWidth));
      const t = miniChartXScale.invert(localX).getTime();
      return Number.isFinite(t) ? t : null;
    },
    [miniChartXScale, stackedChartsMargin.left, stackedChartsMargin.right, width],
  );

  const handleMiniTouchStart = useCallback(
    (evt: GestureResponderEvent) => {
      const timeMs = miniTouchToTime(evt);
      if (timeMs != null) handleTooltipChange({touchTimeMs: timeMs, anchorTimeMs: timeMs});
    },
    [miniTouchToTime, handleTooltipChange],
  );

  const handleMiniTouchMove = useCallback(
    (evt: GestureResponderEvent) => {
      const timeMs = miniTouchToTime(evt);
      if (timeMs != null) handleTooltipChange({touchTimeMs: timeMs, anchorTimeMs: timeMs});
    },
    [miniTouchToTime, handleTooltipChange],
  );

  const handleMiniTouchEnd = useCallback(() => {
    handleTooltipChange(null);
  }, [handleTooltipChange]);

  return (
    <View testID={testID}>
      {/* 'top' placement: tooltip in normal flow ABOVE the chart stack */}
      {renderTooltipInternally && tooltipPlacement === 'top' && shouldShowTooltip ? (
        <TooltipDock
          testID={tooltipDockTestID}
          style={{justifyContent: resolvedTooltipAlign === 'right' ? 'flex-end' : 'flex-start'}}
        >
          <HomeChartsTooltip
                anchorTimeMs={cgmAnchorTimeMs}
                bgSample={tooltipBgSample}
                activeInsulinU={activeInsulinU}
                activeInsulinBolusU={activeInsulinBolusU}
                activeInsulinBasalU={activeInsulinBasalU}
                cobG={cobG}
                basalRateUhr={basalRateUhr}
                bolusSummary={bolusSummary}
                carbsSummary={carbsSummary}
                bolusEvents={tooltipBolusEvents}
                carbEvents={tooltipCarbEvents}
                fullWidth={tooltipFullWidth}
                maxWidthPx={tooltipMaxWidthPx}
              />
            </TooltipDock>
        ) : null}

      <ChartStack>
        {/* 'above' / 'inside' placement: absolute overlay inside ChartStack */}
        {renderTooltipInternally && tooltipPlacement !== 'top' && shouldShowTooltip ? (
          <ChartTooltipOverlay
            $placement={tooltipPlacement === 'inside' ? 'inside' : 'above'}
            pointerEvents="none"
            testID={tooltipOverlayTestID}
          >
            <TooltipDock
              testID={tooltipDockTestID}
              style={{justifyContent: resolvedTooltipAlign === 'right' ? 'flex-end' : 'flex-start'}}
            >
              <HomeChartsTooltip
                anchorTimeMs={cgmAnchorTimeMs}
                bgSample={tooltipBgSample}
                activeInsulinU={activeInsulinU}
                activeInsulinBolusU={activeInsulinBolusU}
                activeInsulinBasalU={activeInsulinBasalU}
                cobG={cobG}
                basalRateUhr={basalRateUhr}
                bolusSummary={bolusSummary}
                carbsSummary={carbsSummary}
                bolusEvents={tooltipBolusEvents}
                carbEvents={tooltipCarbEvents}
                fullWidth={tooltipFullWidth}
                maxWidthPx={tooltipMaxWidthPx}
              />
            </TooltipDock>
          </ChartTooltipOverlay>
        ) : null}

        {showFullScreenButton && onPressFullScreen ? (
          <FullScreenButtonOverlay>
            <FullScreenButton
              testID={E2E_TEST_IDS.charts.cgmGraphFullScreenButton}
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
          onTooltipChange={handleTooltipChange}
          cursorTimeMs={cursorTimeMs}
        />
      </ChartStack>

      {/* Mini charts area — wrapped in a touch-responsive View */}
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleMiniTouchStart}
        onResponderMove={handleMiniTouchMove}
        onResponderRelease={handleMiniTouchEnd}
        onResponderTerminate={handleMiniTouchEnd}
      >
        {chartMode === 'mixed' ? (
          <MixedMiniChart
            bgSamples={bgSamples}
            insulinData={insulinData}
            width={width}
            height={miniChartHeight * 2.5}
            xDomain={xDomain}
            margin={{
              top: 16,
              right: stackedChartsMargin.right,
              bottom: 16,
              left: stackedChartsMargin.left,
            }}
            cursorTimeMs={cursorTimeMs}
          />
        ) : (
          <>
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

            <CobMiniGraph
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
          </>
        )}
      </View>
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
