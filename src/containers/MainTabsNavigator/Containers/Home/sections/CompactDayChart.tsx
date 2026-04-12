/**
 * Compact day chart that is always visible on the redesigned Home screen.
 *
 * Shows a full-day CGM line with meal/bolus event markers.
 * Replaces the old toggled HomeChartSection.
 * Uses the same StackedHomeCharts component but with a compact height.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Dimensions, InteractionManager, Pressable} from 'react-native';
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

// ── Props ───────────────────────────────────────────────────────────────

type Props = {
  bgSamples: BgSample[];
  foodItems: Array<FoodItemDTO | formattedFoodItemDTO> | null;
  insulinData?: InsulinDataEntry[];
  basalProfileData?: BasalProfile;
  xDomain: StackedHomeChartsProps['xDomain'];
  xDomainRelative3h?: StackedHomeChartsProps['xDomain'];
  isToday?: boolean;
  fallbackAnchorTimeMs?: number;
  onPressFullScreen: () => void;
  onTooltipModelChange?: (model: StackedChartsTooltipModel) => void;
  testID?: string;
};

// ── Component ───────────────────────────────────────────────────────────

const CompactDayChart: React.FC<Props> = ({
  bgSamples,
  foodItems,
  insulinData,
  basalProfileData,
  xDomain,
  xDomainRelative3h,
  isToday = false,
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
  const [timeRangeMode, setTimeRangeMode] = useState<'absolute' | 'relative3h'>('absolute');

  const canUseRelative3h = Boolean(isToday && xDomainRelative3h);
  const activeXDomain = timeRangeMode === 'relative3h' && canUseRelative3h ? xDomainRelative3h : xDomain;

  const toggleChartMode = useCallback(() => {
    setChartMode(prev => (prev === 'separate' ? 'mixed' : 'separate'));
  }, []);

  const toggleTimeRangeMode = useCallback(() => {
    if (!canUseRelative3h) return;
    setTimeRangeMode(prev => (prev === 'absolute' ? 'relative3h' : 'absolute'));
  }, [canUseRelative3h]);

  // Defer heavy chart mount until after layout settles
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

  return (
    <Container>
      <HeaderRow>
        <ChartLabel>{tr(language, 'home.chartLabel')}</ChartLabel>
        <HeaderButtons>
          {canUseRelative3h ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={language === 'he' ? 'מעבר בין כל היום ל-3 שעות אחרונות' : 'Toggle all day / last 3 hours'}
              onPress={toggleTimeRangeMode}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
              style={{
                borderWidth: 1,
                borderColor: addOpacity(theme.textColor, 0.2),
                borderRadius: 12,
                paddingHorizontal: 8,
                paddingVertical: 2,
                marginRight: 2,
              }}>
              <ChartRangeText>
                {timeRangeMode === 'relative3h' ? (language === 'he' ? '3ש׳' : '3h') : (language === 'he' ? 'כל היום' : 'All')}
              </ChartRangeText>
            </Pressable>
          ) : null}

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

// ── Styled Components ───────────────────────────────────────────────────

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

const ChartRangeText = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  font-weight: 700;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
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
