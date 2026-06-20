import React, {useCallback, useMemo, useRef} from 'react';
import {View} from 'react-native';
import Svg, {ClipPath, Defs, G, Line, Rect} from 'react-native-svg';
import styled from 'styled-components/native';
import XGridAndAxis from './components/XGridAndAxis';
import YGridAndAxis from './components/YGridAndAxis';
import CGMSamplesRenderer from './components/CGMSamplesRenderer';
import GraphDateDisplay from './components/GraphDateDisplay';
import FoodItemsRenderer from './components/Food/FoodItemsRenderer';
import {
  GraphStyleContext,
  useGraphStyleContext,
} from './contextStores/GraphStyleContext';
import {useTouchContext} from './contextStores/TouchContext';
import SgvTooltip from 'app/components/charts/CgmGraph/components/Tooltips/SgvTooltip';
import {useTheme} from 'styled-components/native';
import FullScreenButton from 'app/components/common-ui/FullScreenButton/FullScreenButton';
import {useNavigation} from '@react-navigation/native';
import {pushFullScreenViewScreen} from 'app/utils/fullscreenNavigation.utils';
import {ThemeType} from 'app/types/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import BolusItemsRenderer from 'app/components/charts/CgmGraph/components/Bolus/BolusItemsRenderer';
import MultiBolusTooltip from 'app/components/charts/CgmGraph/components/Tooltips/MultiBolusTooltip';
import CombinedBgBolusTooltip from 'app/components/charts/CgmGraph/components/Tooltips/CombinedBgBolusTooltip';
import CombinedBgMultiBolusTooltip from 'app/components/charts/CgmGraph/components/Tooltips/CombinedBgMultiBolusTooltip';
import {addOpacity} from 'app/style/styling.utils';

import type {
  CgmGraphProps,
  CGMGraphExternalTooltipPayload,
} from './CgmGraph.types';
import {useCgmGraphTooltipModel} from './hooks/useCgmGraphTooltipModel';
import {
  buildExternalTooltipPayloadFromLocationX,
  clamp,
} from './utils/externalTooltipTouch.utils';

export type {CGMGraphExternalTooltipPayload} from './CgmGraph.types';

const StyledSvg = styled(Svg)`
  height: 100%;
  width: 100%;
`;

