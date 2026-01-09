import React, {useMemo} from 'react';

import {Dimensions, Pressable, View} from 'react-native';
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

  if (!visible) return null;

  return (
    <View collapsable={false}>
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
    </View>
  );
};

export default HomeChartSection;
