import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
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
import {addOpacity} from 'app/style/styling.utils';

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
type StackedRangeSelection = {start: number; end: number};
type ActiveRangeThumb = 'start' | 'end';

const DEFAULT_STACKED_RANGE_SELECTION: StackedRangeSelection = {
  start: 0,
  end: 1,
};

const MIN_STACKED_RANGE_MS = 30 * 60 * 1000;
const RANGE_SLIDER_THUMB_SIZE = 22;
const RANGE_SLIDER_TRACK_INSET = Math.ceil(RANGE_SLIDER_THUMB_SIZE / 2);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

export function getStackedMinRangeRatio(params: {
  selectableDomain: [Date, Date] | null;
}) {
  const selectableMs = getFiniteDomainMs(params.selectableDomain);
  if (!selectableMs) {
    return 0;
  }
  const durationMs = selectableMs.endMs - selectableMs.startMs;
  if (durationMs <= 0) {
    return 0;
  }
  return Math.min(1, MIN_STACKED_RANGE_MS / durationMs);
}

export function normalizeStackedRangeSelection(
  selection: StackedRangeSelection,
  minRangeRatio = 0,
): StackedRangeSelection {
  const minGap = clamp01(minRangeRatio);
  const safeStart = clamp01(selection.start);
  const safeEnd = clamp01(selection.end);

  if (minGap >= 1) {
    return DEFAULT_STACKED_RANGE_SELECTION;
  }

  let start = Math.min(safeStart, safeEnd);
  let end = Math.max(safeStart, safeEnd);

  if (end - start < minGap) {
    const midpoint = (start + end) / 2;
    start = midpoint - minGap / 2;
    end = midpoint + minGap / 2;

    if (start < 0) {
      end = minGap;
      start = 0;
    } else if (end > 1) {
      start = 1 - minGap;
      end = 1;
    }
  }

  return {start: clamp01(start), end: clamp01(end)};
}

export function updateStackedRangeSelectionForThumb(params: {
  selection: StackedRangeSelection;
  thumb: ActiveRangeThumb;
  ratio: number;
  minRangeRatio?: number;
}): StackedRangeSelection {
  const current = normalizeStackedRangeSelection(
    params.selection,
    params.minRangeRatio,
  );
  const value = clamp01(params.ratio);
  const minGap = clamp01(params.minRangeRatio ?? 0);

  if (params.thumb === 'start') {
    return {
      start: clamp(value, 0, Math.max(0, current.end - minGap)),
      end: current.end,
    };
  }

  return {
    start: current.start,
    end: clamp(value, Math.min(1, current.start + minGap), 1),
  };
}

export function getStackedSliderRatioForTouchX(params: {
  locationX: number;
  trackWidth: number;
}) {
  if (params.trackWidth <= 0) {
    return 0;
  }
  return clamp01(
    (params.locationX - RANGE_SLIDER_TRACK_INSET) / params.trackWidth,
  );
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

function getLatestBgTimeMs(bgSamples: BgSample[]) {
  let latest: number | null = null;
  for (const sample of bgSamples) {
    if (typeof sample?.date === 'number' && Number.isFinite(sample.date)) {
      latest = latest == null ? sample.date : Math.max(latest, sample.date);
    }
  }
  return latest;
}

function getEarliestBgTimeMs(bgSamples: BgSample[]) {
  let earliest: number | null = null;
  for (const sample of bgSamples) {
    if (typeof sample?.date === 'number' && Number.isFinite(sample.date)) {
      earliest =
        earliest == null ? sample.date : Math.min(earliest, sample.date);
    }
  }
  return earliest;
}

function getFiniteDomainMs(domain: [Date, Date] | null) {
  const startMs = domain?.[0]?.getTime();
  const endMs = domain?.[1]?.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }
  if (!((startMs as number) < (endMs as number))) {
    return null;
  }
  return {startMs: startMs as number, endMs: endMs as number};
}

