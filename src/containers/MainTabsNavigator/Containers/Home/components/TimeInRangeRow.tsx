import React, {useEffect, useRef, useState} from 'react';
import styled from 'styled-components/native';
import {BgSample} from 'app/types/day_bgs';
import {Animated, Text} from 'react-native';
import {cgmRange} from 'app/constants/PLAN_CONFIG';

const Container = styled.View`
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  border-radius: 10px;
  background-color: white;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.3;
  shadow-radius: 4;
  elevation: 2;
  border: 2px solid #333;
`;

const Column = styled(Animated.View)<{color: string; width: number}>`
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: ${props => props.width}%;
  height: 50px;
  background-color: ${props => props.color};
  border-radius: 10px;
`;

const PercentageText = styled.Text<{color: string}>`
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
      const animation = new Animated.Value(0);
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
        lowPercentageAnimation: lowPercentageAnimation,
        highPercentageAnimation: highPercentageAnimation,
        inTargetPercentageAnimation: inTargetPercentageAnimation,
      });
    }, 200);
    return () => clearTimeout(runAnimationTimeout);
  }, [bgData]);

  return (
    <Container>
      <Column style={{width: lowPercentageAnimation}} color={'red'}>
        <PercentageText>{lowPercentage || 0}%</PercentageText>
      </Column>
      <Column style={{width: inTargetPercentageAnimation}} color={'green'}>
        <PercentageText>{timeInRangePercentage || 0}%</PercentageText>
      </Column>
      <Column style={{width: highPercentageAnimation}} color={'yellow'}>
        <PercentageText color={'black'}>{highPercentage || 0}%</PercentageText>
      </Column>
    </Container>
  );
};

export default TimeInRangeRow;
