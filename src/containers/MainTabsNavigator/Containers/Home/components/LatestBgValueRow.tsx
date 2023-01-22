import React, {useEffect, useState} from 'react';
import styled from 'styled-components/native';
import {formatDistanceToNow} from 'date-fns';
import DirectionArrows from 'app/components/DirectionArrows';
import {BgSample} from 'app/types/day_bgs';
import {isEmpty} from 'lodash';
import {View} from 'react-native';
import {Theme} from 'app/types/theme';

interface BGValueRowProps {
  bgData?: BgSample;
  getUpdatedBgDataCallback: () => void;
}

const Container = styled.View<{bgValue: number; theme: Theme}>`
  height: 80px;
  width: 90%;
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

const BGValueText = styled.Text`
  font-size: 24px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0px 0px 5px #000;
`;

const TrendDirectionContainer = styled.View`
  padding: 5px;
  border-radius: 15px;
  justify-content: center;
  align-items: center;
`;

const TimePassedText = styled.Text`
  min-width: 80px;
  font-size: 16px;
  font-weight: bold;
  color: #fff;
  text-align: center;
  text-shadow: 0px 0px 5px #000;
`;
interface UseTimerReturn {
  timeLeft: number;
}

const useTimer = (
  latestBgSample: BgSample | undefined,
  callback: () => void,
): UseTimerReturn => {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [callbackRuns, setCallbackRuns] = useState<number>(0);

  // Get the time left until the next background reading
  useEffect(() => {
    const getTimeLeft = () => {
      setTimeout(() => {
        if (!latestBgSample) {
          return;
        }
        // 5 minutes in milliseconds
        const commonTimeDiffBetweenBgReading = 5 * 60 * 1000;
        // 40 seconds in milliseconds
        const delay = 40 * 1000;
        const timeLeft =
          latestBgSample.date +
          commonTimeDiffBetweenBgReading +
          delay -
          new Date().getTime();
        setTimeLeft(timeLeft);
      }, 1000);
    };
    getTimeLeft();
  }, [latestBgSample, timeLeft]);

  // Handle the callback function
  useEffect(() => {
    if (timeLeft > 0 && callbackRuns > 0) {
      setCallbackRuns(0);
    } else {
      // expectedCallbackRuns will be a negative number
      const expectedCallbackRuns = Math.floor(timeLeft / 60 / 1000) * -1;
      if (expectedCallbackRuns > callbackRuns) {
        setCallbackRuns(expectedCallbackRuns);
        callback();
      }
    }
    // eslint-disable-next-line
  }, [timeLeft, callbackRuns]);

  return {timeLeft};
};

const BGValueRow: React.FC<BGValueRowProps> = ({
  bgData,
  getUpdatedBgDataCallback,
}) => {
  useTimer(bgData, getUpdatedBgDataCallback);
  if (isEmpty(bgData)) {
    return null;
  }

  const {sgv, direction, date} = bgData;
  const timePassed = formatDistanceToNow(date);

  return (
    <Container bgValue={sgv}>
      <View style={{flex: 1, alignItems: 'center'}}>
        <BGValueText>{sgv}</BGValueText>
      </View>
      <View style={{flex: 1, alignItems: 'center'}}>
        <TrendDirectionContainer>
          <DirectionArrows trendDirection={direction} size={40} />
        </TrendDirectionContainer>
      </View>
      <View style={{flex: 1.5, alignItems: 'center'}}>
        <TimePassedText>{timePassed} ago</TimePassedText>
      </View>
    </Container>
  );
};

export default BGValueRow;
