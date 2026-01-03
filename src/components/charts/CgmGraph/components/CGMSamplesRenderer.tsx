import React, {useContext, useEffect, useRef} from 'react';
import {Circle, G} from 'react-native-svg';
import {xAccessor, yAccessor} from 'app/components/charts/CgmGraph/utils';
import {cgmRange} from 'app/constants/PLAN_CONFIG';
import {theme} from 'app/style/theme';
import {GraphStyleContext} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';
import {Animated, Easing} from 'react-native';
import {useClosestBgSample} from 'app/components/charts/CgmGraph/hooks/useClosestBgSample';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const SAMPLE_RADIUS = 2;
const FOCUSED_SAMPLE_RADIUS = SAMPLE_RADIUS * 8;
const ANIMATION_DURATION = 400;

const CGMSamplesRenderer = ({focusedSampleDateString}) => {
  const [{xScale, yScale, bgSamples: data}] = useContext(GraphStyleContext);

  // Animation value for the circle radius
  const animation = useRef(new Animated.Value(SAMPLE_RADIUS)).current; // Initial radius

  useEffect(() => {
    animation.stopAnimation();
    animation.setValue(2);

    // Start the animation when a sample is focused
    Animated.loop(
      Animated.sequence([
        Animated.timing(animation, {
          toValue: FOCUSED_SAMPLE_RADIUS, // Animated radius value
          duration: ANIMATION_DURATION,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(animation, {
          toValue: SAMPLE_RADIUS, // Reset to initial radius
          duration: ANIMATION_DURATION * 1.5,
          useNativeDriver: true,
          easing: Easing.linear,
        }),
      ]),
    ).start();
  }, [focusedSampleDateString]); // Depend on the focused sample's identifier

  return data?.length ? (
    <>
      {data.map(d => {
        if (!d?.sgv) return null;
        const x = xScale(xAccessor(d));
        const y = yScale(yAccessor(d));
        const color =
          yAccessor(d) < cgmRange.TARGET.min
            ? theme.belowRangeColor
            : yAccessor(d) > cgmRange.TARGET.max
              ? theme.aboveRangeColor
              : theme.inRangeColor;

        // Use AnimatedCircle for the focused sample
        const isFocused = d.dateString === focusedSampleDateString;
        return (
          <G key={d.dateString}>
            <Circle
              cx={x}
              cy={y}
              r={2}
              stroke={color}
              strokeWidth={1}
              fill={color}
            />
          </G>
        );
      })}
    </>
  ) : (
    <></>
  );
};

export default CGMSamplesRenderer;
