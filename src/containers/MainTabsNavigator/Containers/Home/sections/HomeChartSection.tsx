import React, {useEffect, useMemo, useRef, useState} from 'react';

import {Animated, Dimensions, InteractionManager, Pressable, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import styled, {useTheme} from 'styled-components/native';

import StackedHomeCharts from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts';
import type {StackedHomeChartsProps} from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts';
import type {BgSample} from 'app/types/day_bgs.types';
import type {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import type {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

const ChartControlsRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  padding: 8px 12px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props: {theme: ThemeType}) =>
    addOpacity(props.theme.black, 0.08)};
`;

const ChartControlButton = styled(Pressable)<{disabled?: boolean}>`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding-vertical: 6px;
  padding-horizontal: 10px;
  margin-left: 8px;
  border-width: 1px;
  border-radius: 10px;
  border-color: ${(props: {theme: ThemeType}) =>
    addOpacity(props.theme.textColor, 0.18)};
  opacity: ${(props: {disabled?: boolean}) => (props.disabled ? 0.4 : 1)};
`;

const ChartControlText = styled.Text`
  margin-left: 6px;
  font-size: 12px;
  font-weight: 700;
  color: ${(props: {theme: ThemeType}) => props.theme.textColor};
`;

const ChartPlaceholder = styled(Animated.View)`
  padding: 12px;
`;

const PlaceholderCard = styled.View`
  border-radius: 12px;
  border-width: 1px;
  background-color: ${(props: {theme: ThemeType}) => addOpacity(props.theme.white, 0.9)};
  border-color: ${(props: {theme: ThemeType}) => addOpacity(props.theme.textColor, 0.12)};
  padding: 12px;
`;

const PlaceholderTitle = styled.Text`
  font-size: 13px;
  font-weight: 800;
  color: ${(props: {theme: ThemeType}) => props.theme.textColor};
`;

const PlaceholderSub = styled.Text`
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
  color: ${(props: {theme: ThemeType}) => addOpacity(props.theme.textColor, 0.65)};
`;

type Props = {
  visible: boolean;

  isZoomed: boolean;
  canPanLeft: boolean;
  canPanRight: boolean;
  onPan: (direction: 'left' | 'right') => void;
  onToggleZoom: () => void;

  bgSamples: BgSample[];
  foodItems: Array<FoodItemDTO | formattedFoodItemDTO> | null;
  insulinData?: InsulinDataEntry[];
  basalProfileData?: BasalProfile;
  xDomain: StackedHomeChartsProps['xDomain'];
  fallbackAnchorTimeMs?: number;

  onPressFullScreen: () => void;
  testID?: string;
};

export const HomeChartSection: React.FC<Props> = ({
  visible,
  isZoomed,
  canPanLeft,
  canPanRight,
  onPan,
  onToggleZoom,
  bgSamples,
  foodItems,
  insulinData,
  basalProfileData,
  xDomain,
  fallbackAnchorTimeMs,
  onPressFullScreen,
  testID,
}) => {
  const theme = useTheme() as ThemeType;

  const chartWidth = useMemo(() => Dimensions.get('window').width, []);

  const [hasEverOpened, setHasEverOpened] = useState(false);
  const [shouldRenderCharts, setShouldRenderCharts] = useState(false);

  const placeholderOpacity = useRef(new Animated.Value(0)).current;
  const chartsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    setHasEverOpened(true);

    // Let the UI commit the expanded layout first, then mount the heavy chart tree.
    // This reduces the perceived “stuck” moment.
    const task = InteractionManager.runAfterInteractions(() => {
      setShouldRenderCharts(true);
    });

    return () => {
      task.cancel?.();
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      placeholderOpacity.stopAnimation();
      chartsOpacity.stopAnimation();
      placeholderOpacity.setValue(0);
      chartsOpacity.setValue(0);
      return;
    }

    if (!shouldRenderCharts) {
      placeholderOpacity.setValue(0);
      Animated.timing(placeholderOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();
      return;
    }

    // Fade charts in once mounted.
    chartsOpacity.setValue(0);
    Animated.timing(chartsOpacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [chartsOpacity, placeholderOpacity, shouldRenderCharts, visible]);

  if (!visible && !hasEverOpened) return null;

  const collapsed = !visible;

  return (
    <View
      collapsable={false}
      pointerEvents={collapsed ? 'none' : 'auto'}
      style={collapsed ? {height: 0, overflow: 'hidden'} : undefined}>
      {!collapsed ? (
        <ChartControlsRow>
        <ChartControlButton
          accessibilityRole="button"
          accessibilityLabel="Pan chart left"
          disabled={!isZoomed || !canPanLeft}
          onPress={() => onPan('left')}>
          <Icon name="chevron-left" size={20} color={theme.textColor} />
        </ChartControlButton>

        <ChartControlButton
          accessibilityRole="button"
          accessibilityLabel={isZoomed ? 'Zoom out' : 'Zoom in'}
          accessibilityHint="Toggles chart zoom"
          onPress={onToggleZoom}>
          <Icon
            name={isZoomed ? 'magnify-minus-outline' : 'magnify-plus-outline'}
            size={18}
            color={theme.textColor}
          />
          <ChartControlText>{isZoomed ? 'Zoom out' : 'Zoom in'}</ChartControlText>
        </ChartControlButton>

        <ChartControlButton
          accessibilityRole="button"
          accessibilityLabel="Pan chart right"
          disabled={!isZoomed || !canPanRight}
          onPress={() => onPan('right')}>
          <Icon name="chevron-right" size={20} color={theme.textColor} />
        </ChartControlButton>
      </ChartControlsRow>
      ) : null}

      {!shouldRenderCharts && !collapsed ? (
        <ChartPlaceholder style={{opacity: placeholderOpacity}}>
          <PlaceholderCard>
            <PlaceholderTitle>Loading charts…</PlaceholderTitle>
            <PlaceholderSub>Tap and drag to explore once ready.</PlaceholderSub>
          </PlaceholderCard>
        </ChartPlaceholder>
      ) : null}

      {shouldRenderCharts ? (
        <Animated.View style={{opacity: chartsOpacity}}>
          <StackedHomeCharts
            bgSamples={bgSamples}
            foodItems={foodItems}
            insulinData={insulinData}
            basalProfileData={basalProfileData}
            width={chartWidth}
            cgmHeight={200}
            miniChartHeight={65}
            xDomain={xDomain}
            fallbackAnchorTimeMs={fallbackAnchorTimeMs}
            showFullScreenButton
            onPressFullScreen={onPressFullScreen}
            testID={testID}
          />
        </Animated.View>
      ) : null}
    </View>
  );
};

export default HomeChartSection;
