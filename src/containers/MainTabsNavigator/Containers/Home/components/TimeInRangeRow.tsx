// noinspection CssInvalidPropertyValue

import React, {useEffect, useMemo, useRef, useState} from 'react';
import styled from 'styled-components/native';
import {BgSample} from 'app/types/day_bgs.types';
import {Animated} from 'react-native';
import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';
import {Theme} from 'app/types/theme';
import DropShadow from 'react-native-drop-shadow';

const Container = styled.View<{theme: Theme}>`
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  border-radius: 10px;
  background-color: rgba(255, 255, 255, 0);
  margin: 10px 0;
`;

const Column = styled(Animated.View)<{
  severeBelowRange?: boolean;
  belowRange?: boolean;
  inRange?: boolean;
  aboveRange?: boolean;
  severeAboveRange?: boolean;
  width?: number;
  theme: Theme;
}>`
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: ${props => (typeof props.width === 'number' ? props.width : 0)}%;
  height: 50px;
  background-color: ${props => {
    if (props.severeBelowRange) {
      return props.theme.severeBelowRange;
    }
    if (props.belowRange) {
      return props.theme.belowRangeColor;
    } else if (props.inRange) {
      return props.theme.inRangeColor;
    } else if (props.aboveRange) {
      return props.theme.aboveRangeColor;
    } else if (props.severeAboveRange) {
      return props.theme.severeAboveRange;
    } else {
      return 'yellow';
    }
  }};
  border-radius: 10px;
`;

const PercentageText = styled.Text<{color?: string}>`
  font-size: 16px;
  font-weight: bold;
  color: ${props => props.color || 'white'};
`;

type TirBuckets = {
  severeLow: number;
  low: number;
  target: number;
  high: number;
  severeHigh: number;
};

/**
 * Computes time-in-range buckets as percentages (0..100).
 *
 * Buckets:
 * - severeLow: <= EXTREME_LOW
 * - low: (EXTREME_LOW, TARGET.min)
 * - target: [TARGET.min, TARGET.max]
 * - high: (TARGET.max, VERY_HIGH]
 * - severeHigh: > VERY_HIGH
 */
export function calculateTirBuckets(bgData: BgSample[]): TirBuckets {
  const samples = bgData ?? [];
  const total = samples.length;
  if (!total) return {severeLow: 0, low: 0, target: 0, high: 0, severeHigh: 0};

  const severeLowMax = cgmRange[CGM_STATUS_CODES.EXTREME_LOW] as number;
  const lowMax = cgmRange.TARGET.min;
  const targetMax = cgmRange.TARGET.max;
  const severeHighMin = cgmRange[CGM_STATUS_CODES.VERY_HIGH] as number;

  let severeLow = 0;
  let low = 0;
  let target = 0;
  let high = 0;
  let severeHigh = 0;

  for (const s of samples) {
    // @ts-ignore
    const v = s?.sgv;
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;

    if (v <= severeLowMax) severeLow += 1;
    else if (v < lowMax) low += 1;
    else if (v <= targetMax) target += 1;
    else if (v <= severeHighMin) high += 1;
    else severeHigh += 1;
  }

  const validTotal = severeLow + low + target + high + severeHigh;
  if (!validTotal) return {severeLow: 0, low: 0, target: 0, high: 0, severeHigh: 0};

  const pct = (n: number) => (n / validTotal) * 100;
  return {
    severeLow: pct(severeLow),
    low: pct(low),
    target: pct(target),
    high: pct(high),
    severeHigh: pct(severeHigh),
  };
}

interface TimeInRangeRowProps {
  bgData: BgSample[];
}

export const TimeInRangeRow: React.FC<TimeInRangeRowProps> = ({bgData}) => {
  const animatedSevereLow = useRef(new Animated.Value(0)).current;
  const animatedLow = useRef(new Animated.Value(0)).current;
  const animatedTarget = useRef(new Animated.Value(0)).current;
  const animatedHigh = useRef(new Animated.Value(0)).current;
  const animatedSevereHigh = useRef(new Animated.Value(0)).current;

  interface AnimationValues {
    severeLowWidth: Animated.AnimatedInterpolation<string> | string;
    lowWidth: Animated.AnimatedInterpolation<string> | string;
    targetWidth: Animated.AnimatedInterpolation<string> | string;
    highWidth: Animated.AnimatedInterpolation<string> | string;
    severeHighWidth: Animated.AnimatedInterpolation<string> | string;
  }

  const [animationValues, setAnimationValues] = useState<AnimationValues>({
    severeLowWidth: '0%',
    lowWidth: '0%',
    targetWidth: '0%',
    highWidth: '0%',
    severeHighWidth: '0%',
  });
  const {
    severeLowWidth,
    lowWidth,
    targetWidth,
    highWidth,
    severeHighWidth,
  } = animationValues;

  const buckets = useMemo(() => calculateTirBuckets(bgData), [bgData]);

  const severeLowLabel = Math.round(buckets.severeLow);
  const lowLabel = Math.round(buckets.low);
  const targetLabel = Math.round(buckets.target);
  const highLabel = Math.round(buckets.high);
  const severeHighLabel = Math.round(buckets.severeHigh);

  useEffect(() => {
    const runAnimationTimeout = setTimeout(() => {
      const inputRange = [0, 100];
      const outputRange = ['0%', '100%'];

      Animated.timing(animatedSevereLow, {
        toValue: buckets.severeLow || 0,
        duration: 500,
        useNativeDriver: false,
      }).start();
      Animated.timing(animatedLow, {
        toValue: buckets.low || 0,
        duration: 500,
        useNativeDriver: false,
      }).start();
      Animated.timing(animatedTarget, {
        toValue: buckets.target || 0,
        duration: 500,
        useNativeDriver: false,
      }).start();
      Animated.timing(animatedHigh, {
        toValue: buckets.high || 0,
        duration: 500,
        useNativeDriver: false,
      }).start();
      Animated.timing(animatedSevereHigh, {
        toValue: buckets.severeHigh || 0,
        duration: 500,
        useNativeDriver: false,
      }).start();

      setAnimationValues({
        severeLowWidth: animatedSevereLow.interpolate({inputRange, outputRange}),
        lowWidth: animatedLow.interpolate({inputRange, outputRange}),
        targetWidth: animatedTarget.interpolate({inputRange, outputRange}),
        highWidth: animatedHigh.interpolate({inputRange, outputRange}),
        severeHighWidth: animatedSevereHigh.interpolate({inputRange, outputRange}),
      });
    }, 200);
    return () => clearTimeout(runAnimationTimeout);
    // eslint-disable-next-line
  }, [animatedHigh, animatedLow, animatedSevereHigh, animatedSevereLow, animatedTarget, buckets]);

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
        <Column style={{width: severeLowWidth}} severeBelowRange>
          <PercentageText>{severeLowLabel}%</PercentageText>
        </Column>
        <Column style={{width: lowWidth}} belowRange>
          <PercentageText>{lowLabel}%</PercentageText>
        </Column>
        <Column style={{width: targetWidth}} inRange>
          <PercentageText>{targetLabel}%</PercentageText>
        </Column>
        <Column style={{width: highWidth}} aboveRange>
          <PercentageText color={'black'}>{highLabel}%</PercentageText>
        </Column>
        <Column style={{width: severeHighWidth}} severeAboveRange>
          <PercentageText color={'black'}>{severeHighLabel}%</PercentageText>
        </Column>
      </Container>
    </DropShadow>
  );
};

export default TimeInRangeRow;