export function getStackedSelectableDomain(params: {
  baseDomain: [Date, Date] | null;
  bgSamples: BgSample[];
}): [Date, Date] | null {
  const baseMs = getFiniteDomainMs(params.baseDomain);
  const firstBgMs = getEarliestBgTimeMs(params.bgSamples);
  const lastBgMs = getLatestBgTimeMs(params.bgSamples);

  if (
    firstBgMs != null &&
    lastBgMs != null &&
    Number.isFinite(firstBgMs) &&
    Number.isFinite(lastBgMs) &&
    firstBgMs < lastBgMs
  ) {
    const startMs = baseMs
      ? clamp(firstBgMs, baseMs.startMs, baseMs.endMs)
      : firstBgMs;
    const endMs = baseMs
      ? clamp(lastBgMs, baseMs.startMs, baseMs.endMs)
      : lastBgMs;
    if (startMs < endMs) {
      return [new Date(startMs), new Date(endMs)];
    }
  }

  return params.baseDomain;
}

export function getStackedDisplayDomain(params: {
  baseDomain: [Date, Date] | null;
  bgSamples: BgSample[];
  rangeSelection?: StackedRangeSelection;
}): [Date, Date] | null {
  const selectableDomain = getStackedSelectableDomain({
    baseDomain: params.baseDomain,
    bgSamples: params.bgSamples,
  });
  const selectableMs = getFiniteDomainMs(selectableDomain);
  if (!selectableMs) {
    return params.baseDomain;
  }

  const durationMs = selectableMs.endMs - selectableMs.startMs;
  const selection = normalizeStackedRangeSelection(
    params.rangeSelection ?? DEFAULT_STACKED_RANGE_SELECTION,
    getStackedMinRangeRatio({selectableDomain}),
  );

  const startMs = selectableMs.startMs + durationMs * selection.start;
  const endMs = selectableMs.startMs + durationMs * selection.end;

  if (!(startMs < endMs)) {
    return selectableDomain;
  }
  return [new Date(startMs), new Date(endMs)];
}

function formatRangeTimeLabel(date: Date) {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
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
  const [stackedRangeSelection, setStackedRangeSelection] =
    useState<StackedRangeSelection>(DEFAULT_STACKED_RANGE_SELECTION);

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
    if (mode === 'cgmRows') {
      return 'Glucose Log';
    }
    if (mode === 'cgmGraph') {
      return 'CGM Graph';
    }
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
    if (!xDomainMs) {
      return null;
    }
    if (
      !Number.isFinite(xDomainMs.startMs) ||
      !Number.isFinite(xDomainMs.endMs)
    ) {
      return null;
    }
    return [new Date(xDomainMs.startMs), new Date(xDomainMs.endMs)] as [
      Date,
      Date,
    ];
  }, [params]);

  const stackedDisplayXDomain = useMemo(() => {
    return getStackedDisplayDomain({
      baseDomain: stackedXDomain,
      bgSamples: (params as any)?.bgSamples ?? [],
      rangeSelection: stackedRangeSelection,
    });
  }, [params, stackedRangeSelection, stackedXDomain]);

  const stackedSelectableXDomain = useMemo(() => {
    return getStackedSelectableDomain({
      baseDomain: stackedXDomain,
      bgSamples: (params as any)?.bgSamples ?? [],
    });
  }, [params, stackedXDomain]);

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
                  xDomain={stackedDisplayXDomain}
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
                  <StackedRailControls
                    selectableDomain={stackedSelectableXDomain}
                    selectedDomain={stackedDisplayXDomain}
                    rangeSelection={stackedRangeSelection}
                    onRangeSelectionChange={setStackedRangeSelection}
                  />
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

type StackedRailControlsProps = {
  selectableDomain: [Date, Date] | null;
  selectedDomain: [Date, Date] | null;
  rangeSelection: StackedRangeSelection;
  onRangeSelectionChange: (selection: StackedRangeSelection) => void;
};

