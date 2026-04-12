/**
 * Compact day chart that is always visible on the redesigned Home screen.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Dimensions, InteractionManager, Pressable, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import styled, {useTheme} from 'styled-components/native';

import StackedHomeCharts from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts';
import type {
  StackedHomeChartsProps,
  StackedChartsTooltipModel,
} from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts';
import type {BgSample} from 'app/types/day_bgs.types';
import type {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import type {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

type Props = {
  bgSamples: BgSample[];
  foodItems: Array<FoodItemDTO | formattedFoodItemDTO> | null;
  insulinData?: InsulinDataEntry[];
  basalProfileData?: BasalProfile;
  xDomain: StackedHomeChartsProps['xDomain'];
  fallbackAnchorTimeMs?: number;
  onPressFullScreen: () => void;
  onTooltipModelChange?: (model: StackedChartsTooltipModel) => void;
  testID?: string;
};

type RangeMode = 'all' | '1h' | '3h' | '6h' | '12h';

const RANGE_WINDOW_MS: Record<Exclude<RangeMode, 'all'>, number> = {
  '1h': 1 * 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
};

const CompactDayChart: React.FC<Props> = ({
  bgSamples,
  foodItems,
  insulinData,
  basalProfileData,
  xDomain,
  fallbackAnchorTimeMs,
  onPressFullScreen,
  onTooltipModelChange,
  testID,
}) => {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();
  const chartWidth = useMemo(() => Dimensions.get('window').width, []);

  const [shouldRender, setShouldRender] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [chartMode, setChartMode] = useState<'separate' | 'mixed'>('mixed');
  const [rangeMode, setRangeMode] = useState<RangeMode>('all');

  const toggleChartMode = useCallback(() => {
    setChartMode(prev => (prev === 'separate' ? 'mixed' : 'separate'));
  }, []);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setShouldRender(true);
    });
    return () => task.cancel?.();
  }, []);

  useEffect(() => {
    if (!shouldRender) return;
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, shouldRender]);

  const activeXDomain = useMemo(() => {
    if (!xDomain || rangeMode === 'all') return xDomain;

    const minMs = xDomain[0].getTime();
    const maxMs = xDomain[1].getTime();
    const anchorMs = Math.min(fallbackAnchorTimeMs ?? maxMs, maxMs);
    const windowMs = RANGE_WINDOW_MS[rangeMode];
    const startMs = Math.max(minMs, anchorMs - windowMs);

    return [new Date(startMs), new Date(anchorMs)] as [Date, Date];
  }, [xDomain, rangeMode, fallbackAnchorTimeMs]);

  return (
    <Container>
      <HeaderRow>
        <ChartLabel>{tr(language, 'home.chartLabel')}</ChartLabel>
        <HeaderButtons>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={chartMode === 'separate' ? tr(language, 'home.switchMixed') : tr(language, 'home.switchSeparate')}
            onPress={toggleChartMode}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Icon
              name={chartMode === 'mixed' ? 'chart-line-stacked' : 'chart-multiple'}
              size={18}
              color={addOpacity(theme.textColor, 0.5)}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr(language, 'home.fullScreenChart')}
            onPress={onPressFullScreen}>
            <Icon name="fullscreen" size={20} color={theme.textColor} />
          </Pressable>
        </HeaderButtons>
      </HeaderRow>

      <RangeRow>
        {(['all', '1h', '3h', '6h', '12h'] as RangeMode[]).map(mode => {
          const selected = rangeMode === mode;
          const label =
            mode === 'all'
              ? (language === 'he' ? 'כל היום' : 'All')
              : mode;

          return (
            <Pressable
              key={mode}
              onPress={() => setRangeMode(mode)}
              style={{
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: selected ? theme.accentColor : addOpacity(theme.textColor, 0.25),
                backgroundColor: selected ? addOpacity(theme.accentColor, 0.12) : 'transparent',
              }}>
              <RangeText style={{fontWeight: selected ? '700' : '500'}}>{label}</RangeText>
            </Pressable>
          );
        })}
      </RangeRow>

      {!shouldRender ? (
        <PlaceholderBox>
          <PlaceholderText>{tr(language, 'common.loadingChart')}</PlaceholderText>
        </PlaceholderBox>
      ) : (
        <Animated.View style={{opacity: fadeAnim}}>
          <StackedHomeCharts
            bgSamples={bgSamples}
            foodItems={foodItems}
            insulinData={insulinData}
            basalProfileData={basalProfileData}
            width={chartWidth}
            cgmHeight={150}
            miniChartHeight={50}
            xDomain={activeXDomain}
            fallbackAnchorTimeMs={fallbackAnchorTimeMs}
            showFullScreenButton={false}
            onPressFullScreen={onPressFullScreen}
            tooltipPlacement="none"
            chartMode={chartMode}
            onTooltipModelChange={onTooltipModelChange}
            testID={testID}
          />
        </Animated.View>
      )}
    </Container>
  );
};

const Container = styled.View<{theme: ThemeType}>`
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
`;

const HeaderRow = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  padding-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
`;

const HeaderButtons = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  align-items: center;
  gap: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
`;

const ChartLabel = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  font-weight: 800;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
`;

const RangeRow = styled(View)<{theme: ThemeType}>`
  flex-direction: row;
  align-items: center;
  gap: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  padding-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  padding-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
`;

const RangeText = styled.Text<{theme: ThemeType}>`
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
`;

const PlaceholderBox = styled.View<{theme: ThemeType}>`
  height: 250px;
  margin-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius + 4}px;
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.1)};
  justify-content: center;
  align-items: center;
`;

const PlaceholderText = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.4)};
`;

export default React.memo(CompactDayChart);
