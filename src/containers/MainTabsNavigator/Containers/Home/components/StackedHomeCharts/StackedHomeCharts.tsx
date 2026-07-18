import React, {useMemo} from 'react';

import {Pressable, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import styled, {useTheme} from 'styled-components/native';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';

import BgGraph from 'app/components/charts/CgmGraph/CgmGraph';
import BasalMiniGraph from 'app/components/charts/BasalMiniGraph/BasalMiniGraph';
import ActiveInsulinMiniGraph from 'app/components/charts/ActiveInsulinMiniGraph/ActiveInsulinMiniGraph';
import CobMiniGraph from 'app/components/charts/CobMiniGraph/CobMiniGraph';
import MixedMiniChart from 'app/components/charts/MixedMiniChart/MixedMiniChart';
import HomeChartsTooltip from 'app/containers/MainTabsNavigator/Containers/Home/components/HomeChartsTooltip';
import type {ChartMargin} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';
import {useBasalRateAtTime} from './hooks/useBasalRateAtTime';
import {useBgTooltipDerivedMetrics} from './hooks/useBgTooltipDerivedMetrics';
import {useEmitStackedChartsTooltipModel} from './hooks/useEmitStackedChartsTooltipModel';
import {useStackedChartsTooltipModel} from './hooks/useStackedChartsTooltipModel';
import {useStackedChartsTouchTooltip} from './hooks/useStackedChartsTouchTooltip';
import {useTooltipEventsSummary} from './hooks/useTooltipEventsSummary';

import type {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import type {
  StackedChartsTooltipModel,
  StackedHomeChartsProps,
} from './StackedHomeCharts.types';

const SCROLL_SAFE_EDGE_WIDTH = 44;

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
    onTouchSessionChange,
  } = props;

  const theme = useTheme() as ThemeType;

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
    chartsTooltip,
    handleTooltipChange,
    touchHandlers: stackedTouchHandlers,
  } = useStackedChartsTouchTooltip({
    bgSamples,
    width,
    margin: stackedChartsMargin,
    xDomain,
    scrollSafeEdgeWidth: SCROLL_SAFE_EDGE_WIDTH,
    onTouchSessionChange,
  });

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
  const cgmTouchAreaTestID = testID ? `${testID}.cgmTouchArea` : undefined;

  const emittedTooltipModel = useMemo<StackedChartsTooltipModel>(
    () => ({
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
    }),
    [
      shouldShowTooltip,
      cgmAnchorTimeMs,
      tooltipBgSample,
      activeInsulinU,
      activeInsulinBolusU,
      activeInsulinBasalU,
      cobG,
      basalRateUhr,
      bolusSummary,
      carbsSummary,
      tooltipBolusEvents,
      tooltipCarbEvents,
      tooltipFullWidth,
      tooltipMaxWidthPx,
    ],
  );
  useEmitStackedChartsTooltipModel({
    model: emittedTooltipModel,
    onTooltipModelChange,
  });

  // Whether to render the tooltip inside this component
  const renderTooltipInternally = tooltipPlacement !== 'none';

  return (
    <View testID={testID}>
      {/* 'top' placement: tooltip in normal flow ABOVE the chart stack */}
      {renderTooltipInternally &&
      tooltipPlacement === 'top' &&
      shouldShowTooltip ? (
        <TooltipDock testID={tooltipDockTestID} $align={resolvedTooltipAlign}>
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

      <ChartStack testID={cgmTouchAreaTestID} {...stackedTouchHandlers}>
        {/* 'above' / 'inside' placement: absolute overlay inside ChartStack */}
        {renderTooltipInternally &&
        tooltipPlacement !== 'top' &&
        shouldShowTooltip ? (
          <ChartTooltipOverlay
            $placement={tooltipPlacement === 'inside' ? 'inside' : 'above'}
            pointerEvents="none"
            testID={tooltipOverlayTestID}>
            <TooltipDock
              testID={tooltipDockTestID}
              $align={resolvedTooltipAlign}>
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
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
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
          handleTouchEvents={false}
          cursorTimeMs={cursorTimeMs}
        />

        <ScrollSafeLane
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <ScrollSafeGrip>
            <ScrollSafeDot />
            <ScrollSafeDot />
            <ScrollSafeDot />
          </ScrollSafeGrip>
        </ScrollSafeLane>
      </ChartStack>

      {/* Mini charts area — observe touch without taking over ScrollView's responder. */}
      <View {...stackedTouchHandlers}>
        {chartMode === 'mixed' ? (
          <MixedMiniChart
            bgSamples={bgSamples}
            insulinData={insulinData}
            basalProfileData={basalProfileData}
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
              basalProfileData={basalProfileData}
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

const ScrollSafeLane = styled.View`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: ${SCROLL_SAFE_EDGE_WIDTH}px;
  align-items: center;
  justify-content: center;
`;

const ScrollSafeGrip = styled.View`
  width: 22px;
  min-height: 72px;
  border-radius: 11px;
  align-items: center;
  justify-content: center;
  background-color: ${({theme}: {theme: ThemeType}) =>
    addOpacity(theme.textColor, 0.1)};
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) =>
    addOpacity(theme.textColor, 0.16)};
`;

const ScrollSafeDot = styled.View`
  width: 4px;
  height: 4px;
  border-radius: 2px;
  margin-vertical: 3px;
  background-color: ${({theme}: {theme: ThemeType}) =>
    addOpacity(theme.textColor, 0.56)};
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

const TooltipDock = styled.View<{$align: 'left' | 'right'}>`
  width: 100%;
  flex-direction: row;
  justify-content: ${({$align}: {$align: 'left' | 'right'}) =>
    $align === 'right' ? 'flex-end' : 'flex-start'};
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
  background-color: ${({theme}: {theme: ThemeType}) =>
    addOpacity(theme.white, 0.9)};
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) =>
    addOpacity(theme.textColor, 0.12)};
`;

export default StackedHomeCharts;