const StackedRailControls: React.FC<StackedRailControlsProps> = ({
  selectableDomain,
  selectedDomain,
  rangeSelection,
  onRangeSelectionChange,
}) => {
  const theme = useTheme() as ThemeType;
  const minRangeRatio = useMemo(
    () => getStackedMinRangeRatio({selectableDomain}),
    [selectableDomain],
  );
  const selectableStartLabel = selectableDomain
    ? formatRangeTimeLabel(selectableDomain[0])
    : '--:--';
  const selectableEndLabel = selectableDomain
    ? formatRangeTimeLabel(selectableDomain[1])
    : '--:--';
  const selectedLabel = selectedDomain
    ? `${formatRangeTimeLabel(selectedDomain[0])} - ${formatRangeTimeLabel(
        selectedDomain[1],
      )}`
    : 'Full range';

  return (
    <RailControlsCard>
      <RailHeaderRow>
        <RailSectionTitle>Time range</RailSectionTitle>
        <ResetRangeButton
          accessibilityRole="button"
          onPress={() =>
            onRangeSelectionChange(DEFAULT_STACKED_RANGE_SELECTION)
          }>
          <ResetRangeText>Full</ResetRangeText>
        </ResetRangeButton>
      </RailHeaderRow>
      <SelectedRangeLabel>{selectedLabel}</SelectedRangeLabel>
      <RangeTimelineSlider
        selection={rangeSelection}
        onChange={onRangeSelectionChange}
        disabled={!selectableDomain}
        minRangeRatio={minRangeRatio}
        tintColor={theme.textColor}
      />
      <WindowSliderFooter>
        <WindowSliderFooterText>{selectableStartLabel}</WindowSliderFooterText>
        <WindowSliderFooterText>{selectableEndLabel}</WindowSliderFooterText>
      </WindowSliderFooter>
    </RailControlsCard>
  );
};

type RangeTimelineSliderProps = {
  selection: StackedRangeSelection;
  onChange: (selection: StackedRangeSelection) => void;
  disabled: boolean;
  minRangeRatio: number;
  tintColor: string;
};

const RangeTimelineSlider: React.FC<RangeTimelineSliderProps> = ({
  selection,
  onChange,
  disabled,
  minRangeRatio,
  tintColor,
}) => {
  const [trackWidth, setTrackWidth] = useState(0);
  const [draftSelection, setDraftSelection] = useState(() =>
    normalizeStackedRangeSelection(selection, minRangeRatio),
  );
  const draftSelectionRef = useRef(draftSelection);
  const activeThumbRef = useRef<ActiveRangeThumb>('end');
  const gestureStartRef = useRef({
    touchX: 0,
    thumbRatio: 1,
    grabbedThumb: false,
    selection: normalizeStackedRangeSelection(selection, minRangeRatio),
  });
  const isDraggingRef = useRef(false);

  React.useEffect(() => {
    if (!isDraggingRef.current) {
      const normalizedSelection = normalizeStackedRangeSelection(
        selection,
        minRangeRatio,
      );
      draftSelectionRef.current = normalizedSelection;
      setDraftSelection(normalizedSelection);
    }
  }, [minRangeRatio, selection]);

  const updateDraftSelection = useCallback(
    (nextSelection: StackedRangeSelection) => {
      draftSelectionRef.current = nextSelection;
      setDraftSelection(nextSelection);
    },
    [],
  );

  const setSelectionForThumb = useCallback(
    (ratio: number) => {
      if (disabled) {
        return draftSelectionRef.current;
      }
      const nextSelection = updateStackedRangeSelectionForThumb({
        selection: gestureStartRef.current.selection,
        thumb: activeThumbRef.current,
        ratio,
        minRangeRatio,
      });
      updateDraftSelection(nextSelection);
      return nextSelection;
    },
    [disabled, minRangeRatio, updateDraftSelection],
  );

  const handleGestureStart = useCallback(
    (e: GestureResponderEvent) => {
      if (!trackWidth || disabled) {
        return;
      }
      const ratio = getStackedSliderRatioForTouchX({
        locationX: e.nativeEvent.locationX,
        trackWidth,
      });
      const currentSelection = normalizeStackedRangeSelection(
        draftSelectionRef.current,
        minRangeRatio,
      );
      const distanceToStart = Math.abs(ratio - currentSelection.start);
      const distanceToEnd = Math.abs(ratio - currentSelection.end);
      activeThumbRef.current =
        distanceToStart < distanceToEnd ? 'start' : 'end';
      const activeThumbRatio =
        activeThumbRef.current === 'start'
          ? currentSelection.start
          : currentSelection.end;
      const thumbHitRatio = (RANGE_SLIDER_THUMB_SIZE * 1.4) / trackWidth;
      const grabbedThumb = Math.abs(ratio - activeThumbRatio) <= thumbHitRatio;
      gestureStartRef.current = {
        touchX: e.nativeEvent.locationX,
        thumbRatio: activeThumbRatio,
        grabbedThumb,
        selection: currentSelection,
      };
      isDraggingRef.current = true;
      if (!grabbedThumb) {
        setSelectionForThumb(ratio);
      }
    },
    [disabled, minRangeRatio, setSelectionForThumb, trackWidth],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: handleGestureStart,
        onPanResponderMove: (_, gestureState) => {
          if (!trackWidth || disabled) {
            return;
          }
          const start = gestureStartRef.current;
          const ratio = start.grabbedThumb
            ? clamp01(start.thumbRatio + gestureState.dx / trackWidth)
            : getStackedSliderRatioForTouchX({
                locationX: start.touchX + gestureState.dx,
                trackWidth,
              });
          setSelectionForThumb(ratio);
        },
        onPanResponderRelease: () => {
          isDraggingRef.current = false;
          onChange(
            normalizeStackedRangeSelection(
              draftSelectionRef.current,
              minRangeRatio,
            ),
          );
        },
        onPanResponderTerminate: () => {
          isDraggingRef.current = false;
          onChange(
            normalizeStackedRangeSelection(
              draftSelectionRef.current,
              minRangeRatio,
            ),
          );
        },
      }),
    [
      disabled,
      handleGestureStart,
      minRangeRatio,
      onChange,
      setSelectionForThumb,
      trackWidth,
    ],
  );

  const normalizedDraftSelection = normalizeStackedRangeSelection(
    draftSelection,
    minRangeRatio,
  );
  const startPct = normalizedDraftSelection.start * 100;
  const endPct = normalizedDraftSelection.end * 100;

  return (
    <RangeTimelineHitArea
      testID="fullscreen.stackedRangeSlider"
      {...panResponder.panHandlers}>
      <RangeTimelineTrack
        onLayout={(e: LayoutChangeEvent) =>
          setTrackWidth(e.nativeEvent.layout.width)
        }>
        <RangeTimelineFill
          style={{
            left: `${startPct}%`,
            width: `${Math.max(0, endPct - startPct)}%`,
            backgroundColor: tintColor,
          }}
        />
        <RangeTimelineThumb
          style={{
            left: `${startPct}%`,
            backgroundColor: tintColor,
          }}
        />
        <RangeTimelineThumb
          style={{
            left: `${endPct}%`,
            backgroundColor: tintColor,
          }}
        />
      </RangeTimelineTrack>
    </RangeTimelineHitArea>
  );
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

