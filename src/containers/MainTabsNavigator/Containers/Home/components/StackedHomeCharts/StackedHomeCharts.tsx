import React, {useMemo} from 'react';

import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import styled, {useTheme} from 'styled-components/native';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';

import BgGraph from 'app/components/charts/CgmGraph/CgmGraph';
import BasalMiniGraph from 'app/components/charts/BasalMiniGraph/BasalMiniGraph';
import BolusMiniGraph from 'app/components/charts/BolusMiniGraph/BolusMiniGraph';
import ActiveInsulinMiniGraph from 'app/components/charts/ActiveInsulinMiniGraph/ActiveInsulinMiniGraph';
import CobMiniGraph from 'app/components/charts/CobMiniGraph/CobMiniGraph';
import MixedMiniChart from 'app/components/charts/MixedMiniChart/MixedMiniChart';
import HomeChartsTooltip from 'app/containers/MainTabsNavigator/Containers/Home/components/HomeChartsTooltip';
import type {ChartMargin} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';
import {useBasalRateAtTime} from './hooks/useBasalRateAtTime';
import {useBgTooltipDerivedMetrics} from './hooks/useBgTooltipDerivedMetrics';
import {useEmitStackedChartsTooltipModel} from './hooks/useEmitStackedChartsTooltipModel';
import {useStackedChartsTooltipModel} from './hooks/useStackedChartsTooltipModel';
import {useStackedChartsTouchTooltip} from './hooks/useStackedChartsTouchTooltip';
import {useTooltipEventsSummary} from './hooks/useTooltipEventsSummary';

