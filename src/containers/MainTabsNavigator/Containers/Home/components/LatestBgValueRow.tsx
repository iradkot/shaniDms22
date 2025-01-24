/* eslint-disable react-native/no-inline-styles */
import React, {useMemo} from 'react';
import styled, {useTheme} from 'styled-components/native';
import {formatDistanceToNow} from 'date-fns';
import DirectionArrows from 'app/components/DirectionArrows';
import {BgSample} from 'app/types/day_bgs.types';
import {isEmpty} from 'lodash';
import {View} from 'react-native';
import {Theme} from 'app/types/theme';
import {TrendDirectionString} from 'app/types/notifications';
import {useTimer} from 'app/hooks/useTimer';
import BgGradient from 'app/components/BgGradient';

// Separate components into smaller reusable components
const BGValueText = ({value}: {value: number}) => (
  <StyledBGValueText>{value}</StyledBGValueText>
);

const TrendDirection = ({
  direction,
  size,
}: {
  direction: TrendDirectionString;
  size: number;
}) => (
  <StyledTrendDirectionContainer>
    <DirectionArrows trendDirection={direction} size={size} />
  </StyledTrendDirectionContainer>
);

const TimePassed = ({date}: {date: number}) => {
  const timePassed = formatDistanceToNow(date);
  return <StyledTimePassedText>{timePassed} ago</StyledTimePassedText>;
};

// Styled components
const Container = styled.View<{bgValue: number; theme: Theme}>`
  height: 80px;
  width: 99%;
  flex-direction: row;
  justify-content: space-around;
  border-radius: 20px;
  background-color: rgba(0, 0, 255, 0.1);
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.3;
  shadow-radius: 4px;
  elevation: 2;
  margin: 4px auto;
`;

const StyledBGValueText = styled.Text`
  font-size: 24px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 5px #000;
`;

const StyledTrendDirectionContainer = styled.View`
  padding: 5px;
  border-radius: 15px;
  justify-content: center;
  align-items: center;
`;

const StyledTimePassedText = styled.Text`
  min-width: 80px;
  font-size: 16px;
  font-weight: bold;
  color: #fff;
  text-align: center;
  text-shadow: 0 0 5px #000;
`;

// Main component
interface BGValueRowProps {
  prevBgData?: BgSample;
  bgData?: BgSample;
  getUpdatedBgDataCallback: () => void;
}

const BGValueRow: React.FC<BGValueRowProps> = ({
  prevBgData,
  bgData,
  getUpdatedBgDataCallback,
}) => {
  useTimer(bgData, getUpdatedBgDataCallback);
  const theme = useTheme() as Theme;

  const {sgv, direction, date} = bgData || {};

  const bgStartColor = useMemo(() => {
    // Modify this based on your desired start color logic
    const prevSgv = prevBgData?.sgv;
    return theme.determineBgColorByGlucoseValue(prevSgv || sgv);
  }, [sgv, theme]);

  const bgEndColor = useMemo(() => {
    // Modify this based on your desired end color logic
    return theme.determineBgColorByGlucoseValue(sgv);
  }, [sgv, theme]);

  if (isEmpty(bgData)) {
    return null;
  }

  return (
    <Container bgValue={sgv}>
      <BgGradient
        startColor={bgStartColor}
        endColor={bgEndColor}
        theme={theme}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 20,
        }}>
        <View style={{flex: 1, alignItems: 'center'}}>
          <BGValueText value={sgv} />
        </View>
        <View style={{flex: 1, alignItems: 'center'}}>
          <TrendDirection direction={direction} size={40} />
        </View>
        <View style={{flex: 1.5, alignItems: 'center'}}>
          <TimePassed date={date} />
        </View>
      </BgGradient>
    </Container>
  );
};

export default BGValueRow;
