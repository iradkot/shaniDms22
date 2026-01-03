import React, {useEffect, useRef} from 'react';
import {View} from 'react-native';
import Svg, {G, Line} from 'react-native-svg';
import styled from 'styled-components/native';
import {BgSample} from 'app/types/day_bgs.types';
import XGridAndAxis from './components/XGridAndAxis';
import YGridAndAxis from './components/YGridAndAxis';
import CGMSamplesRenderer from './components/CGMSamplesRenderer';
import GraphDateDisplay from './components/GraphDateDisplay';
import FoodItemsRenderer from './components/Food/FoodItemsRenderer';
import Tooltip from './components/Tooltips/Tooltip';
import {
  GraphStyleContext,
  useGraphStyleContext,
} from './contextStores/GraphStyleContext';
import {TouchProvider, useTouchContext} from './contextStores/TouchContext';
import {formattedFoodItemDTO} from 'app/types/food.types';
import {findClosestBgSample} from 'app/components/charts/CgmGraph/utils';
import SgvTooltip from 'app/components/charts/CgmGraph/components/Tooltips/SgvTooltip';
import {useClosestBgSample} from 'app/components/charts/CgmGraph/hooks/useClosestBgSample';
import {useTheme} from 'styled-components/native';
import {ThemeType} from 'app/types/theme';
import {InsulinDataEntry} from 'app/types/insulin.types';
import BolusItemsRenderer from 'app/components/charts/CgmGraph/components/Bolus/BolusItemsRenderer';
import {findBolusEventsInWindow} from 'app/components/charts/CgmGraph/utils/bolusUtils';
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
   * Optional E2E selector.
   *
   * We keep this optional so the chart can be reused in lists/cards without forcing unique IDs.
   */
  testID?: string;
}

const StyledSvg = styled(Svg)`
  height: 100%;
  width: 100%;
`;

const CGMGraph: React.FC<Props> = ({bgSamples, width, height, foodItems, insulinData, testID}) => {
  const containerRef = useRef<View>(null);
  const [graphStyleContextValue, setGraphStyleContextValue] =
    useGraphStyleContext(width, height, bgSamples);
  const touchContext = useTouchContext();
  const theme = useTheme() as ThemeType;

  const {
    isTouchActive,
    touchPosition,
    handleTouchMove,
    handleTouchStart,
    handleTouchEnd,
  } = touchContext;

  useEffect(() => {
    setGraphStyleContextValue({
      ...graphStyleContextValue,
      width,
      height,
      bgSamples,
    });
  }, [width, height, bgSamples]);

  if (!bgSamples || bgSamples.length === 0) {
    // For E2E we still want a stable anchor in the view hierarchy.
    // Rendering an empty container avoids flakiness when an account has no CGM data.
    return testID ? <View style={{width, height}} testID={testID} /> : null;
  }

  const xTouchPosition = touchPosition.x - graphStyleContextValue.margin.left;
  const yTouchPosition = touchPosition.y - graphStyleContextValue.margin.top;

  const touchTimeMs = isTouchActive
    ? graphStyleContextValue.xScale.invert(xTouchPosition).getTime()
    : null;

  const closestBgSample =
    isTouchActive && touchTimeMs != null
      ? findClosestBgSample(touchTimeMs, bgSamples)
      : null;

  const nearbyBolusEvents =
    isTouchActive && touchTimeMs != null && insulinData?.length
      ? findBolusEventsInWindow({
          touchX: xTouchPosition,
          touchY: yTouchPosition,
          touchTimeMs,
          insulinData,
          xScale: graphStyleContextValue.xScale,
          yScale: graphStyleContextValue.yScale,
        })
      : [];

  const showCombined = !!closestBgSample && nearbyBolusEvents.length === 1;
  const showCombinedMulti = !!closestBgSample && nearbyBolusEvents.length > 1;
  const showBgOnly = !!closestBgSample && nearbyBolusEvents.length === 0;
  const showBolusOnly = !closestBgSample && nearbyBolusEvents.length > 0;

  return (
    <GraphStyleContext.Provider
      value={[graphStyleContextValue, setGraphStyleContextValue]}>
      <View ref={containerRef} style={{width, height}} testID={testID}>
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
            <BolusItemsRenderer insulinData={insulinData} />
            {isTouchActive && (closestBgSample || nearbyBolusEvents.length > 0) && (
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
                    bolusEvents={nearbyBolusEvents}
                  />
                )}

                {showBolusOnly && (
                  <MultiBolusTooltip
                    x={xTouchPosition}
                    y={yTouchPosition}
                    bolusEvents={nearbyBolusEvents}
                  />
                )}

                {showCombined && (
                  <CombinedBgBolusTooltip
                    x={xTouchPosition}
                    y={yTouchPosition}
                    bgSample={closestBgSample!}
                    bolusEvent={nearbyBolusEvents[0]}
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
      </View>
    </GraphStyleContext.Provider>
  );
};

export default CGMGraph;
