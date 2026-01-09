import React, {useMemo, useRef} from 'react';
import {View} from 'react-native';
import Svg, {G, Line} from 'react-native-svg';
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
import {StackActions, useNavigation} from '@react-navigation/native';
import {FULL_SCREEN_VIEW_SCREEN} from 'app/constants/SCREEN_NAMES';
import {dispatchToParentOrSelf} from 'app/utils/navigationDispatch.utils';
import {ThemeType} from 'app/types/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import BolusItemsRenderer from 'app/components/charts/CgmGraph/components/Bolus/BolusItemsRenderer';
import MultiBolusTooltip from 'app/components/charts/CgmGraph/components/Tooltips/MultiBolusTooltip';
import CombinedBgBolusTooltip from 'app/components/charts/CgmGraph/components/Tooltips/CombinedBgBolusTooltip';
import CombinedBgMultiBolusTooltip from 'app/components/charts/CgmGraph/components/Tooltips/CombinedBgMultiBolusTooltip';
import {addOpacity} from 'app/style/styling.utils';

import type {CgmGraphProps, CGMGraphExternalTooltipPayload} from './CgmGraph.types';
import {useCgmGraphTooltipModel} from './hooks/useCgmGraphTooltipModel';
import {
  clamp,
  computeTouchTimeMsFromLocationX,
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
  testID,
  showFullScreenButton = true,
  tooltipMode = 'internal',
  onTooltipChange,
  cursorTimeMs,
}) => {
  if (!bgSamples || bgSamples.length === 0) {
    // For E2E we still want a stable anchor in the view hierarchy.
    // Rendering an empty container avoids flakiness when an account has no CGM data.
    return testID ? <View style={{width, height}} testID={testID} /> : null;
  }

  const containerRef = useRef<View>(null);
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

  const graphStyleProviderValue = useMemo(
    () => [graphStyleContextValue, setGraphStyleContextValue] as const,
    [graphStyleContextValue, setGraphStyleContextValue],
  );

  const xTouchPositionRaw = touchPosition.x - graphStyleContextValue.margin.left;
  const yTouchPosition = touchPosition.y - graphStyleContextValue.margin.top;

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
    const action = StackActions.push(FULL_SCREEN_VIEW_SCREEN, fullScreenPayload);
    return () => {
      dispatchToParentOrSelf({
        navigation,
        action,
        fallbackNavigate: () =>
          (navigation as any).navigate?.(FULL_SCREEN_VIEW_SCREEN, fullScreenPayload),
      });
    };
  }, [fullScreenPayload, navigation]);
  const handleTouchStartWithTooltip = useMemo(() => {
    if (tooltipMode !== 'external' || !onTooltipChange) {
      return handleTouchStart;
    }

    return (event: any) => {
      handleTouchStart(event);

      const rawX = event?.nativeEvent?.locationX;
      const t = computeTouchTimeMsFromLocationX({
        rawX,
        plotMarginLeft: graphStyleContextValue.margin.left,
        plotWidth: graphStyleContextValue.graphWidth,
        xScale: graphStyleContextValue.xScale,
      });
      if (t == null) return;

      // In external mode we emit the raw touch time; the parent can snap it.
      onTooltipChange({touchTimeMs: t, anchorTimeMs: t});
    };
  }, [graphStyleContextValue.graphWidth, graphStyleContextValue.margin.left, graphStyleContextValue.xScale, handleTouchStart, onTooltipChange, tooltipMode]);

  const handleTouchMoveWithTooltip = useMemo(() => {
    if (tooltipMode !== 'external' || !onTooltipChange) {
      return handleTouchMove;
    }

    return (event: any) => {
      handleTouchMove(event);

      const rawX = event?.nativeEvent?.locationX;
      const t = computeTouchTimeMsFromLocationX({
        rawX,
        plotMarginLeft: graphStyleContextValue.margin.left,
        plotWidth: graphStyleContextValue.graphWidth,
        xScale: graphStyleContextValue.xScale,
      });
      if (t == null) return;

      onTooltipChange({touchTimeMs: t, anchorTimeMs: t});
    };
  }, [graphStyleContextValue.graphWidth, graphStyleContextValue.margin.left, graphStyleContextValue.xScale, handleTouchMove, onTooltipChange, tooltipMode]);

  const handleTouchEndWithTooltip = useMemo(() => {
    if (tooltipMode !== 'external' || !onTooltipChange) {
      return handleTouchEnd;
    }

    return () => {
      handleTouchEnd();
      onTooltipChange(null);
    };
  }, [handleTouchEnd, onTooltipChange, tooltipMode]);

  const focusX =
    tooltipMode === 'external' && cgmAnchorTimeMs != null
      ? graphStyleContextValue.xScale(new Date(cgmAnchorTimeMs))
      : xTouchPosition;

  const shouldShowFocus =
    isTouchActive && (tooltipMode === 'external' || closestBgSample || tooltipBolusEvents.length > 0);

  return (
    <GraphStyleContext.Provider value={graphStyleProviderValue}>
      <GraphContainer ref={containerRef} style={{width, height}} testID={testID}>
        <StyledSvg
          onTouchStart={handleTouchStartWithTooltip}
          onTouchMove={handleTouchMoveWithTooltip}
          onTouchEnd={handleTouchEndWithTooltip}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}>
          <G
            x={graphStyleContextValue.margin?.left}
            y={graphStyleContextValue.margin?.top}>
            <XGridAndAxis />
            <YGridAndAxis highestBgThreshold={300} />
            <GraphDateDisplay />
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
