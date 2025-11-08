import React, {useMemo} from 'react';
import styled from 'styled-components/native';
import { Ionicons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import {TrendDirectionString} from 'app/types/notifications';
import {ThemeType} from 'app/types/theme';

const TrendDirectionRotations: {[key in TrendDirectionString]: number} = {
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

const IconTypes = {
  ARROW: 'arrow-up',
  HEART: 'heart',
};


// ArrowIcon only handles rotation; shadow is applied via DropShadow wrapper
const ArrowIcon = styled(Icon)<{rotation: number}>`
  transform: ${({rotation}) => `rotate(${rotation}deg)`};
`;

const ArrowWrapper = styled.View``;

const ArrowsContainer = styled.View`
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  width: 55px;
`;

const getIconName = (trendDirection: TrendDirectionString) =>
  ['NOT COMPUTABLE', 'RATE OUT OF RANGE'].includes(trendDirection)
    ? IconTypes.HEART
    : IconTypes.ARROW;

const getIconCount = (trendDirection: TrendDirectionString) =>
  ['DoubleUp', 'DoubleDown'].includes(trendDirection) ? 2 : 1;

const getRotation = (trendDirection: TrendDirectionString) =>
  TrendDirectionRotations[trendDirection] !== undefined
    ? TrendDirectionRotations[trendDirection]
    : 0;

interface DirectionArrowsProps {
  trendDirection: TrendDirectionString;
  size?: number;
  color?: string;
}

const DirectionArrows: React.FC<DirectionArrowsProps> = ({
  trendDirection,
  size = 20,
  color = 'black',
}) => {
  const iconName = useMemo(() => getIconName(trendDirection), [trendDirection]);
  const iconCount = useMemo(
    () => getIconCount(trendDirection),
    [trendDirection],
  );
  const rotation = useMemo(() => getRotation(trendDirection), [trendDirection]);

  return (
    <ArrowsContainer>
      {Array.from({length: iconCount}, (_, index) => (
        <ArrowWrapper
          key={index}
          style={{
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: 3,
          }}
        >
          <ArrowIcon
            name={iconName}
            size={size}
            color={color}
            rotation={rotation}
          />
        </ArrowWrapper>
      ))}
    </ArrowsContainer>
  );
};

DirectionArrows.propTypes = {
  trendDirection: PropTypes.oneOf(
    Object.keys(TrendDirectionRotations) as TrendDirectionString[],
  ).isRequired,
  size: PropTypes.number,
  color: PropTypes.string,
};

DirectionArrows.defaultProps = {
  size: 20,
  color: 'black',
};

export default DirectionArrows;
