import React, {useMemo, useState} from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StatusBar,
  useWindowDimensions,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import styled, {useTheme} from 'styled-components/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {ThemeType} from 'app/types/theme';
import {BgSample} from 'app/types/day_bgs.types';
import CgmRows from 'app/components/CgmCardListDisplay/CgmRows';
import CgmGraph from 'app/components/charts/CgmGraph/CgmGraph';
import StackedHomeCharts, {
  StackedChartsTooltipModel,
} from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts';
import HomeChartsTooltip from 'app/containers/MainTabsNavigator/Containers/Home/components/HomeChartsTooltip';
import {
  FoodItemDTO,
  formattedFoodItemDTO,
  FormattedFoodItemDTO,
} from 'app/types/food.types';
import {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import {useAGPData} from 'app/components/charts/AGPGraph/hooks/useAGPData';
import AGPChart from 'app/components/charts/AGPGraph/components/AGPChart';
import {cgmRange} from 'app/constants/PLAN_CONFIG';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {MAIN_TAB_NAVIGATOR} from 'app/constants/SCREEN_NAMES';

const FULL_SCREEN_CONSTANTS = {
  headerHeight: 48,
  iconSize: 22,
  hitSlop: {top: 10, bottom: 10, left: 10, right: 10},
  defaultCgmGraphHeightFallback: 240,
  agpMinWidth: 280,
  stackedMixedMiniMultiplier: 2.5,
  stackedLandscapeGap: 10,
} as const;

type Mode = 'cgmRows' | 'cgmGraph' | 'stackedCharts' | 'agpGraph';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getStackedChartHeights(params: {
  availableHeight: number;
  isLandscape: boolean;
}) {
  const availableHeight = Math.max(1, Math.floor(params.availableHeight));
  const minCgm = params.isLandscape ? 150 : 220;
  const minMixed = params.isLandscape ? 116 : 180;
  const maxMixed = params.isLandscape ? 220 : 300;
  const targetMixed = availableHeight * (params.isLandscape ? 0.38 : 0.42);
  const minTotal = minCgm + minMixed;

  let mixedHeight =
    availableHeight >= minTotal
      ? clamp(Math.floor(targetMixed), minMixed, maxMixed)
      : Math.floor(availableHeight * 0.42);

  if (availableHeight - mixedHeight < minCgm) {
    mixedHeight = Math.max(1, availableHeight - minCgm);
  }

  const cgmHeight = Math.max(1, availableHeight - mixedHeight);
  const miniHeight = Math.max(
    1,
    Math.floor(mixedHeight / FULL_SCREEN_CONSTANTS.stackedMixedMiniMultiplier),
  );

  return {cgmHeight, miniHeight};
}

function getStackedLandscapeRailWidth(availableWidth: number) {
  return clamp(Math.floor(availableWidth * 0.28), 280, 360);
}

export function getStackedFullScreenFrame(params: {
  contentWidth: number;
  isLandscape: boolean;
}) {
  if (!params.isLandscape) {
    return {
      chartWidth: params.contentWidth,
      tooltipRailWidth: 0,
    };
  }

  const tooltipRailWidth = getStackedLandscapeRailWidth(params.contentWidth);
  const chartWidth = Math.max(
    1,
    params.contentWidth -
      tooltipRailWidth -
      FULL_SCREEN_CONSTANTS.stackedLandscapeGap,
  );

  return {chartWidth, tooltipRailWidth};
}

type FullScreenRouteParams =
  | {
      mode: 'cgmRows';
      bgData: BgSample[];
      isLoading?: boolean;
      isToday?: boolean;
    }
  | {
      mode: 'cgmGraph';
      bgSamples: BgSample[];
      foodItems: FormattedFoodItemDTO[] | null;
      insulinData?: InsulinDataEntry[];
    }
  | {
      mode: 'stackedCharts';
      title?: string;
      bgSamples: BgSample[];
      foodItems: Array<FoodItemDTO | formattedFoodItemDTO> | null;
      insulinData?: InsulinDataEntry[];
      basalProfileData?: BasalProfile;
      xDomainMs?: {startMs: number; endMs: number} | null;
      fallbackAnchorTimeMs?: number;
    }
  | {
      mode: 'agpGraph';
      bgData: BgSample[];
    };

const FullScreenViewScreen: React.FC<{navigation: any; route: any}> = ({
  navigation,
  route,
}) => {
  const theme = useTheme() as ThemeType;
  const insets = useSafeAreaInsets();
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();

  const params = (route as any)?.params as FullScreenRouteParams | undefined;
  const mode: Mode = params?.mode ?? 'cgmRows';

  const [contentLayoutHeight, setContentLayoutHeight] = useState<number | null>(
    null,
  );
  const [stackedTooltipModel, setStackedTooltipModel] =
    useState<StackedChartsTooltipModel | null>(null);

  const contentHeight = useMemo(() => {
    // IMPORTANT:
    // The <Content> container already applies `paddingBottom: insets.bottom`.
    // If we also subtract `insets.bottom` here, the usable height is reduced twice,
    // which can clip the bottom-most chart (notably in landscape).
    const safeHeight = screenHeight - insets.top;
    return Math.max(0, safeHeight - FULL_SCREEN_CONSTANTS.headerHeight);
  }, [insets.top, screenHeight]);

  const contentInnerHeight = useMemo(() => {
    // Prefer the measured height since it reflects real layout (status bar, nav bars,
    // platform quirks, etc). Subtract bottom padding because children can't draw there.
    if (
      typeof contentLayoutHeight === 'number' &&
      Number.isFinite(contentLayoutHeight)
    ) {
      return Math.max(0, contentLayoutHeight - insets.bottom);
    }
    // Fallback to the computed value (already excludes header).
    return contentHeight;
  }, [contentHeight, contentLayoutHeight, insets.bottom]);

  const isDeviceLandscape = screenWidth > screenHeight;

  const contentHorizontalPadding = useMemo(() => {
    return mode === 'stackedCharts' ? theme.spacing.sm : theme.spacing.lg;
  }, [mode, theme.spacing.lg, theme.spacing.sm]);

  const contentWidth = useMemo(() => {
    // Give charts breathing room while respecting landscape safe areas/nav bars.
    return Math.max(
      1,
      Math.floor(
        screenWidth - insets.left - insets.right - contentHorizontalPadding * 2,
      ),
    );
  }, [contentHorizontalPadding, insets.left, insets.right, screenWidth]);

  const cgmGraphFrame = useMemo(() => {
    const hAvailable =
      contentInnerHeight || FULL_SCREEN_CONSTANTS.defaultCgmGraphHeightFallback;

    // In portrait, avoid an overly tall/stretchy feel by capping height relative to width.
    // In landscape, use the available height (device rotation already provides the wide layout).
    const hPortrait = Math.min(
      hAvailable,
      Math.max(260, Math.floor(contentWidth * 0.95)),
    );

    return {
      width: contentWidth,
      height: isDeviceLandscape ? hAvailable : hPortrait,
    };
  }, [contentInnerHeight, contentWidth, isDeviceLandscape]);

  const agpGraphFrame = useMemo(() => {
    const hAvailable =
      contentInnerHeight || FULL_SCREEN_CONSTANTS.defaultCgmGraphHeightFallback;

    // AGP looks awkward when it fills the entire portrait height; keep a sane aspect.
    const hPortrait = Math.min(
      hAvailable,
      Math.max(320, Math.floor(contentWidth * 1.1)),
    );

    return {
      width: Math.max(FULL_SCREEN_CONSTANTS.agpMinWidth, contentWidth),
      height: isDeviceLandscape ? hAvailable : hPortrait,
    };
  }, [contentInnerHeight, contentWidth, isDeviceLandscape]);

  const handleBack = () => {
    // In some navigation states (or E2E automation timing), goBack() can be a no-op
    // if the current navigator has no back stack. Fall back to parent, then tabs.
    if (typeof navigation?.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    const parent =
      typeof navigation?.getParent === 'function'
        ? navigation.getParent()
        : null;
    if (
      parent &&
      typeof parent.canGoBack === 'function' &&
      parent.canGoBack()
    ) {
      parent.goBack();
      return;
    }

    if (typeof navigation?.navigate === 'function') {
      navigation.navigate(MAIN_TAB_NAVIGATOR);
    }
  };

  const headerTitle = useMemo(() => {
    if (mode === 'cgmRows') return 'Glucose Log';
    if (mode === 'cgmGraph') return 'CGM Graph';
    if (mode === 'stackedCharts') {
      const t = (params as any)?.title;
      return typeof t === 'string' && t.trim() ? t : 'Charts';
    }
    return 'AGP Graph';
  }, [mode, params]);

  const stackedXDomain = useMemo(() => {
    const xDomainMs = (params as any)?.xDomainMs as
      | {startMs: number; endMs: number}
      | null
      | undefined;
    if (!xDomainMs) return null;
    if (
      !Number.isFinite(xDomainMs.startMs) ||
      !Number.isFinite(xDomainMs.endMs)
    )
      return null;
    return [new Date(xDomainMs.startMs), new Date(xDomainMs.endMs)] as [
      Date,
      Date,
    ];
  }, [params]);

  const stackedHeights = useMemo(() => {
    return getStackedChartHeights({
      availableHeight: contentInnerHeight,
      isLandscape: isDeviceLandscape,
    });
  }, [contentInnerHeight, isDeviceLandscape]);

  const stackedFrame = useMemo(() => {
    return getStackedFullScreenFrame({
      contentWidth,
      isLandscape: isDeviceLandscape,
    });
  }, [contentWidth, isDeviceLandscape]);

  return (
    <Screen testID={E2E_TEST_IDS.fullscreen.screen}>
      <StatusBar hidden={false} backgroundColor={theme.backgroundColor} />

      <Header style={{paddingTop: insets.top}}>
        <HeaderRow>
          <IconButton
            testID={E2E_TEST_IDS.fullscreen.backButton}
            onPress={handleBack}
            hitSlop={FULL_SCREEN_CONSTANTS.hitSlop}>
            <MaterialIcons
              name="arrow-back"
              size={FULL_SCREEN_CONSTANTS.iconSize}
              color={theme.textColor}
            />
          </IconButton>

          <Title testID={E2E_TEST_IDS.fullscreen.title} numberOfLines={1}>
            {headerTitle}
          </Title>

          <RightActions>
            <Spacer />
          </RightActions>
        </HeaderRow>
      </Header>

      <Content
        style={{
          paddingBottom: insets.bottom,
          paddingLeft: insets.left + contentHorizontalPadding,
          paddingRight: insets.right + contentHorizontalPadding,
        }}
        onLayout={(e: LayoutChangeEvent) =>
          setContentLayoutHeight(e.nativeEvent.layout.height)
        }>
        {mode === 'cgmRows' ? (
          <CgmRows
            bgData={(params as any)?.bgData ?? []}
            isLoading={Boolean((params as any)?.isLoading)}
            isToday={Boolean((params as any)?.isToday)}
            showFullScreenButton={false}
          />
        ) : null}

        {mode === 'cgmGraph' ? (
          <Centered>
            <RotatableFrame
              testID={E2E_TEST_IDS.charts.cgmGraphFullScreen}
              style={{
                width: cgmGraphFrame.width,
                height: cgmGraphFrame.height,
              }}>
              <CgmGraph
                bgSamples={(params as any)?.bgSamples ?? []}
                foodItems={(params as any)?.foodItems ?? null}
                insulinData={(params as any)?.insulinData}
                width={Math.max(1, Math.floor(cgmGraphFrame.width))}
                height={Math.max(1, Math.floor(cgmGraphFrame.height))}
                showFullScreenButton={false}
              />
            </RotatableFrame>
          </Centered>
        ) : null}

        {mode === 'stackedCharts' ? (
          <StackedChartsFrame testID={E2E_TEST_IDS.charts.cgmGraphFullScreen}>
            <StackedChartsLandscapeRow>
              <StackedChartsPanel>
                <StackedHomeCharts
                  bgSamples={(params as any)?.bgSamples ?? []}
                  foodItems={(params as any)?.foodItems ?? null}
                  insulinData={(params as any)?.insulinData}
                  basalProfileData={(params as any)?.basalProfileData}
                  width={Math.max(1, Math.floor(stackedFrame.chartWidth))}
                  cgmHeight={stackedHeights.cgmHeight}
                  miniChartHeight={stackedHeights.miniHeight}
                  xDomain={stackedXDomain}
                  fallbackAnchorTimeMs={(params as any)?.fallbackAnchorTimeMs}
                  showFullScreenButton={false}
                  chartMode="mixed"
                  tooltipPlacement={isDeviceLandscape ? 'none' : 'inside'}
                  tooltipAlign={isDeviceLandscape ? 'auto' : 'left'}
                  tooltipFullWidth={!isDeviceLandscape}
                  tooltipMaxWidthPx={
                    isDeviceLandscape
                      ? Math.min(420, Math.floor(contentWidth * 0.42))
                      : undefined
                  }
                  onTooltipModelChange={
                    isDeviceLandscape ? setStackedTooltipModel : undefined
                  }
                />
              </StackedChartsPanel>

              {isDeviceLandscape ? (
                <StackedTooltipRail
                  pointerEvents="none"
                  style={{width: stackedFrame.tooltipRailWidth}}>
                  {stackedTooltipModel?.visible ? (
                    <HomeChartsTooltip
                      anchorTimeMs={stackedTooltipModel.anchorTimeMs}
                      bgSample={stackedTooltipModel.bgSample}
                      activeInsulinU={stackedTooltipModel.activeInsulinU}
                      activeInsulinBolusU={
                        stackedTooltipModel.activeInsulinBolusU
                      }
                      activeInsulinBasalU={
                        stackedTooltipModel.activeInsulinBasalU
                      }
                      cobG={stackedTooltipModel.cobG}
                      basalRateUhr={stackedTooltipModel.basalRateUhr}
                      bolusSummary={stackedTooltipModel.bolusSummary}
                      carbsSummary={stackedTooltipModel.carbsSummary}
                      bolusEvents={stackedTooltipModel.bolusEvents}
                      carbEvents={stackedTooltipModel.carbEvents as any}
                      fullWidth
                    />
                  ) : null}
                </StackedTooltipRail>
              ) : null}
            </StackedChartsLandscapeRow>
          </StackedChartsFrame>
        ) : null}

        {mode === 'agpGraph' ? (
          <Centered>
            <AgpChartContainer
              testID={E2E_TEST_IDS.charts.agpGraphFullScreen}
              style={{
                width: agpGraphFrame.width,
                height: agpGraphFrame.height,
              }}>
              <AgpFullScreenChart
                bgData={(params as any)?.bgData ?? []}
                width={Math.max(
                  FULL_SCREEN_CONSTANTS.agpMinWidth,
                  Math.floor(agpGraphFrame.width),
                )}
                height={Math.max(1, Math.floor(agpGraphFrame.height))}
              />
            </AgpChartContainer>
          </Centered>
        ) : null}
      </Content>
    </Screen>
  );
};

type AgpFullScreenChartProps = {
  bgData: BgSample[];
  width: number;
  height: number;
};

const AgpFullScreenChart: React.FC<AgpFullScreenChartProps> = ({
  bgData,
  width,
  height,
}) => {
  const {agpData, isLoading} = useAGPData(bgData);

  if (isLoading || !agpData) {
    return <View style={{width, height}} />;
  }

  return (
    <AGPChart
      agpData={agpData}
      width={width}
      height={height}
      targetRange={cgmRange.TARGET}
    />
  );
};

const Screen = styled.View`
  flex: 1;
  background-color: ${({theme}: {theme: ThemeType}) => theme.backgroundColor};
`;

const Header = styled.View`
  position: relative;
  z-index: 10;
  elevation: 10;
  background-color: ${({theme}: {theme: ThemeType}) => theme.backgroundColor};
`;

const HeaderRow = styled.View`
  height: ${FULL_SCREEN_CONSTANTS.headerHeight}px;
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
`;

const IconButton = styled(Pressable)`
  width: ${FULL_SCREEN_CONSTANTS.headerHeight}px;
  height: ${FULL_SCREEN_CONSTANTS.headerHeight}px;
  align-items: center;
  justify-content: center;
`;

const Title = styled.Text`
  flex: 1;
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.md}px;
  font-weight: 700;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
  text-align: center;
`;

const RightActions = styled.View`
  width: ${FULL_SCREEN_CONSTANTS.headerHeight}px;
  align-items: flex-end;
  justify-content: center;
`;

const Spacer = styled.View`
  width: ${FULL_SCREEN_CONSTANTS.headerHeight}px;
  height: ${FULL_SCREEN_CONSTANTS.headerHeight}px;
`;

const Content = styled.View`
  flex: 1;
  overflow: hidden;
`;

const Centered = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`;

const RotatableFrame = styled.View`
  align-items: center;
  justify-content: center;
`;

const AgpChartContainer = styled.View`
  align-items: center;
  justify-content: center;
`;

const StackedChartsFrame = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`;

const StackedChartsLandscapeRow = styled.View`
  flex-direction: row;
  align-items: stretch;
  justify-content: center;
`;

const StackedChartsPanel = styled.View`
  justify-content: center;
`;

const StackedTooltipRail = styled.View`
  margin-left: ${FULL_SCREEN_CONSTANTS.stackedLandscapeGap}px;
  justify-content: flex-start;
`;

export default FullScreenViewScreen;
