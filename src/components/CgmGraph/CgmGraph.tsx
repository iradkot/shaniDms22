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
import Tooltip from './components/Tooltip';
import {
  GraphStyleContext,
  useGraphStyleContext,
} from './contextStores/GraphStyleContext';
import {TouchProvider, useTouchContext} from './contextStores/TouchContext';
import {formattedFoodItemDTO} from 'app/types/food.types';
import {findClosestBgSample} from 'app/components/CgmGraph/utils';

interface Props {
  bgSamples: BgSample[];
  foodItems: formattedFoodItemDTO[] | null;
  width: number;
  height: number;
}

const StyledSvg = styled(Svg)`
  height: 100%;
  width: 100%;
`;

const CGMGraph: React.FC<Props> = ({bgSamples, width, height, foodItems}) => {
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

  const closestBgSample = isTouchActive
    ? findClosestBgSample(
        touchPosition.x - graphStyleContextValue.margin.left,
        bgSamples,
      )
    : null;
  console.log({bgSamples});

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
          <G
            x={graphStyleContextValue.margin.left}
            y={graphStyleContextValue.margin.top}>
            <GraphDateDisplay />
            <CGMSamplesRenderer />
            <XGridAndAxis />
            <YGridAndAxis highestBgThreshold={300} />
            <FoodItemsRenderer foodItems={foodItems} />
            {isTouchActive && closestBgSample && (
              <>
                <Line
                  x1={touchPosition.x}
                  y1="0"
                  x2={touchPosition.x}
                  y2={height}
                  stroke="black"
                  strokeWidth={1}
                  opacity={0.2}
                />
                <Line
                  x1="0"
                  y1={touchPosition.y}
                  x2={width}
                  y2={touchPosition.y}
                  stroke="grey"
                  strokeWidth={1}
                  opacity={0.5}
                />
                <Tooltip
                  x={touchPosition.x - graphStyleContextValue.margin.left}
                  y={touchPosition.y - graphStyleContextValue.margin.top}
                  value={closestBgSample.sgv}
                />
              </>
            )}
          </G>
        </StyledSvg>
      </View>
    </GraphStyleContext.Provider>
  );
};

export default CGMGraph;
