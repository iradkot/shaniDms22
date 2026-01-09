import React, {useMemo, useState} from 'react';

import {Pressable, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import styled, {useTheme} from 'styled-components/native';

import BgGraph from 'app/components/charts/CgmGraph/CgmGraph';
import type {CGMGraphExternalTooltipPayload} from 'app/components/charts/CgmGraph/CgmGraph';
import BasalMiniGraph from 'app/components/charts/BasalMiniGraph/BasalMiniGraph';
import ActiveInsulinMiniGraph from 'app/components/charts/ActiveInsulinMiniGraph/ActiveInsulinMiniGraph';
import HomeChartsTooltip from 'app/containers/MainTabsNavigator/Containers/Home/components/HomeChartsTooltip';
import {ChartMargin} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';
import {useStackedChartsTooltipModel} from 'app/containers/MainTabsNavigator/Containers/Home/components/hooks/useStackedChartsTooltipModel';
import {useBasalRateAtTime} from 'app/containers/MainTabsNavigator/Containers/Home/components/hooks/useBasalRateAtTime';
import {useBgTooltipDerivedMetrics} from 'app/containers/MainTabsNavigator/Containers/Home/components/hooks/useBgTooltipDerivedMetrics';

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

  const {
    shouldShowTooltip,
    cgmAnchorTimeMs,
    eventsAnchorTimeMs,
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

  const basalRateUhr = useBasalRateAtTime({
    enabled: shouldShowTooltip,
    timeMs: cgmAnchorTimeMs,
    insulinData,
    basalProfileData,
  });

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
