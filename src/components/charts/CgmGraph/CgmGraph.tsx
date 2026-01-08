import React, {useEffect, useMemo, useRef} from 'react';
import {View} from 'react-native';
import Svg, {G, Line} from 'react-native-svg';
import styled from 'styled-components/native';
import {BgSample} from 'app/types/day_bgs.types';
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
import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import {findClosestBgSample} from 'app/components/charts/CgmGraph/utils';
import SgvTooltip from 'app/components/charts/CgmGraph/components/Tooltips/SgvTooltip';
import {useTheme} from 'styled-components/native';
import FullScreenButton from 'app/components/common-ui/FullScreenButton/FullScreenButton';
import {StackActions, useNavigation} from '@react-navigation/native';
import {FULL_SCREEN_VIEW_SCREEN} from 'app/constants/SCREEN_NAMES';
import {ThemeType} from 'app/types/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {InsulinDataEntry} from 'app/types/insulin.types';
import BolusItemsRenderer from 'app/components/charts/CgmGraph/components/Bolus/BolusItemsRenderer';
import {
  findBolusEventsInTooltipWindow,
  findClosestBolus,
} from 'app/components/charts/CgmGraph/utils/bolusUtils';
import MultiBolusTooltip from 'app/components/charts/CgmGraph/components/Tooltips/MultiBolusTooltip';
import CombinedBgBolusTooltip from 'app/components/charts/CgmGraph/components/Tooltips/CombinedBgBolusTooltip';
import CombinedBgMultiBolusTooltip from 'app/components/charts/CgmGraph/components/Tooltips/CombinedBgMultiBolusTooltip';
import {
  findCarbEventsInTooltipWindow,
  findClosestCarbEvent,
} from 'app/components/charts/CgmGraph/utils/carbsUtils';
import {addOpacity} from 'app/style/styling.utils';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

interface Props {
  bgSamples: BgSample[];
  foodItems: Array<FoodItemDTO | formattedFoodItemDTO> | null;
  insulinData?: InsulinDataEntry[];
  width: number;
  height: number;

  /**
   * Optional margin override so stacked charts can share exact x-axis alignment.
   */
  margin?: {top: number; right: number; bottom: number; left: number};

  /**
   * Optional override for the x-axis time domain.
   *
   * When not provided, the domain is derived from the BG sample extent.
   */
  xDomain?: [Date, Date] | null;
  
  /**
   * Optional E2E selector.
   *
   * We keep this optional so the chart can be reused in lists/cards without forcing unique IDs.
   */
  testID?: string;

  /**
   * Whether to show the fullscreen button.
   * Defaults to true.
   */
  showFullScreenButton?: boolean;

  /**
   * Tooltip rendering mode.
   * - internal: render the SVG tooltip inside this chart (default)
   * - external: suppress internal tooltip; emit tooltip info via `onTooltipChange`
   */
  tooltipMode?: 'internal' | 'external';

  /**
   * When `tooltipMode="external"`, emits tooltip timing info so a parent can
   * render a single unified tooltip for multiple charts.
   */
  onTooltipChange?: (payload: CGMGraphExternalTooltipPayload | null) => void;

  /**
   * Optional external cursor time (ms).
   *
   * When provided together with `tooltipMode="external"`, this becomes the single
   * source of truth for the vertical focus line and focused marker windows.
   *
   * Why:
   * - Stacked charts (Home) want one shared cursor time so all charts align.
   * - This also prevents a 1-render lag that can happen when the parent derives
   *   cursor state from a callback that runs after render.
   */
  cursorTimeMs?: number | null;
}

export type CGMGraphExternalTooltipPayload = {
  touchTimeMs: number;
  anchorTimeMs: number;
};

const StyledSvg = styled(Svg)`
  height: 100%;
  width: 100%;
`;

