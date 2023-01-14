import React from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {TrendDirectionString} from 'app/types/notifications';

const trendDirectionToRotation: {[key in TrendDirectionString]: number} = {
  DoubleUp: 0,
  SingleUp: 0,
  FortyFiveUp: 45,
  Flat: 90,
  FortyFiveDown: 135,
  SingleDown: 180,
  DoubleDown: 180,
  'NOT COMPUTABLE': 270,
  'RATE OUT OF RANGE': 270,
};

const ArrowIcon = styled(Icon)<{
  trendDirection: keyof typeof trendDirectionToRotation;
}>`
  transform: ${({trendDirection}) => {
    const rotation = trendDirectionToRotation[trendDirection] || 20;
    return `rotate(${rotation}deg)`;
  }};
`;
const DirectionArrows = ({
  trendDirection,
  size = 20,
}: {
  trendDirection: TrendDirectionString;
  size?: number;
}) => {
  return (
    <>
      {trendDirection === 'DoubleUp' || trendDirection === 'DoubleDown' ? (
        <>
          <ArrowIcon
            name="arrow-up"
            size={size}
            color="black"
            trendDirection={trendDirection}
          />
          <ArrowIcon
            name="arrow-up"
            size={size}
            color="black"
            trendDirection={trendDirection}
          />
        </>
      ) : trendDirection === 'NOT COMPUTABLE' ||
        trendDirection === 'RATE OUT OF RANGE' ? (
        <Icon name="heart" size={size} color="black" />
      ) : (
        <ArrowIcon
          name="arrow-up"
          size={size}
          color="black"
          trendDirection={trendDirection}
        />
      )}
    </>
  );
};

export default DirectionArrows;
