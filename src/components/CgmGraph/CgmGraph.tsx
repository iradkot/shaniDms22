import Svg, {G, Line} from 'react-native-svg';
import React, {useEffect, useRef, useState} from 'react';
import {View} from 'react-native';
import styled from 'styled-components';
import {BgSample} from 'app/types/day_bgs';
import XGridAndAxis from 'app/components/CgmGraph/components/XGridAndAxis';
import YGridAndAxis from 'app/components/CgmGraph/components/YGridAndAxis';
import CGMSamplesRenderer from 'app/components/CgmGraph/components/CGMSamplesRenderer';
import GraphDateDisplay from './components/GraphDateDisplay';
import {formattedFoodItemDTO} from 'app/types/food.types';
import FoodItemsRenderer from 'app/components/CgmGraph/components/Food/FoodItemsRenderer';
import {
  GraphStyleContext,
  useGraphStyleContext,
} from 'app/components/CgmGraph/contextStores/GraphStyleContext';
import Tooltip from 'app/components/CgmGraph/components/Tooltip';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';

interface Props {
  bgSamples: BgSample[];
  foodItems: formattedFoodItemDTO[] | null;
  width: number;
  height: number;
}

const StyledSvg = styled(Svg)`
  height: 100%;
  width: 100%;
  viewbox: '0 0 100 100'; // Corrected here
`;

const CGMGraph: React.FC<Props> = ({bgSamples, width, height, foodItems}) => {
  const [isTouchActive, setIsTouchActive] = useState(false);
  const [touchPosition, setTouchPosition] = useState({x: 0, y: 0});

  const handleTouchStart = event => {
    const {locationX, locationY} = event.nativeEvent;
    setIsTouchActive(true);
    // No need to adjust locationX here, as it will be adjusted in getBgValueAtPosition
    setTouchPosition({x: locationX, y: locationY});
  };

  const handleTouchMove = event => {
    const {locationX, locationY} = event.nativeEvent;
    // No need to adjust locationX here, as it will be adjusted in getBgValueAtPosition
    setTouchPosition({x: locationX, y: locationY});
  };

  const handleTouchEnd = () => {
    setIsTouchActive(false);
  };

  // highestBgThreshold: the highest BG value that we want to show on the graph,
  // this will affect the y-axis scale,
  // which should be from 0 to highestBgThreshold
  const highestBgThreshold = 300;
  const containerRef = useRef<View>(null);

  const [graphStyleContextValue, setGraphStyleContextValue] =
    useGraphStyleContext(width, height, bgSamples);

  const {margin} = graphStyleContextValue;

  useEffect(() => {
    setGraphStyleContextValue({
      ...graphStyleContextValue,
      width,
      height,
      bgSamples,
    });
  }, [width, height, bgSamples]);

  if (!bgSamples || bgSamples.length === 0) {
    return null; // Or render a placeholder/error component
  }

  return (
    <GraphStyleContext.Provider
      value={[graphStyleContextValue, setGraphStyleContextValue]}>
      <View
        ref={containerRef}
        style={{
          width,
          height,
        }}>
        <StyledSvg
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          width={width}
          height={height}
          pointerEvents="none"
          x={0}
          y={0}
          viewBox={`0 0 ${width} ${height}`}>
          <G x={margin?.left} y={margin?.top}>
            <GraphDateDisplay />
            <CGMSamplesRenderer />
            <XGridAndAxis />
            <YGridAndAxis highestBgThreshold={highestBgThreshold} />
            <FoodItemsRenderer foodItems={foodItems} />
          </G>
          {isTouchActive && (
            <>
              <Line
                x1={touchPosition.x}
                y1="0"
                x2={touchPosition.x}
                y2={height}
                stroke="black" // Example style
                strokeWidth={1} // Example style
                opacity={0.2} // Example style
              />
              <Line
                x1="0"
                y1={touchPosition.y}
                x2={width}
                y2={touchPosition.y}
                stroke="grey" // Example style
                strokeWidth={1} // Example style
                opacity={0.5} // Example style
              />
              <Tooltip
                x={touchPosition.x}
                y={touchPosition.y}
                value={getBgValueAtPosition(touchPosition)}
              />
            </>
          )}
        </StyledSvg>
      </View>
    </GraphStyleContext.Provider>
  );
};

export default CGMGraph;
