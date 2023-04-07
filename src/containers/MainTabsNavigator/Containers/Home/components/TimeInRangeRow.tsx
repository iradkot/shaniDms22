// noinspection CssInvalidPropertyValue

import React, {useEffect, useRef, useState} from 'react';
import styled from 'styled-components/native';
import {BgSample} from 'app/types/day_bgs';
import {Animated} from 'react-native';
import {cgmRange} from 'app/constants/PLAN_CONFIG';
import {Theme} from 'app/types/theme';
import DropShadow from 'react-native-drop-shadow';

const Container = styled.View<{theme: Theme}>`
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  border-radius: 10px;
  background-color: rgba(255, 255, 255, 0);
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.3;
  shadow-radius: 4px;
  elevation: 2;
  margin: 10px 0;
`;

const Column = styled(Animated.View)<{
  belowRange?: boolean;
  inRange?: boolean;
  aboveRange?: boolean;
  width?: number;
  theme: Theme;
}>`
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: ${props => props.width}%;
  height: 50px;
  background-color: ${props => {
    if (props.belowRange) {
      return props.theme.belowRangeColor;
    } else if (props.inRange) {
      return props.theme.inRangeColor;
    } else if (props.aboveRange) {
      return props.theme.aboveRangeColor;
    } else {
      return 'yellow';
    }
  }};
  border-radius: 10px;
`;

const PercentageText = styled.Text<{color?: string}>`
  font-size: 18px;
  font-weight: bold;
  color: ${props => props.color || 'white'};
`;

interface TimeInRangeRowProps {
  bgData: BgSample[];
}

export const TimeInRangeRow: React.FC<TimeInRangeRowProps> = ({bgData}) => {
  const animatedLowPercentage = useRef(new Animated.Value(0)).current;
  const animatedHighPercentage = useRef(new Animated.Value(0)).current;
  const animatedInTargetPercentage = useRef(new Animated.Value(0)).current;

  interface AnimationValues {
    lowPercentageAnimation: number;
    highPercentageAnimation: number;
    inTargetPercentageAnimation: number;
  }

  const [animationValues, setAnimationValues] = useState<AnimationValues>({
    lowPercentageAnimation: 0,
    highPercentageAnimation: 0,
    inTargetPercentageAnimation: 0,
  });
  const {
    lowPercentageAnimation,
    highPercentageAnimation,
    inTargetPercentageAnimation,
  } = animationValues;
  const timeInRange = bgData.filter(
    // @ts-ignore
    bg => bg.sgv >= cgmRange.TARGET.min && bg.sgv <= cgmRange.TARGET.max,
  );
  const timeInRangePercentage = Math.floor(
    (timeInRange.length / bgData.length) * 100,
  );
  const lowPercentage = Math.floor(
    // @ts-ignore
    (bgData.filter(bg => bg.sgv < cgmRange.TARGET.min).length / bgData.length) *
      100,
  );
  const highPercentage = Math.floor(
    // @ts-ignore
    (bgData.filter(bg => bg.sgv > cgmRange.TARGET.max).length / bgData.length) *
      100,
  );

  useEffect(() => {
    const runAnimationTimeout = setTimeout(() => {
      const inputRange = [0, 100];
      const outputRange = ['0%', '100%'];
      Animated.timing(animatedLowPercentage, {
        toValue: lowPercentage || 0,
        duration: 500,
        useNativeDriver: false,
      }).start();
      Animated.timing(animatedHighPercentage, {
        toValue: highPercentage || 0,
        duration: 500,
        useNativeDriver: false,
      }).start();
      Animated.timing(animatedInTargetPercentage, {
        toValue: timeInRangePercentage || 0,
        duration: 500,
        useNativeDriver: false,
      }).start();

      const lowPercentageAnimation = animatedLowPercentage.interpolate({
        inputRange,
        outputRange,
      });
      const highPercentageAnimation = animatedHighPercentage.interpolate({
        inputRange,
        outputRange,
      });
      const inTargetPercentageAnimation =
        animatedInTargetPercentage.interpolate({
          inputRange,
          outputRange,
        });

      setAnimationValues({
        // @ts-ignore
        lowPercentageAnimation: lowPercentageAnimation,
        // @ts-ignore
        highPercentageAnimation: highPercentageAnimation,
        // @ts-ignore
        inTargetPercentageAnimation: inTargetPercentageAnimation,
      });
    }, 200);
    return () => clearTimeout(runAnimationTimeout);
    // eslint-disable-next-line
  }, [bgData]);

  return (
    <DropShadow
      style={{
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 4},
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 2,
      }}>
      <Container>
        <Column style={{width: lowPercentageAnimation}} belowRange>
          <DropShadow
            style={{
              shadowColor: '#000',
              shadowOffset: {width: 0, height: 4},
              shadowOpacity: 0.3,
              shadowRadius: 4,
              elevation: 2,
            }}>
            <PercentageText>{lowPercentage || 0}%</PercentageText>
          </DropShadow>
        </Column>
        <Column style={{width: inTargetPercentageAnimation}} inRange>
          <DropShadow
            style={{
              shadowColor: '#000',
              shadowOffset: {width: 0, height: 4},
              shadowOpacity: 0.3,
              shadowRadius: 4,
              elevation: 2,
            }}>
            <PercentageText>{timeInRangePercentage || 0}%</PercentageText>
          </DropShadow>
        </Column>
        <Column style={{width: highPercentageAnimation}} aboveRange>
          <DropShadow
            style={{
              shadowColor: '#000',
              shadowOffset: {width: 0, height: 4},
              shadowOpacity: 0.3,
              shadowRadius: 4,
              elevation: 2,
            }}>
            <PercentageText color={'black'}>
              {highPercentage || 0}%
            </PercentageText>
          </DropShadow>
        </Column>
      </Container>
    </DropShadow>
  );
};

export default TimeInRangeRow;