const CGMGraph: React.FC<CgmGraphProps> = ({
  bgSamples,
  width,
  height,
  foodItems,
  insulinData,
  xDomain,
  margin,
  xTickLabelFormatter,
  variant = 'default',
  showDateLabels = true,
  showYLabels = true,
  yTicksAmount = 6,
  interactive = true,
  testID,
  showFullScreenButton = true,
  tooltipMode = 'internal',
  onTooltipChange,
  cursorTimeMs,
}) => {
  const hasSamples = !!bgSamples?.length;

  const containerRef = useRef<View>(null);
  const lastExternalTooltipPayloadRef =
    useRef<CGMGraphExternalTooltipPayload | null>(null);

  const isCompactMealVariant =
    variant === 'compactMeal' ||
    variant === 'compactMealLight' ||
    variant === 'compactMealDark';

  const resolvedShowYLabels = isCompactMealVariant ? false : showYLabels;
  const resolvedYTicksAmount = isCompactMealVariant ? 4 : yTicksAmount;
  const resolvedInteractive = isCompactMealVariant ? false : interactive;

  const [graphStyleContextValue, setGraphStyleContextValue] =
    useGraphStyleContext(width, height, bgSamples, xDomain, margin);
  const touchContext = useTouchContext();
  const theme = useTheme() as ThemeType;
  const navigation = useNavigation();

  const {
    isTouchActive,
    touchPosition,
    handleTouchMove,
    handleTouchStart,
    handleTouchEnd,
  } = touchContext;

  const graphStyleProviderValue = useMemo<
    React.ContextType<typeof GraphStyleContext>
  >(
    () => [graphStyleContextValue, setGraphStyleContextValue],
    [graphStyleContextValue, setGraphStyleContextValue],
  );

  const xTouchPositionRaw =
    touchPosition.x - graphStyleContextValue.margin.left;
  const yTouchPosition = clamp(
    touchPosition.y - graphStyleContextValue.margin.top,
    0,
    Math.max(0, graphStyleContextValue.graphHeight),
  );

  const xTouchPosition = clamp(
    xTouchPositionRaw,
    0,
    Math.max(0, graphStyleContextValue.graphWidth),
  );

  const touchTimeMs = isTouchActive
    ? graphStyleContextValue.xScale.invert(xTouchPosition).getTime()
    : null;

  const {
    closestBgSample,
    cgmAnchorTimeMs,
    tooltipBolusEvents,
    tooltipCarbEvents,
    focusedFoodItemIds,
    focusedBolusTimestamps,
    showCombined,
    showCombinedMulti,
    showBgOnly,
    showBolusOnly,
  } = useCgmGraphTooltipModel({
    bgSamples,
    foodItems,
    insulinData,
    tooltipMode,
    cursorTimeMs,
    isTouchActive,
    touchTimeMs,
  });

  const fullScreenPayload = useMemo(
    () => ({
      mode: 'cgmGraph' as const,
      bgSamples,
      foodItems,
      insulinData,
    }),
    [bgSamples, foodItems, insulinData],
  );

  const openFullScreen = useMemo(() => {
    return () => {
      pushFullScreenViewScreen({navigation, payload: fullScreenPayload});
    };
  }, [fullScreenPayload, navigation]);
  const emitExternalTooltipFromEvent = useCallback(
    (event: any) => {
      if (tooltipMode !== 'external' || !onTooltipChange) {
        return;
      }

      const payload = buildExternalTooltipPayloadFromLocationX({
        rawX: event?.nativeEvent?.locationX,
        plotMarginLeft: graphStyleContextValue.margin.left,
        plotWidth: graphStyleContextValue.graphWidth,
        xScale: graphStyleContextValue.xScale,
      });
      if (!payload) {
        return;
      }

      lastExternalTooltipPayloadRef.current = payload;
      onTooltipChange(payload);
    },
    [
      graphStyleContextValue.graphWidth,
      graphStyleContextValue.margin.left,
      graphStyleContextValue.xScale,
      onTooltipChange,
      tooltipMode,
    ],
  );

  const handleTouchStartWithTooltip = useCallback(
    (event: any) => {
      if (tooltipMode !== 'external' || !onTooltipChange) {
        handleTouchStart(event);
        return;
      }

      handleTouchStart(event);
      emitExternalTooltipFromEvent(event);
    },
    [
      emitExternalTooltipFromEvent,
      handleTouchStart,
      onTooltipChange,
      tooltipMode,
    ],
  );

  const handleTouchMoveWithTooltip = useCallback(
    (event: any) => {
      if (tooltipMode !== 'external' || !onTooltipChange) {
        handleTouchMove(event);
        return;
      }

      handleTouchMove(event);
      emitExternalTooltipFromEvent(event);
    },
    [
      emitExternalTooltipFromEvent,
      handleTouchMove,
      onTooltipChange,
      tooltipMode,
    ],
  );

  const handleTouchEndWithTooltip = useCallback(() => {
    if (tooltipMode !== 'external' || !onTooltipChange) {
      handleTouchEnd();
      return;
    }

    handleTouchEnd();
    lastExternalTooltipPayloadRef.current = null;
    onTooltipChange(null);
  }, [handleTouchEnd, onTooltipChange, tooltipMode]);

  const handleTouchCancelWithTooltip = useCallback(() => {
    if (tooltipMode !== 'external' || !onTooltipChange) {
      handleTouchEnd();
      return;
    }

    handleTouchEnd();
    const lastPayload = lastExternalTooltipPayloadRef.current;
    if (lastPayload) {
      onTooltipChange({...lastPayload, autoHide: true});
    }
  }, [handleTouchEnd, onTooltipChange, tooltipMode]);

  const focusX =
    tooltipMode === 'external' && cgmAnchorTimeMs != null
      ? graphStyleContextValue.xScale(new Date(cgmAnchorTimeMs))
      : xTouchPosition;

  const shouldShowFocus =
    resolvedInteractive &&
    (tooltipMode === 'external' ? cgmAnchorTimeMs != null : isTouchActive) &&
    (tooltipMode === 'external' ||
      closestBgSample ||
      tooltipBolusEvents.length > 0);

  if (!hasSamples) {
    // For E2E we still want a stable anchor in the view hierarchy.
    // Rendering an empty container avoids flakiness when an account has no CGM data.
    return testID ? <View style={{width, height}} testID={testID} /> : null;
  }

  return (
    <GraphStyleContext.Provider value={graphStyleProviderValue}>
      <GraphContainer
        ref={containerRef}
        style={{width, height}}
        testID={testID}>
        <StyledSvg
          onTouchStart={
            resolvedInteractive ? handleTouchStartWithTooltip : undefined
          }
          onTouchMove={
            resolvedInteractive ? handleTouchMoveWithTooltip : undefined
          }
          onTouchEnd={
            resolvedInteractive ? handleTouchEndWithTooltip : undefined
          }
          onTouchCancel={
            resolvedInteractive ? handleTouchCancelWithTooltip : undefined
          }
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}>
          <Defs>
            <ClipPath id="cgmPlotClip">
              <Rect
                x={0}
                y={0}
                width={graphStyleContextValue.graphWidth}
                height={graphStyleContextValue.graphHeight}
              />
            </ClipPath>
          </Defs>

          <G
            x={graphStyleContextValue.margin?.left}
            y={graphStyleContextValue.margin?.top}>
            <XGridAndAxis
              xTickLabelFormatter={xTickLabelFormatter ?? undefined}
            />
            <YGridAndAxis
              highestBgThreshold={300}
              ticksAmount={resolvedYTicksAmount}
              showLabels={resolvedShowYLabels}
            />
            {showDateLabels ? <GraphDateDisplay /> : null}

            <G clipPath="url(#cgmPlotClip)">
              <CGMSamplesRenderer
                focusedSampleDateString={closestBgSample?.dateString}
              />
              <FoodItemsRenderer
                foodItems={foodItems}
                focusedFoodItemIds={focusedFoodItemIds}
              />
              <BolusItemsRenderer
                insulinData={insulinData}
                focusedBolusTimestamps={focusedBolusTimestamps}
              />
              {shouldShowFocus && (
                <>
                  <Line
                    x1={focusX}
                    y1="0"
                    x2={focusX}
                    y2={graphStyleContextValue.graphHeight}
                    stroke={addOpacity(theme.textColor, 0.55)}
                    strokeWidth={2}
                    opacity={1}
                  />
                  {tooltipMode === 'internal' ? (
                    <Line
                      x1="0"
                      y1={yTouchPosition}
                      x2={width}
                      y2={yTouchPosition}
                      stroke={theme.borderColor}
                      strokeWidth={1}
                      opacity={0.5}
                    />
                  ) : null}

                  {tooltipMode === 'internal' ? (
                    <>
                      {showCombinedMulti && (
                        <CombinedBgMultiBolusTooltip
                          x={xTouchPosition}
                          y={yTouchPosition}
                          bgSample={closestBgSample!}
                          bolusEvents={tooltipBolusEvents}
                          carbEvents={tooltipCarbEvents}
                        />
                      )}

                      {showBolusOnly && (
                        <MultiBolusTooltip
                          x={xTouchPosition}
                          y={yTouchPosition}
                          bolusEvents={tooltipBolusEvents}
                          carbEvents={tooltipCarbEvents}
                        />
                      )}

                      {showCombined && (
                        <CombinedBgBolusTooltip
                          x={xTouchPosition}
                          y={yTouchPosition}
                          bgSample={closestBgSample!}
                          bolusEvent={tooltipBolusEvents[0]}
                          carbEvents={tooltipCarbEvents}
                        />
                      )}

                      {showBgOnly && (
                        <SgvTooltip
                          x={xTouchPosition}
                          y={yTouchPosition}
                          bgSample={closestBgSample!}
                        />
                      )}
                    </>
                  ) : null}
                </>
              )}
            </G>
          </G>
        </StyledSvg>

        {showFullScreenButton ? (
          <FullScreenButtonOverlay>
            <FullScreenButton
              testID={E2E_TEST_IDS.charts.cgmGraphFullScreenButton}
              onPress={openFullScreen}
            />
          </FullScreenButtonOverlay>
        ) : null}
      </GraphContainer>
    </GraphStyleContext.Provider>
  );
};

const GraphContainer = styled.View`
  position: relative;
`;

const FullScreenButtonOverlay = styled.View`
  position: absolute;
  top: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  right: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  z-index: 100;
  elevation: 10;
`;

export default CGMGraph;