const RailControlsCard = styled.View`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  margin-left: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  margin-right: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  border-radius: ${({theme}: {theme: ThemeType}) => theme.borderRadius}px;
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) =>
    addOpacity(theme.textColor, 0.12)};
  background-color: ${({theme}: {theme: ThemeType}) => theme.white};
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px;
`;

const RailSectionTitle = styled.Text`
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
  font-weight: 800;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.72)};
`;

const RailHeaderRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const ResetRangeButton = styled(Pressable)`
  min-height: 28px;
  padding-horizontal: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  align-items: center;
  justify-content: center;
  border-radius: ${({theme}: {theme: ThemeType}) => theme.borderRadius}px;
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) =>
    addOpacity(theme.textColor, 0.14)};
`;

const ResetRangeText = styled.Text`
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.xs}px;
  font-weight: 800;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

const SelectedRangeLabel = styled.Text`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.xs}px;
  font-weight: 900;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

const RangeTimelineHitArea = styled.View`
  height: 56px;
  padding-horizontal: ${RANGE_SLIDER_TRACK_INSET}px;
  justify-content: center;
`;

const RangeTimelineTrack = styled.View`
  height: 8px;
  border-radius: 4px;
  background-color: ${({theme}: {theme: ThemeType}) =>
    addOpacity(theme.textColor, 0.14)};
`;

const RangeTimelineFill = styled.View`
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 4px;
`;

const RangeTimelineThumb = styled.View`
  position: absolute;
  top: -${Math.floor((RANGE_SLIDER_THUMB_SIZE - 8) / 2)}px;
  width: ${RANGE_SLIDER_THUMB_SIZE}px;
  height: ${RANGE_SLIDER_THUMB_SIZE}px;
  margin-left: -${Math.floor(RANGE_SLIDER_THUMB_SIZE / 2)}px;
  border-radius: ${Math.floor(RANGE_SLIDER_THUMB_SIZE / 2)}px;
  border-width: 3px;
  border-color: ${({theme}: {theme: ThemeType}) => theme.white};
`;

const WindowSliderFooter = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const WindowSliderFooterText = styled.Text`
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.xs}px;
  font-weight: 700;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.56)};
`;

export default FullScreenViewScreen;
