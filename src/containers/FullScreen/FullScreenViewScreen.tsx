import React, {useMemo, useState} from 'react';
import {LayoutChangeEvent, Pressable, StatusBar, useWindowDimensions, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import styled, {useTheme} from 'styled-components/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {ThemeType} from 'app/types/theme';
import {BgSample} from 'app/types/day_bgs.types';
import CgmRows from 'app/components/CgmCardListDisplay/CgmRows';
import CgmGraph from 'app/components/charts/CgmGraph/CgmGraph';
import StackedHomeCharts from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts';
import {FoodItemDTO, formattedFoodItemDTO, FormattedFoodItemDTO} from 'app/types/food.types';
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
} as const;

type Mode = 'cgmRows' | 'cgmGraph' | 'stackedCharts' | 'agpGraph';

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

const FullScreenViewScreen: React.FC<{navigation: any; route: any}> = ({navigation, route}) => {
  const theme = useTheme() as ThemeType;
  const insets = useSafeAreaInsets();
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();

  const params = (route as any)?.params as FullScreenRouteParams | undefined;
  const mode: Mode = params?.mode ?? 'cgmRows';

  const [preferLandscape, setPreferLandscape] = useState(false);
  const [contentLayoutHeight, setContentLayoutHeight] = useState<number | null>(null);

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
    if (typeof contentLayoutHeight === 'number' && Number.isFinite(contentLayoutHeight)) {
      return Math.max(0, contentLayoutHeight - insets.bottom);
    }
    // Fallback to the computed value (already excludes header).
    return contentHeight;
  }, [contentHeight, contentLayoutHeight, insets.bottom]);

  const shouldAllowLandscapeToggle = mode === 'cgmGraph' || mode === 'agpGraph';

  const showLandscape = shouldAllowLandscapeToggle && preferLandscape;

  const isDeviceLandscape = screenWidth > screenHeight;

  const graphFrame = useMemo(() => {
    // Normal portrait fullscreen
    const wPortrait = screenWidth;
    const hPortrait = contentInnerHeight || FULL_SCREEN_CONSTANTS.defaultCgmGraphHeightFallback;

    // Landscape fullscreen: we rotate the chart content to feel like horizontal fullscreen.
    // We keep it centered within the screen.
    const wLandscape = hPortrait;
    const hLandscape = wPortrait;

    return {
      width: showLandscape ? wLandscape : wPortrait,
      height: showLandscape ? hLandscape : hPortrait,
      rotate: showLandscape,
    };
  }, [contentInnerHeight, screenWidth, showLandscape]);

  const handleBack = () => {
    // In some navigation states (or E2E automation timing), goBack() can be a no-op
    // if the current navigator has no back stack. Fall back to parent, then tabs.
    if (typeof navigation?.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    const parent = typeof navigation?.getParent === 'function' ? navigation.getParent() : null;
    if (parent && typeof parent.canGoBack === 'function' && parent.canGoBack()) {
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
    if (mode === 'stackedCharts') return 'Charts';
    return 'AGP Graph';
  }, [mode]);

  const stackedXDomain = useMemo(() => {
    const xDomainMs = (params as any)?.xDomainMs as
      | {startMs: number; endMs: number}
      | null
      | undefined;
    if (!xDomainMs) return null;
    if (!Number.isFinite(xDomainMs.startMs) || !Number.isFinite(xDomainMs.endMs)) return null;
    return [new Date(xDomainMs.startMs), new Date(xDomainMs.endMs)] as [Date, Date];
  }, [params]);

  const stackedHeights = useMemo(() => {
    // Ensure CGM + both mini charts always fit on screen.
    // In landscape, vertical space is tighter, so we bias a bit more towards minis.
    const minCgm = isDeviceLandscape ? 120 : 220;
    const maxCgm = 420;

    // Minis need enough height to show their titles + meaningful plot area.
    const minMini = isDeviceLandscape ? 84 : 80;
    const maxMini = isDeviceLandscape ? 150 : 160;

    // Absolute floor to keep mini charts readable even on very small heights.
    const hardMinMini = isDeviceLandscape ? 72 : 64;

    const idealMini = Math.floor(contentInnerHeight * (isDeviceLandscape ? 0.28 : 0.19));
    let mini = Math.max(minMini, Math.min(maxMini, idealMini));
    mini = Math.max(hardMinMini, mini);

    let cgm = contentInnerHeight - 2 * mini;

    // Try to keep a usable CGM height by shrinking minis (but never below hardMinMini).
    if (cgm < minCgm) {
      const targetMini = Math.floor((contentInnerHeight - minCgm) / 2);
      mini = Math.max(hardMinMini, Math.min(mini, targetMini));
      cgm = contentInnerHeight - 2 * mini;
    }

    // Clamp CGM upper bound, then ensure we do not overflow.
    cgm = Math.min(maxCgm, Math.max(0, cgm));

    const total = cgm + 2 * mini;
    if (total > contentInnerHeight) {
      // Never let the stack overflow (which would clip the bottom chart).
      cgm = Math.max(0, contentInnerHeight - 2 * mini);
    }

    return {cgmHeight: Math.floor(cgm), miniHeight: Math.floor(mini)};
  }, [contentInnerHeight, isDeviceLandscape]);

  return (
    <Screen testID={E2E_TEST_IDS.fullscreen.screen}>
      <StatusBar hidden={false} backgroundColor={theme.backgroundColor} />

      <Header style={{paddingTop: insets.top}}>
        <HeaderRow>
          <IconButton
            testID={E2E_TEST_IDS.fullscreen.backButton}
            onPress={handleBack}
            hitSlop={FULL_SCREEN_CONSTANTS.hitSlop}
          >
            <MaterialIcons name="arrow-back" size={FULL_SCREEN_CONSTANTS.iconSize} color={theme.textColor} />
          </IconButton>

          <Title testID={E2E_TEST_IDS.fullscreen.title} numberOfLines={1}>
            {headerTitle}
          </Title>

          <RightActions>
            {shouldAllowLandscapeToggle ? (
              <IconButton
                testID={E2E_TEST_IDS.fullscreen.rotateButton}
                onPress={() => setPreferLandscape(v => !v)}
                hitSlop={FULL_SCREEN_CONSTANTS.hitSlop}
              >
                <MaterialIcons
                  name={preferLandscape ? 'screen-lock-portrait' : 'screen-rotation'}
                  size={FULL_SCREEN_CONSTANTS.iconSize}
                  color={theme.textColor}
                />
              </IconButton>
            ) : (
              <Spacer />
            )}
          </RightActions>
        </HeaderRow>
      </Header>

      <Content
        style={{paddingBottom: insets.bottom}}
        onLayout={(e: LayoutChangeEvent) => setContentLayoutHeight(e.nativeEvent.layout.height)}
      >
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
              style={
                graphFrame.rotate
                  ? {
                      width: graphFrame.width,
                      height: graphFrame.height,
                      transform: [{rotate: '90deg'}],
                    }
                  : {width: graphFrame.width, height: graphFrame.height}
              }
            >
              <CgmGraph
                bgSamples={(params as any)?.bgSamples ?? []}
                foodItems={(params as any)?.foodItems ?? null}
                insulinData={(params as any)?.insulinData}
                width={Math.max(1, Math.floor(graphFrame.width))}
                height={Math.max(1, Math.floor(graphFrame.height))}
                showFullScreenButton={false}
              />
            </RotatableFrame>
          </Centered>
        ) : null}

        {mode === 'stackedCharts' ? (
          <View testID={E2E_TEST_IDS.charts.cgmGraphFullScreen}>
            <StackedHomeCharts
              bgSamples={(params as any)?.bgSamples ?? []}
              foodItems={(params as any)?.foodItems ?? null}
              insulinData={(params as any)?.insulinData}
              basalProfileData={(params as any)?.basalProfileData}
              width={Math.max(1, Math.floor(screenWidth))}
              cgmHeight={stackedHeights.cgmHeight}
              miniChartHeight={stackedHeights.miniHeight}
              xDomain={stackedXDomain}
              fallbackAnchorTimeMs={(params as any)?.fallbackAnchorTimeMs}
              showFullScreenButton={false}
              tooltipPlacement="inside"
              tooltipAlign={isDeviceLandscape ? 'auto' : 'left'}
              tooltipFullWidth={!isDeviceLandscape}
              tooltipMaxWidthPx={isDeviceLandscape ? Math.floor(screenWidth * 0.5) : undefined}
            />
          </View>
        ) : null}

        {mode === 'agpGraph' ? (
          <Centered>
            <AgpChartContainer
              testID={E2E_TEST_IDS.charts.agpGraphFullScreen}
              style={
                graphFrame.rotate
                  ? {
                      width: graphFrame.width,
                      height: graphFrame.height,
                      transform: [{rotate: '90deg'}],
                    }
                  : {width: graphFrame.width, height: graphFrame.height}
              }
            >
              <AgpFullScreenChart
                bgData={(params as any)?.bgData ?? []}
                width={Math.max(FULL_SCREEN_CONSTANTS.agpMinWidth, Math.floor(graphFrame.width))}
                height={Math.max(1, Math.floor(graphFrame.height))}
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

const AgpFullScreenChart: React.FC<AgpFullScreenChartProps> = ({bgData, width, height}) => {
  const {agpData, isLoading} = useAGPData(bgData);

  if (isLoading || !agpData) {
    return <View style={{width, height}} />;
  }

  return <AGPChart agpData={agpData} width={width} height={height} targetRange={cgmRange.TARGET} />;
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

export default FullScreenViewScreen;