const CGMGraph: React.FC<Props> = ({
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

  const closestBgSample =
    isTouchActive && touchTimeMs != null
      ? findClosestBgSample(touchTimeMs, bgSamples)
      : null;

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
      const parent = (navigation as any)?.getParent?.();
      if (parent?.dispatch) {
        parent.dispatch(action);
        return;
      }
      if ((navigation as any)?.dispatch) {
        (navigation as any).dispatch(action);
        return;
      }
      (navigation as any).navigate?.(FULL_SCREEN_VIEW_SCREEN, fullScreenPayload);
    };
  }, [fullScreenPayload, navigation]);

  if (!bgSamples || bgSamples.length === 0) {
    // For E2E we still want a stable anchor in the view hierarchy.
    // Rendering an empty container avoids flakiness when an account has no CGM data.
    return testID ? <View style={{width, height}} testID={testID} /> : null;
  }

  const shouldUseExternalCursor = tooltipMode === 'external' && cursorTimeMs != null;

  const closestBolus = useMemo(() => {
    // In external mode, cursor snapping/windowing is expected to be driven by the parent.
    if (shouldUseExternalCursor) return null;
    if (!isTouchActive || touchTimeMs == null) return null;
    if (!insulinData?.length) return null;
    return findClosestBolus(touchTimeMs, insulinData);
  }, [insulinData, isTouchActive, shouldUseExternalCursor, touchTimeMs]);

  const closestCarb = useMemo(() => {
    if (shouldUseExternalCursor) return null;
    if (!isTouchActive || touchTimeMs == null) return null;
    if (!foodItems?.length) return null;
    return findClosestCarbEvent(touchTimeMs, foodItems);
  }, [foodItems, isTouchActive, shouldUseExternalCursor, touchTimeMs]);

  const anchorTimeMs = useMemo(() => {
    if (!isTouchActive) return null;
    if (touchTimeMs == null) return null;

    if (shouldUseExternalCursor) {
      return cursorTimeMs as number;
    }

    if (closestBolus?.timestamp != null) {
      const t = new Date(closestBolus.timestamp).getTime();
      return Number.isFinite(t) ? t : touchTimeMs;
    }
    if (closestCarb?.timestamp != null) {
      return closestCarb.timestamp;
    }
    return touchTimeMs;
  }, [closestBolus?.timestamp, closestCarb?.timestamp, cursorTimeMs, isTouchActive, shouldUseExternalCursor, touchTimeMs]);

  const tooltipBolusEvents = useMemo(() => {
    if (!isTouchActive) return [];
    if (anchorTimeMs == null) return [];
    if (!insulinData?.length) return [];

    return findBolusEventsInTooltipWindow({
      anchorTimeMs,
      insulinData,
    });
  }, [anchorTimeMs, insulinData, isTouchActive]);

  const tooltipCarbEvents = useMemo(() => {
    if (!isTouchActive) return [];
    if (!foodItems?.length) return [];

    if (anchorTimeMs == null) return [];

    return findCarbEventsInTooltipWindow({anchorTimeMs, foodItems});
  }, [anchorTimeMs, foodItems, isTouchActive]);

  // Avoid prop identity churn during touch-move renders.
  const focusedFoodItemIds = useMemo(
    () => tooltipCarbEvents.map(c => c.id),
    [tooltipCarbEvents],
  );

  const focusedBolusTimestamps = useMemo(
    () => tooltipBolusEvents.map(b => b.timestamp),
    [tooltipBolusEvents],
  );

  const handleTouchStartWithTooltip = useMemo(() => {
    if (tooltipMode !== 'external' || !onTooltipChange) {
      return handleTouchStart;
    }

    return (event: any) => {
      handleTouchStart(event);

      const rawX = event?.nativeEvent?.locationX;
      if (typeof rawX !== 'number' || !Number.isFinite(rawX)) return;

      const localX = clamp(
        rawX - graphStyleContextValue.margin.left,
        0,
        Math.max(0, graphStyleContextValue.graphWidth),
      );
      const t = graphStyleContextValue.xScale.invert(localX).getTime();
      if (!Number.isFinite(t)) return;

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
      if (typeof rawX !== 'number' || !Number.isFinite(rawX)) return;

      const localX = clamp(
        rawX - graphStyleContextValue.margin.left,
        0,
        Math.max(0, graphStyleContextValue.graphWidth),
      );
      const t = graphStyleContextValue.xScale.invert(localX).getTime();
      if (!Number.isFinite(t)) return;

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

  const showCombined = !!closestBgSample && tooltipBolusEvents.length === 1;
  const showCombinedMulti = !!closestBgSample && tooltipBolusEvents.length > 1;
  const showBgOnly = !!closestBgSample && tooltipBolusEvents.length === 0;
  const showBolusOnly = !closestBgSample && tooltipBolusEvents.length > 0;

  const focusX =
    tooltipMode === 'external' && anchorTimeMs != null
      ? graphStyleContextValue.xScale(new Date(anchorTimeMs))
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
