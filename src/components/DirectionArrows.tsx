import React from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {TrendDirectionString} from 'app/types/notifications';

const trendDirectionToRotation = {
  DoubleUp: 0,
  SingleUp: 0,
  FortyFiveUp: 45,
  Flat: 90,
  FortyFiveDown: 135,
  SingleDown: 180,
  DoubleDown: 180,
};

const ArrowIcon = styled(Icon)<{trendDirection: TrendDirectionString}>`
  transform: ${({trendDirection}) => {
    const rotation = trendDirectionToRotation[trendDirection] || 20;
    return `rotate(${rotation}deg)`;
  }};
`;

const DirectionArrows = ({
  trendDirection,
}: {
  trendDirection: TrendDirectionString;
}) => {
  return (
    <>
      {trendDirection === 'DoubleUp' || trendDirection === 'DoubleDown' ? (
        <>
          <ArrowIcon
            name="arrow-up"
            size={20}
            color="black"
            trendDirection={trendDirection}
          />
          <ArrowIcon
            name="arrow-up"
            size={20}
            color="black"
            trendDirection={trendDirection}
          />
        </>
      ) : trendDirection === 'NOT COMPUTABLE' ||
        trendDirection === 'RATE OUT OF RANGE' ? (
        <Icon name="help" size={20} color="black" />
      ) : (
        <ArrowIcon
          name="arrow-up"
          size={20}
          color="black"
          trendDirection={trendDirection}
        />
      )}
    </>
  );
};

export default DirectionArrows;
