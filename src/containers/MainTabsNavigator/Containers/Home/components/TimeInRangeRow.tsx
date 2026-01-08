// noinspection CssInvalidPropertyValue

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated} from 'react-native';
import DropShadow from 'react-native-drop-shadow';
import styled, {useTheme} from 'styled-components/native';

import {BgSample} from 'app/types/day_bgs.types';
import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';
import {Theme} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {calculateTimeInRangePercentages} from 'app/utils/glucose/timeInRange';

const Container = styled.View`
  margin: 10px 0;
`;

const Bar = styled.View`
  flex-direction: row;
  align-items: center;
  width: 100%;
  height: 24px;
  border-radius: 999px;
  overflow: hidden;
  background-color: ${({theme}) => addOpacity((theme as Theme).black, 0.06)};
`;

const Segment = styled(Animated.View)<{
  severeBelowRange?: boolean;
  belowRange?: boolean;
  inRange?: boolean;
  aboveRange?: boolean;
  severeAboveRange?: boolean;
}>`
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 24px;
  background-color: ${({theme, severeBelowRange, belowRange, inRange, aboveRange, severeAboveRange}) => {
    const t = theme as Theme;
    if (severeBelowRange) return t.severeBelowRange;
    if (belowRange) return t.belowRangeColor;
    if (inRange) return t.inRangeColor;
    if (aboveRange) return t.aboveRangeColor;
    if (severeAboveRange) return t.severeAboveRange;
    return 'yellow';
  }};
`;

const LargestLabelText = styled.Text<{color: string}>`
  font-size: 12px;
  font-weight: 800;
  color: ${({color}) => color};
`;

const LegendRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
`;

const LegendItem = styled.View`
  flex-direction: row;
  align-items: center;
`;

const LegendDot = styled.View<{color: string}>`
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background-color: ${({color}) => color};
  margin-right: 6px;
`;

const LegendText = styled.Text`
  font-size: 12px;
  color: ${({theme}) => addOpacity((theme as Theme).textColor, 0.7)};
  font-weight: 600;
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
  const {percentages} = calculateTimeInRangePercentages(bgData ?? [], {
    veryLowMax: cgmRange[CGM_STATUS_CODES.EXTREME_LOW] as number,
    targetMin: cgmRange.TARGET.min,
    targetMax: cgmRange.TARGET.max,
    highMax: cgmRange[CGM_STATUS_CODES.VERY_HIGH] as number,
  });

  return {
    severeLow: percentages.veryLow,
    low: percentages.low,
    target: percentages.target,
    high: percentages.high,
    severeHigh: percentages.veryHigh,
  };
}

interface TimeInRangeRowProps {
  bgData: BgSample[];
}

type AnimationValues = {
  severeLowWidth: Animated.AnimatedInterpolation<string> | string;
  lowWidth: Animated.AnimatedInterpolation<string> | string;
  targetWidth: Animated.AnimatedInterpolation<string> | string;
  highWidth: Animated.AnimatedInterpolation<string> | string;
  severeHighWidth: Animated.AnimatedInterpolation<string> | string;
};

export const TimeInRangeRow: React.FC<TimeInRangeRowProps> = ({bgData}) => {
  const theme = useTheme() as Theme;

  const animatedSevereLow = useRef(new Animated.Value(0)).current;
  const animatedLow = useRef(new Animated.Value(0)).current;
  const animatedTarget = useRef(new Animated.Value(0)).current;
  const animatedHigh = useRef(new Animated.Value(0)).current;
  const animatedSevereHigh = useRef(new Animated.Value(0)).current;

  const [animationValues, setAnimationValues] = useState<AnimationValues>({
    severeLowWidth: '0%',
    lowWidth: '0%',
    targetWidth: '0%',
    highWidth: '0%',
    severeHighWidth: '0%',
  });

  const {severeLowWidth, lowWidth, targetWidth, highWidth, severeHighWidth} =
    animationValues;

  const buckets = useMemo(() => calculateTirBuckets(bgData), [bgData]);

  const legendLow = Math.round(buckets.severeLow + buckets.low);
  const legendTarget = Math.round(buckets.target);
  const legendHigh = Math.round(buckets.high + buckets.severeHigh);
  const legendSevereLow = Math.round(buckets.severeLow);
  const legendSevereHigh = Math.round(buckets.severeHigh);

  const showLargestInBar = useMemo(() => {
    const max = Math.max(
      buckets.severeLow,
      buckets.low,
      buckets.target,
      buckets.high,
      buckets.severeHigh,
    );

    const isTargetLargest = buckets.target === max;
    return isTargetLargest && buckets.target >= 20;
  }, [buckets]);

  const largestTargetLabel = useMemo(() => `${Math.round(buckets.target)}%`, [
    buckets.target,
  ]);

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
        severeHighWidth: animatedSevereHigh.interpolate({
          inputRange,
          outputRange,
        }),
      });
    }, 200);

    return () => clearTimeout(runAnimationTimeout);
  }, [
    animatedHigh,
    animatedLow,
    animatedSevereHigh,
    animatedSevereLow,
    animatedTarget,
    buckets,
  ]);

  return (
    <Container>
      <DropShadow
        style={{
          shadowColor: '#000',
          shadowOffset: {width: 0, height: 2},
          shadowOpacity: 0.12,
          shadowRadius: 3,
          elevation: 2,
        }}>
        <Bar>
          <Segment style={{width: severeLowWidth}} severeBelowRange />
          <Segment style={{width: lowWidth}} belowRange />
          <Segment style={{width: targetWidth}} inRange>
            {showLargestInBar ? (
              <LargestLabelText color={'white'}>{largestTargetLabel}</LargestLabelText>
            ) : null}
          </Segment>
          <Segment style={{width: highWidth}} aboveRange />
          <Segment style={{width: severeHighWidth}} severeAboveRange />
        </Bar>
      </DropShadow>

      <LegendRow>
        <LegendItem>
          <LegendDot color={theme.belowRangeColor} />
          <LegendText>Low: {legendLow}%</LegendText>
        </LegendItem>
        <LegendItem>
          <LegendDot color={theme.inRangeColor} />
          <LegendText>In Range: {legendTarget}%</LegendText>
        </LegendItem>
        <LegendItem>
          <LegendDot color={theme.aboveRangeColor} />
          <LegendText>High: {legendHigh}%</LegendText>
        </LegendItem>
      </LegendRow>

      <LegendRow>
        <LegendItem>
          <LegendDot color={theme.severeBelowRange} />
          <LegendText>Severe Hypo: {legendSevereLow}%</LegendText>
        </LegendItem>
        <LegendItem>
          <LegendDot color={theme.severeAboveRange} />
          <LegendText>Severe Hyper: {legendSevereHigh}%</LegendText>
        </LegendItem>
      </LegendRow>
    </Container>
  );
};

export default TimeInRangeRow;
