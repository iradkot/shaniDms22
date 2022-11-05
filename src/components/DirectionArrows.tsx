// a tsx component that gets a bg trendDirection and returns an arrow
//
// Language: typescript
// Path: src/containers/MainTabsNavigator/Containers/Home/components/DirectionArrows.tsx
import React from 'react';
import styled from 'styled-components/native';

// styled sharp arrow component (get a size and trendDirection props)
// it gets a trendDirection and rotates the arrow accordingly
// if flat - arrow should be straight to the right
// if doubleUp - arrow should be straight up and duplicated
// if singleUp - arrow should be straight up
// if fortyFiveUp - arrow should be diagonal up and to the right
// if flat - arrow should be straight to the right
// if fortyFiveDown - arrow should be diagonal down and to the right
// if singleDown - arrow should be straight down
// if doubleDown - arrow should be straight down and duplicated
// if notComputable - arrow should be straight to the right
// if rateOutOfRange - arrow should be straight to the right
// if null - arrow should be straight to the right
const defaultArrowSize = 20;
// @ts-ignore
const Arrow = styled.View`
  width: 0;
  height: 0;
  border-left-width: ${(props: {size: number}) =>
    props.size || defaultArrowSize}px;
  border-left-color: transparent;
  border-right-width: ${(props: {size: number}) =>
    props.size || defaultArrowSize}px;
  border-right-color: transparent;
  border-bottom-width: ${(props: {size: number}) =>
    props.size || defaultArrowSize}px;
  border-bottom-color: black;
  transform: ${(props: {trendDirection: string}) => {
    switch (props.trendDirection) {
      case 'DoubleUp':
      case 'SingleUp':
        return 'rotate(0deg)';
      case 'FortyFiveUp':
        return 'rotate(45deg)';
      case 'Flat':
        return 'rotate(90deg)';
      case 'FortyFiveDown':
        return 'rotate(135deg)';
      case 'SingleDown':
      case 'DoubleDown':
        return 'rotate(180deg)';
      case 'NotComputable':
      case 'RateOutOfRange':
        return 'rotate(90deg)';
      default:
        return 'rotate(90deg)';
    }
  }};
`;

const ArrowContainer = styled.View`
  flex-direction: row;
  justify-content: center;
  align-items: center;
`;

const DirectionArrows = ({trendDirection}: {trendDirection: string}) => {
  // if trendDirection is doubleUp or doubleDown - duplicate the arrow
  if (trendDirection === 'DoubleUp' || trendDirection === 'DoubleDown') {
    return (
      <ArrowContainer>
        <Arrow trendDirection={trendDirection} />
        <Arrow trendDirection={trendDirection} />
      </ArrowContainer>
    );
  }
  return (
    <ArrowContainer>
      <Arrow trendDirection={trendDirection} />
    </ArrowContainer>
  );
};

export default DirectionArrows;