import type {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import type {
  StackedChartsTooltipModel,
  StackedHomeChartsProps,
} from './StackedHomeCharts.types';

const StackedHomeCharts: React.FC<StackedHomeChartsProps> = props => {
  const {
    locale,
    bgSamples,
    foodItems,
    insulinData,
    basalProfileData,
    width,
    cgmHeight,
    miniChartHeight,
    xDomain,
    fallbackAnchorTimeMs,
    margin: marginOverride,
    showFullScreenButton = true,
    onPressFullScreen,
    testID,
    tooltipPlacement = 'above',
    tooltipAlign = 'left',
    tooltipFullWidth = true,
    tooltipMaxWidthPx,
    chartMode = 'separate',
    onTooltipModelChange,
    onTouchSessionChange,
  } = props;

  const theme = useTheme() as ThemeType;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {language} = useAppLanguage();
  const resolvedLocale = locale ?? language;

  const stackedChartsMargin = useMemo<ChartMargin>(
    () =>
      marginOverride ?? {
        top: 20,
        right: 15,
        bottom: 30,
        left: 50,
      },
    [marginOverride],
  );

  const {
    chartsTooltip,
    handleTooltipChange,
    touchHandlers: stackedTouchHandlers,
    mouseHandlers,
  } = useStackedChartsTouchTooltip({
    bgSamples,
    width,
    margin: stackedChartsMargin,
    xDomain,
    onTouchSessionChange,
  });

  const {
    shouldShowTooltip,
    cgmAnchorTimeMs,
    cursorTimeMs,
    resolvedTooltipAlign,
    tooltipBgSample,
    tooltipBolusEvents,
    tooltipCarbEvents,
  } = useStackedChartsTooltipModel({
    chartsTooltip,
    bgSamples,
    foodItems,
    insulinData,
    fallbackAnchorTimeMs,
    width,
    marginLeft: stackedChartsMargin.left,
    marginRight: stackedChartsMargin.right,
    xDomain,
    tooltipAlign,
    showFallback: tooltipPlacement === 'panel',
  });

  const {activeInsulinU, activeInsulinBolusU, activeInsulinBasalU, cobG} =
    useBgTooltipDerivedMetrics(tooltipBgSample);

  const {bolusSummary, carbsSummary} = useTooltipEventsSummary({
    bolusEvents: tooltipBolusEvents as any,
    carbEvents: tooltipCarbEvents as any,
  });

  const basalRateUhr = useBasalRateAtTime({
    enabled: shouldShowTooltip,
    timeMs: cgmAnchorTimeMs,
    insulinData,
    basalProfileData,
  });

  const tooltipOverlayTestID = testID ? `${testID}.tooltipOverlay` : undefined;
  const tooltipDockTestID = testID ? `${testID}.tooltipDock` : undefined;
  const cgmTouchAreaTestID = testID ? `${testID}.cgmTouchArea` : undefined;

  const emittedTooltipModel = useMemo<StackedChartsTooltipModel>(
    () => ({
      visible: shouldShowTooltip,
      anchorTimeMs: cgmAnchorTimeMs,
      bgSample: tooltipBgSample,
      activeInsulinU,
      activeInsulinBolusU,
      activeInsulinBasalU,
      cobG,
      basalRateUhr,
      bolusSummary,
      carbsSummary,
      bolusEvents: tooltipBolusEvents,
      carbEvents: tooltipCarbEvents,
      fullWidth: tooltipFullWidth,
      maxWidthPx: tooltipMaxWidthPx,
    }),
    [
      shouldShowTooltip,
      cgmAnchorTimeMs,
      tooltipBgSample,
      activeInsulinU,
      activeInsulinBolusU,
      activeInsulinBasalU,
      cobG,
      basalRateUhr,
      bolusSummary,
      carbsSummary,
      tooltipBolusEvents,
      tooltipCarbEvents,
      tooltipFullWidth,
      tooltipMaxWidthPx,
    ],
  );
  useEmitStackedChartsTooltipModel({
    model: emittedTooltipModel,
    onTooltipModelChange,
  });

  // Every placement uses the same inspector model and renderer.
  const inspector = (
    <HomeChartsTooltip
      {...emittedTooltipModel}
      locale={resolvedLocale}
      compact={tooltipPlacement === 'panel'}
    />
  );

  // Whether to render the tooltip inside this component
  const renderTooltipInternally = tooltipPlacement !== 'none';
  const hasVisibleGlucose = bgSamples.some(
    sample =>
      Number.isFinite(sample.sgv) &&
      sample.sgv > 0 &&
      (!xDomain || (sample.date >= +xDomain[0] && sample.date <= +xDomain[1])),
  );

  return (
    <View testID={testID}>
      {tooltipPlacement === 'panel' ? (
        <View testID={tooltipDockTestID}>{inspector}</View>
      ) : null}
      {/* 'top' placement: tooltip in normal flow ABOVE the chart stack */}
      {renderTooltipInternally &&
      tooltipPlacement === 'top' &&
      shouldShowTooltip ? (
        <TooltipDock testID={tooltipDockTestID} $align={resolvedTooltipAlign}>
          {inspector}
        </TooltipDock>
      ) : null}

      <View
        style={[
          styles.chartHeader,
          showFullScreenButton && styles.headerWithButton,
        ]}>
        <Text
          style={[
            styles.glucoseTitle,
            {color: theme.textColor},
            resolvedLocale === 'he' ? styles.rtl : styles.ltr,
          ]}>
          {resolvedLocale === 'he' ? 'סוכר' : 'Glucose'} · mg/dL
        </Text>
        {!!foodItems?.length && (
          <Text
            style={[
              styles.carbKey,
              {color: theme.colors.carbs},
              resolvedLocale === 'he' ? styles.rtl : styles.ltr,
            ]}>
            {resolvedLocale === 'he' ? '● פחמימות שנרשמו' : '● Recorded carbs'}
          </Text>
        )}
        {showFullScreenButton && onPressFullScreen ? (
          <FullScreenButtonOverlay>
            <FullScreenButton
              testID={E2E_TEST_IDS.charts.cgmGraphFullScreenButton}
              onPress={onPressFullScreen}
              accessibilityRole="button"
              accessibilityLabel={
                resolvedLocale === 'he' ? 'מסך מלא' : 'Full screen'
              }>
              <Icon name="fullscreen" size={22} color={theme.textColor} />
            </FullScreenButton>
          </FullScreenButtonOverlay>
        ) : null}
      </View>
      <ChartStack
        testID={cgmTouchAreaTestID}
        {...stackedTouchHandlers}
        {...mouseHandlers}
        style={touchSurfaceStyle}>
        {/* 'above' / 'inside' placement: absolute overlay inside ChartStack */}
        {renderTooltipInternally &&
        tooltipPlacement !== 'top' &&
        tooltipPlacement !== 'panel' &&
        shouldShowTooltip ? (
          <ChartTooltipOverlay
            $placement={tooltipPlacement === 'inside' ? 'inside' : 'above'}
            pointerEvents="none"
            testID={tooltipOverlayTestID}>
            <TooltipDock
              testID={tooltipDockTestID}
              $align={resolvedTooltipAlign}>
              {inspector}
            </TooltipDock>
          </ChartTooltipOverlay>
        ) : null}

        <View pointerEvents="none">
          {hasVisibleGlucose ? (
            <BgGraph
              bgSamples={bgSamples}
              width={width}
              height={cgmHeight}
              foodItems={foodItems}
              insulinData={insulinData}
              xDomain={xDomain}
              margin={stackedChartsMargin}
              testID={testID ? `${testID}.glucose` : undefined}
              showFullScreenButton={false}
              showDateLabels={false}
              showBolusMarkers={false}
              highlightedCarbIds={tooltipCarbEvents.map(event => event.id)}
              tooltipMode="external"
              onTooltipChange={handleTooltipChange}
              handleTouchEvents={false}
              cursorTimeMs={cursorTimeMs}
            />
          ) : (
            <View
              style={styles.emptyGlucose}
              testID={testID ? `${testID}.glucoseEmpty` : undefined}>
              <Text
                style={[
                  {color: theme.textColor},
                  resolvedLocale === 'he' ? styles.rtl : styles.ltr,
                ]}>
                {resolvedLocale === 'he'
                  ? 'אין מדידות סוכר בטווח שנבחר'
                  : 'No glucose readings in this time range'}
              </Text>
            </View>
          )}
        </View>
      </ChartStack>

      {/* Mini charts area — observe touch without taking over ScrollView's responder. */}
      <View
        {...stackedTouchHandlers}
        {...mouseHandlers}
        style={touchSurfaceStyle}
        testID={testID ? `${testID}.insulinTouchArea` : undefined}>
        <View pointerEvents="none">
          <BolusMiniGraph
            locale={resolvedLocale}
            bgSamples={bgSamples}
            insulinData={insulinData}
            width={width}
            height={Math.max(100, miniChartHeight)}
            xDomain={xDomain}
            margin={stackedChartsMargin}
            cursorTimeMs={cursorTimeMs}
            testID={testID ? `${testID}.bolus` : undefined}
          />
          {chartMode === 'mixed' ? (
            <MixedMiniChart
              locale={resolvedLocale}
              bgSamples={bgSamples}
              insulinData={insulinData}
              basalProfileData={basalProfileData}
              width={width}
              height={Math.max(300, miniChartHeight * 3)}
              xDomain={xDomain}
              margin={{
                top: 16,
                right: stackedChartsMargin.right,
                bottom: 16,
                left: stackedChartsMargin.left,
              }}
              cursorTimeMs={cursorTimeMs}
              testID={testID ? `${testID}.mixed` : undefined}
            />
          ) : (
            <>
              <BasalMiniGraph
                locale={resolvedLocale}
                bgSamples={bgSamples}
                insulinData={insulinData}
                basalProfileData={basalProfileData}
                width={width}
                height={miniChartHeight}
                xDomain={xDomain}
                margin={{
                  top: 8,
                  right: stackedChartsMargin.right,
                  bottom: 12,
                  left: stackedChartsMargin.left,
                }}
                cursorTimeMs={cursorTimeMs}
                testID={testID ? `${testID}.basal` : undefined}
              />

              <ActiveInsulinMiniGraph
                locale={resolvedLocale}
                bgSamples={bgSamples}
                width={width}
                height={miniChartHeight}
                xDomain={xDomain}
                margin={{
                  top: 18,
                  right: stackedChartsMargin.right,
                  bottom: 12,
                  left: stackedChartsMargin.left,
                }}
                cursorTimeMs={cursorTimeMs}
                testID={testID ? `${testID}.iob` : undefined}
              />

              <CobMiniGraph
                locale={resolvedLocale}
                bgSamples={bgSamples}
                width={width}
                height={miniChartHeight}
                xDomain={xDomain}
                margin={{
                  top: 18,
                  right: stackedChartsMargin.right,
                  bottom: 12,
                  left: stackedChartsMargin.left,
                }}
                cursorTimeMs={cursorTimeMs}
                testID={testID ? `${testID}.cob` : undefined}
              />
            </>
          )}
        </View>
      </View>
    </View>
  );
};

const touchSurfaceStyle =
  Platform.OS === 'web'
    ? ({touchAction: 'pan-y pinch-zoom', userSelect: 'none'} as ViewStyle)
    : undefined;

const ChartStack = styled.View`
  position: relative;
`;

const createStyles = (theme: ThemeType) =>
  StyleSheet.create({
    chartHeader: {
      paddingHorizontal: theme.spacing.md,
      paddingTop: 10,
      minHeight: 58,
      justifyContent: 'center',
    },
    headerWithButton: {paddingRight: 64},
    glucoseTitle: {
      fontWeight: '700',
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.sm,
    },
    carbKey: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.xs,
      marginTop: 4,
    },
    emptyGlucose: {minHeight: 64, padding: 12},
    rtl: {textAlign: 'right'},
    ltr: {textAlign: 'left'},
  });

const ChartTooltipOverlay = styled.View<{$placement: 'above' | 'inside'}>`
  position: absolute;
  left: 0;
  right: 0;
  ${({$placement}: {$placement: 'above' | 'inside'}) =>
    $placement === 'inside' ? 'top: 0;' : 'bottom: 100%;'}
  z-index: 999;
  elevation: 20;
`;

const TooltipDock = styled.View<{$align: 'left' | 'right'}>`
  width: 100%;
  flex-direction: row;
  justify-content: ${({$align}: {$align: 'left' | 'right'}) =>
    $align === 'right' ? 'flex-end' : 'flex-start'};
`;

const FullScreenButtonOverlay = styled.View`
  position: absolute;
  top: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  right: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  z-index: 100;
  elevation: 10;
`;

const FullScreenButton = styled(Pressable)`
  width: 44px;
  height: 44px;
  border-radius: 22px;
  align-items: center;
  justify-content: center;
  background-color: ${({theme}: {theme: ThemeType}) =>
    addOpacity(theme.white, 0.9)};
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) =>
    addOpacity(theme.textColor, 0.12)};
`;

export default StackedHomeCharts;
