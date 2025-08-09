import React, {useEffect, useRef, useState} from 'react';
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
import {TouchProvider, useTouchContext} from './contextStores/TouchContext';
import {FormattedFoodItemDTO} from 'app/types/food.types';
import {findClosestBgSample} from 'app/components/CgmGraph/utils';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import SgvTooltip from 'app/components/CgmGraph/components/Tooltips/SgvTooltip';
import BolusTooltip from 'app/components/CgmGraph/components/Tooltips/BolusTooltip';
import CombinedBgBolusTooltip from 'app/components/CgmGraph/components/Tooltips/CombinedBgBolusTooltip';
import MultiBolusTooltip from 'app/components/CgmGraph/components/Tooltips/MultiBolusTooltip';
import CombinedBgMultiBolusTooltip from 'app/components/CgmGraph/components/Tooltips/CombinedBgMultiBolusTooltip';
import BolusRenderer from './components/Bolus/BolusRenderer';
import {useClosestBgSample} from 'app/components/CgmGraph/hooks/useClosestBgSample';
import { CHART_COLORS, CHART_OPACITY } from 'app/components/shared/GlucoseChart';
import { InsulinDataEntry } from 'app/types/insulin.types';
import { findClosestBolus, findClosestBolusWithSpatialProximity, findBolusEventsInWindow } from './utils/bolusUtils';
import { BG_COMBINATION_WINDOW_MS } from './constants/bolusHoverConfig';

interface Props {
  bgSamples: BgSample[];
  foodItems: FormattedFoodItemDTO[] | null;
  insulinData?: InsulinDataEntry[];
  width: number;
  height: number;
}

const StyledSvg = styled(Svg)`
  height: 100%;
  width: 100%;
`;

const CGMGraph: React.FC<Props> = ({bgSamples, width, height, foodItems, insulinData = []}) => {
  const containerRef = useRef<View>(null);
  const [graphStyleContextValue, setGraphStyleContextValue] =
    useGraphStyleContext(width, height, bgSamples);
  const touchContext = useTouchContext();

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
    return null;
  }

  const xTouchPosition = touchPosition.x - graphStyleContextValue.margin.left;
  const yTouchPosition = touchPosition.y - graphStyleContextValue.margin.top;
  
  // Find closest BG sample and bolus for hover
  const touchTime = graphStyleContextValue.xScale.invert(xTouchPosition).getTime();
  
  const closestBgSample = isTouchActive
    ? findClosestBgSample(touchTime, bgSamples)
    : null;
    
  // Find all bolus events within the configurable detection window (5 minutes by default)
  const nearbyBolusEvents = isTouchActive && insulinData.length > 0
    ? findBolusEventsInWindow(
        xTouchPosition,
        yTouchPosition, 
        touchTime,
        insulinData,
        graphStyleContextValue.xScale,
        graphStyleContextValue.yScale
      )
    : [];
    
  // Get closest single bolus for legacy compatibility
  const closestBolus = nearbyBolusEvents.length > 0 ? nearbyBolusEvents[0] : null;
  
  // Determine which tooltip to show based on proximity and available data
  let showBgTooltip = false;
  let showBolusTooltip = false;
  let showCombinedTooltip = false;
  let showMultiBolusTooltip = false;
  let showCombinedMultiBolusTooltip = false;
  
  if (closestBgSample && nearbyBolusEvents.length > 0) {
    // Both BG and bolus events available - ALWAYS show them together
    // User wants to see BG + bolus events combined, not hidden
    if (nearbyBolusEvents.length > 1) {
      // Multiple bolus events - show BG + multi-bolus
      showCombinedMultiBolusTooltip = true;
    } else {
      // Single bolus event - show BG + single bolus  
      showCombinedTooltip = true;
    }
  } else if (closestBgSample && nearbyBolusEvents.length === 0) {
    // Only BG available
    showBgTooltip = true;
  } else if (nearbyBolusEvents.length > 1) {
    // Multiple bolus events, no BG
    showMultiBolusTooltip = true;
  } else if (nearbyBolusEvents.length === 1) {
    // Single bolus event, no BG
    showBolusTooltip = true;
  }

  return (
    <GraphStyleContext.Provider
      value={[graphStyleContextValue, setGraphStyleContextValue]}>
      <View ref={containerRef} style={{width, height}}>
        <StyledSvg
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}>            
          <G transform={`translate(${graphStyleContextValue.margin?.left}, ${graphStyleContextValue.margin?.top})`}>
            {/* Render grid FIRST so it appears behind data */}
            <XGridAndAxis />
            <YGridAndAxis highestBgThreshold={300} />
            
            {/* Then render data on top of grid */}
            <GraphDateDisplay />
            <CGMSamplesRenderer
              focusedSampleDateString={closestBgSample?.dateString}
            />
            <FoodItemsRenderer foodItems={foodItems} />
            
            {/* Render bolus events */}
            {insulinData && insulinData.length > 0 && (
              <BolusRenderer insulinData={insulinData} />
            )}
            
            {isTouchActive && (closestBgSample || nearbyBolusEvents.length > 0) && (
              <>
                <Line
                  x1={xTouchPosition}
                  y1="0"
                  x2={xTouchPosition}
                  y2={height}
                  stroke={CHART_COLORS.textSecondary}
                  strokeWidth={1}
                  opacity={CHART_OPACITY.light}
                />
                <Line
                  x1="0"
                  y1={yTouchPosition}
                  x2={width}
                  y2={yTouchPosition}
                  stroke={CHART_COLORS.textSecondary}
                  strokeWidth={1}
                  opacity={CHART_OPACITY.medium}
                />
                
                {/* Show tooltips based on proximity and available data */}
                {showCombinedMultiBolusTooltip && (
                  <CombinedBgMultiBolusTooltip
                    x={xTouchPosition}
                    y={yTouchPosition}
                    bgSample={closestBgSample!}
                    bolusEvents={nearbyBolusEvents}
                    chartWidth={graphStyleContextValue.width}
                  />
                )}
                
                {showMultiBolusTooltip && (
                  <MultiBolusTooltip
                    x={xTouchPosition}
                    y={yTouchPosition}
                    bolusEvents={nearbyBolusEvents}
                    chartWidth={graphStyleContextValue.width}
                  />
                )}
                
                {showCombinedTooltip && (
                  <CombinedBgBolusTooltip
                    x={xTouchPosition}
                    y={yTouchPosition}
                    bgSample={closestBgSample!}
                    bolusEvent={closestBolus!}
                    chartWidth={graphStyleContextValue.width}
                  />
                )}
                
                {showBgTooltip && (
                  <SgvTooltip
                    x={xTouchPosition}
                    y={yTouchPosition}
                    bgSample={closestBgSample!}
                  />
                )}
                
                {showBolusTooltip && (
                  <BolusTooltip
                    x={xTouchPosition}
                    y={yTouchPosition}
                    bolusEvent={closestBolus!}
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
