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
import {formattedFoodItemDTO} from 'app/types/food.types';
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

interface Props {
  bgSamples: BgSample[];
  foodItems: formattedFoodItemDTO[] | null;
  insulinData?: InsulinDataEntry[];
  width: number;
  height: number;

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
}

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
  testID,
  showFullScreenButton = true,
}) => {
  const containerRef = useRef<View>(null);
  const [graphStyleContextValue, setGraphStyleContextValue] =
    useGraphStyleContext(width, height, bgSamples, xDomain);
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

  useEffect(() => {
    setGraphStyleContextValue(prev => ({
      ...prev,
      width,
      height,
      bgSamples,
    }));
  }, [width, height, bgSamples, setGraphStyleContextValue]);

  const xTouchPosition = touchPosition.x - graphStyleContextValue.margin.left;
  const yTouchPosition = touchPosition.y - graphStyleContextValue.margin.top;

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

  const closestBolus =
    isTouchActive && touchTimeMs != null && insulinData?.length
      ? findClosestBolus(touchTimeMs, insulinData)
      : null;

  const tooltipBolusEvents =
    closestBolus && insulinData?.length
      ? findBolusEventsInTooltipWindow({
          anchorTimeMs: new Date(closestBolus.timestamp).getTime(),
          insulinData,
        })
      : [];

  const showCombined = !!closestBgSample && tooltipBolusEvents.length === 1;
  const showCombinedMulti = !!closestBgSample && tooltipBolusEvents.length > 1;
  const showBgOnly = !!closestBgSample && tooltipBolusEvents.length === 0;
  const showBolusOnly = !closestBgSample && tooltipBolusEvents.length > 0;

  return (
    <GraphStyleContext.Provider
      value={[graphStyleContextValue, setGraphStyleContextValue]}>
      <GraphContainer ref={containerRef} style={{width, height}} testID={testID}>
        <StyledSvg
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
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
            <FoodItemsRenderer foodItems={foodItems} />
            <BolusItemsRenderer
              insulinData={insulinData}
              focusedBolusTimestamps={tooltipBolusEvents.map(b => b.timestamp)}
            />
            {isTouchActive && (closestBgSample || tooltipBolusEvents.length > 0) && (
              <>
                <Line
                  x1={xTouchPosition}
                  y1="0"
                  x2={xTouchPosition}
                  y2={height}
                  stroke={theme.borderColor}
                  strokeWidth={1}
                  opacity={0.2}
                />
                <Line
                  x1="0"
                  y1={yTouchPosition}
                  x2={width}
                  y2={yTouchPosition}
                  stroke={theme.borderColor}
                  strokeWidth={1}
                  opacity={0.5}
                />

                {showCombinedMulti && (
                  <CombinedBgMultiBolusTooltip
                    x={xTouchPosition}
                    y={yTouchPosition}
                    bgSample={closestBgSample!}
                    bolusEvents={tooltipBolusEvents}
                  />
                )}

                {showBolusOnly && (
                  <MultiBolusTooltip
                    x={xTouchPosition}
                    y={yTouchPosition}
                    bolusEvents={tooltipBolusEvents}
                  />
                )}

                {showCombined && (
                  <CombinedBgBolusTooltip
                    x={xTouchPosition}
                    y={yTouchPosition}
                    bgSample={closestBgSample!}
                    bolusEvent={tooltipBolusEvents[0]}
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
