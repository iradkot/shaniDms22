import Svg, {G} from 'react-native-svg';
import React, {useEffect, useRef} from 'react';
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

interface Props {
  bgSamples: BgSample[];
  foodItems: formattedFoodItemDTO[] | null;
  width: number;
  height: number;
}

const StyledSvg = styled(Svg)`
  height: 100%;
  width: 100%;
  viewbox: '0 0 100 100';
`;

const CGMGraph: React.FC<Props> = ({bgSamples, width, height, foodItems}) => {
  // The highest BG threshold is the highest BG value that we want to show on the graph,
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

  if (!bgSamples?.length) {
    return null;
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
        </StyledSvg>
      </View>
    </GraphStyleContext.Provider>
  );
};

export default CGMGraph;
