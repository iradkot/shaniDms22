/* eslint-disable react-native/no-inline-styles */
import React, {useEffect, useState} from 'react';
import styled from 'styled-components/native';
import {formatDistanceToNow} from 'date-fns';
import DirectionArrows from 'app/components/DirectionArrows';
import {BgSample} from 'app/types/day_bgs';
import {isEmpty} from 'lodash';
import {View} from 'react-native';
import {Theme} from 'app/types/theme';
import {TrendDirectionString} from 'app/types/notifications';

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
  width: 95%;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  border-radius: 20px;
  background-color: ${({bgValue, theme}) =>
    theme.determineBgColorByGlucoseValue(bgValue)};
  padding: 20px;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.3;
  shadow-radius: 4px;
  elevation: 2;
  margin: 20px auto;
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

// Custom hooks
const useTimer = (
  latestBgSample: BgSample | undefined,
  callback: {(): void; (): void},
) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [callbackRuns, setCallbackRuns] = useState(0);

  useEffect(() => {
    const getTimeLeft = () => {
      setTimeout(() => {
        if (!latestBgSample) {
          return;
        }
        const commonTimeDiffBetweenBgReading = 5 * 60 * 1000;
        const delay = 40 * 1000;
        const updatedTimeLeft =
          latestBgSample.date +
          commonTimeDiffBetweenBgReading +
          delay -
          new Date().getTime();
        setTimeLeft(updatedTimeLeft);
      }, 1000);
    };
    getTimeLeft();
  }, [latestBgSample, timeLeft]);

  useEffect(() => {
    if (timeLeft > 0 && callbackRuns > 0) {
      setCallbackRuns(0);
    } else {
      const expectedCallbackRuns = Math.floor(timeLeft / 60 / 1000) * -1;
      if (expectedCallbackRuns > callbackRuns) {
        setCallbackRuns(expectedCallbackRuns);
        callback();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, callbackRuns]);

  return {timeLeft};
};

// Main component
interface BGValueRowProps {
  bgData?: BgSample;
  getUpdatedBgDataCallback: () => void;
}

const BGValueRow: React.FC<BGValueRowProps> = ({
  bgData,
  getUpdatedBgDataCallback,
}) => {
  useTimer(bgData, getUpdatedBgDataCallback);

  if (isEmpty(bgData)) {
    return null;
  }

  const {sgv, direction, date} = bgData;

  return (
    <Container bgValue={sgv}>
      <View style={{flex: 1, alignItems: 'center'}}>
        <BGValueText value={sgv} />
      </View>
      <View style={{flex: 1, alignItems: 'center'}}>
        <TrendDirection direction={direction} size={40} />
      </View>
      <View style={{flex: 1.5, alignItems: 'center'}}>
        <TimePassed date={date} />
      </View>
    </Container>
  );
};

export default BGValueRow;
