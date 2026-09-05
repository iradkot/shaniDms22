import React, {useMemo, useState} from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import type {LayoutChangeEvent} from 'react-native';
import {useTheme} from 'styled-components/native';
import StackedHomeCharts from '../../containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts';
import {TouchProvider} from '../../components/charts/CgmGraph/contextStores/TouchContext';
import type {DayGraphModel} from '../../modules/dayGraph';
import type {ThemeType} from '../../types/theme';
import {addOpacity} from '../../style/styling.utils';
import {getChartPalette} from '../../components/charts/chartPalette';
import type {DestinationLocale} from '../destinations';
import {productUiTokens} from '../ui';
import {buildDayGraphChartPresentation} from './DayGraphChartAdapter';
import type {DayGraphChartPreferencesRuntime} from './runtime';
import {useDayGraphView} from './useDayGraphView';

const COPY = {
  en: {
    detailed: 'Detailed',
    combined: 'Compact',
    hint: 'Tap to inspect. Drag sideways through time; swipe up or down to scroll.',
    factual:
      'Nightscout records and your journal entries keep their own source labels.',
    glucose: 'Glucose',
    boluses: 'Boluses',
    basal: 'Basal',
    iob: 'Active insulin',
    cob: 'Active carbs',
    fullDay: 'Full day',
    hours: 'h',
    earlier: 'Earlier hours',
    later: 'Later hours',
    fullScreenTitle: 'Day graph',
    close: 'Back to day',
    save: 'Remember this view',
    saving: 'Saving on this device…',
    remembered: 'Default view',
    saveFailed:
      'Could not save on this device. Try again. The graph is still available.',
    phone: 'Phone',
    tablet: 'Tablet',
    desktop: 'Desktop',
  },
  he: {
    detailed: 'מפורט',
    combined: 'קומפקטי',
    hint: 'נגיעה לבדיקת נתון. גרירה לצדדים לשינוי השעה, ולמעלה או למטה לגלילה.',
    factual: 'רשומות Nightscout והרשומות מהיומן מוצגות עם מקור המידע שלהן.',
    glucose: 'סוכר',
    boluses: 'בולוסים',
    basal: 'בזאל',
    iob: 'אינסולין פעיל',
    cob: 'פחמימות פעילות',
    fullDay: 'יום מלא',
    hours: 'ש׳',
    earlier: 'שעות קודמות',
    later: 'שעות הבאות',
    fullScreenTitle: 'גרף יומי',
    close: 'חזרה ליום',
    save: 'שמירת התצוגה כברירת מחדל',
    saving: 'שומר במכשיר…',
    remembered: 'תצוגת ברירת המחדל',
    saveFailed: 'לא הצלחנו לשמור במכשיר. אפשר לנסות שוב. הגרף עדיין זמין.',
    phone: 'טלפון',
    tablet: 'טאבלט',
    desktop: 'מחשב',
  },
} as const;

export interface RichDayGraphChartProps {
  readonly locale: DestinationLocale;
  readonly model: DayGraphModel;
  readonly selectedTimestampMs?: number | undefined;
  readonly preferences?: DayGraphChartPreferencesRuntime;
}

export const RichDayGraphChart = ({
  locale,
  model,
  selectedTimestampMs,
  preferences,
}: RichDayGraphChartProps) => {
  const theme = useTheme() as ThemeType;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const palette = getChartPalette(theme);
  const legendColors: Readonly<Record<string, string>> = {
    glucose: theme.inRangeColor,
    boluses: palette.bolus,
    basal: palette.basal,
    iob: palette.iob,
    cob: palette.cob,
  };
  const rtl = locale === 'he';
  const copy = COPY[locale];
  const viewport = useWindowDimensions();
  const initialWidth = Math.max(
    220,
    Math.min(
      viewport.width - theme.spacing.lg * 4,
      productUiTokens.layout.contentMaxWidth - theme.spacing.lg * 2,
    ),
  );
  const [measuredWidth, setMeasuredWidth] = useState(initialWidth);
  const [fullscreenWidth, setFullscreenWidth] = useState(viewport.width);
  const [fullscreen, setFullscreen] = useState(false);
  const chart = useMemo(() => buildDayGraphChartPresentation(model), [model]);
  const dayStartMs = model.period.dayStartMs;
  const dayEndMs = model.period.dayEndMs;
  const focusedMs =
    selectedTimestampMs !== undefined &&
    selectedTimestampMs >= dayStartMs &&
    selectedTimestampMs < dayEndMs
      ? selectedTimestampMs
      : undefined;
  const {
    mode,
    setMode,
    windowHours,
    setWindowHours,
    windowAnchor,
    setWindowAnchor,
    isRemembered,
    saveStatus,
    save,
  } = useDayGraphView(dayStartMs, focusedMs, preferences);
  const windowMs =
    windowHours === 'full-day'
      ? dayEndMs - dayStartMs
      : Math.min(windowHours * 3600000, dayEndMs - dayStartMs);
  const anchor =
    windowAnchor ?? focusedMs ?? chart.fallbackAnchorTimeMs ?? dayStartMs;
  const startMs = Math.max(
    dayStartMs,
    Math.min(anchor - windowMs / 2, dayEndMs - windowMs),
  );
  const endMs = startMs + windowMs;
  const xDomain = useMemo<[Date, Date]>(
    () => [new Date(startMs), new Date(endMs)],
    [startMs, endMs],
  );
  const chartWidth = Math.max(
    220,
    Math.floor(fullscreen ? fullscreenWidth : measuredWidth) - 2,
  );
  const wide = chartWidth >= 720;
  const availability = [
    {key: 'glucose', label: copy.glucose, visible: chart.bgSamples.length > 0},
    {key: 'boluses', label: copy.boluses, visible: chart.availability.boluses},
    {key: 'basal', label: copy.basal, visible: chart.availability.basal},
    {key: 'iob', label: copy.iob, visible: chart.availability.activeInsulin},
    {
      key: 'cob',
      label: copy.cob,
      visible: chart.availability.activeCarbohydrates,
    },
  ].filter(item => item.visible);
  const onLayout = (event: LayoutChangeEvent): void => {
    const nextWidth = Math.floor(event.nativeEvent.layout.width);
    if (Number.isFinite(nextWidth) && nextWidth >= 220) {
      const updateWidth = fullscreen ? setFullscreenWidth : setMeasuredWidth;
      updateWidth(current => (current === nextWidth ? current : nextWidth));
    }
  };

  const preferenceControls = preferences?.onSave ? (
    <View style={styles.preferences}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          disabled: isRemembered || saveStatus === 'saving',
          busy: saveStatus === 'saving',
        }}
        disabled={isRemembered || saveStatus === 'saving'}
        onPress={save}
        style={[styles.saveButton, isRemembered && styles.remembered]}
        testID="day-graph-remember-view">
        <Text style={[styles.saveLabel, rtl && styles.rtlText]}>
          {saveStatus === 'saving'
            ? copy.saving
            : `${isRemembered ? copy.remembered : copy.save} · ${
                copy[preferences.layout]
              }`}
        </Text>
      </Pressable>
      {saveStatus === 'error' ? (
        <Text
          accessibilityRole="alert"
          style={[styles.saveError, rtl && styles.rtlText]}
          testID="day-graph-preferences-error">
          {copy.saveFailed}
        </Text>
      ) : null}
    </View>
  ) : null;
  const compact = fullscreen && viewport.width >= 600;
  const content = (
    <View
      onLayout={onLayout}
      style={styles.shell}
      testID="day-graph-rich-chart">
      <View
        style={[
          compact && styles.compactControls,
          compact && rtl && styles.rowReverse,
        ]}>
        <View
          style={[
            styles.toolbar,
            compact && styles.compactToolbar,
            rtl && styles.rowReverse,
          ]}>
          <View style={[styles.modeGroup, rtl && styles.rowReverse]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{selected: mode === 'separate'}}
              aria-pressed={mode === 'separate'}
              onPress={() => setMode('separate')}
              style={[
                styles.modeButton,
                mode === 'separate' && styles.modeButtonSelected,
              ]}
              testID="day-graph-chart-mode-detailed">
              <Text
                style={[
                  styles.modeLabel,
                  mode === 'separate' && styles.modeLabelSelected,
                ]}>
                {copy.detailed}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{selected: mode === 'mixed'}}
              aria-pressed={mode === 'mixed'}
              onPress={() => setMode('mixed')}
              style={[
                styles.modeButton,
                mode === 'mixed' && styles.modeButtonSelected,
              ]}
              testID="day-graph-chart-mode-combined">
              <Text
                style={[
                  styles.modeLabel,
                  mode === 'mixed' && styles.modeLabelSelected,
                ]}>
                {copy.combined}
              </Text>
            </Pressable>
          </View>
          {!fullscreen ? (
            <Text style={[styles.hint, rtl && styles.rtlText]}>
              {copy.hint}
            </Text>
          ) : null}
        </View>

        <View style={[styles.legend, rtl && styles.rowReverse]}>
          {(['full-day', 12, 6, 3] as const).map(hours => (
            <Pressable
              key={hours}
              accessibilityRole="button"
              accessibilityState={{selected: windowHours === hours}}
              aria-pressed={windowHours === hours}
              onPress={() => {
                setWindowHours(hours);
              }}
              style={[
                styles.rangeButton,
                windowHours === hours && styles.rangeSelected,
              ]}
              testID={`day-graph-range-${
                hours === 'full-day' ? 'all' : hours
              }`}>
              <Text
                style={[
                  styles.legendLabel,
                  windowHours === hours && styles.rangeLabelSelected,
                ]}>
                {hours === 'full-day' ? copy.fullDay : `${hours} ${copy.hours}`}
              </Text>
            </Pressable>
          ))}
          {windowHours !== 'full-day' ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.earlier}
                disabled={startMs <= dayStartMs}
                onPress={() => setWindowAnchor(startMs - windowMs / 2)}
                style={[
                  styles.rangeButton,
                  startMs <= dayStartMs && styles.disabled,
                ]}
                testID="day-graph-window-earlier">
                <Text style={styles.legendLabel}>{rtl ? '›' : '‹'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.later}
                disabled={endMs >= dayEndMs}
                onPress={() => setWindowAnchor(endMs + windowMs / 2)}
                style={[
                  styles.rangeButton,
                  endMs >= dayEndMs && styles.disabled,
                ]}
                testID="day-graph-window-later">
                <Text style={styles.legendLabel}>{rtl ? '‹' : '›'}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>

      <View style={[styles.legend, rtl && styles.rowReverse]}>
        {availability.map(item => (
          <View key={item.key} style={styles.legendPill}>
            <Text
              style={[styles.legendSymbol, {color: legendColors[item.key]}]}>
              {item.key === 'boluses' ? '▮' : item.key === 'basal' ? '┏━' : '━'}
            </Text>
            <Text style={styles.legendLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      <TouchProvider>
        <StackedHomeCharts
          basalProfileData={chart.basalProfileData}
          bgSamples={chart.bgSamples}
          cgmHeight={
            fullscreen
              ? Math.max(180, Math.min(380, viewport.height * 0.4))
              : wide
              ? 290
              : 240
          }
          chartMode={mode}
          fallbackAnchorTimeMs={Math.max(
            startMs,
            Math.min(
              focusedMs ?? chart.fallbackAnchorTimeMs ?? startMs,
              endMs - 1,
            ),
          )}
          foodItems={chart.foodItems}
          insulinData={chart.insulinData}
          locale={locale}
          miniChartHeight={
            fullscreen
              ? Math.max(70, Math.min(112, viewport.height * 0.15))
              : wide
              ? 112
              : 92
          }
          showFullScreenButton={!fullscreen}
          onPressFullScreen={() => setFullscreen(true)}
          testID="day-graph-rich-chart"
          tooltipAlign="auto"
          tooltipFullWidth
          tooltipPlacement="panel"
          width={chartWidth}
          xDomain={xDomain}
        />
      </TouchProvider>

      {preferenceControls}
      <Text style={[styles.factual, rtl && styles.rtlText]}>
        {copy.factual}
      </Text>
    </View>
  );

  if (!fullscreen) {
    return content;
  }
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={() => setFullscreen(false)}
      testID="day-graph-fullscreen">
      <SafeAreaProvider>
        <SafeAreaView style={styles.fullscreen}>
          <View style={[styles.fullscreenHeader, rtl && styles.rowReverse]}>
            <View style={styles.fullscreenHeading}>
              <Text
                accessibilityRole="header"
                style={[styles.fullscreenTitle, rtl && styles.rtlText]}>
                {copy.fullScreenTitle}
              </Text>
              <Text style={[styles.factual, rtl && styles.rtlText]}>
                {new Date(dayStartMs).toLocaleDateString(
                  locale === 'he' ? 'he-IL' : 'en-US',
                  {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  },
                )}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setFullscreen(false)}
              style={styles.closeButton}
              testID="day-graph-fullscreen-close">
              <Text style={styles.closeLabel}>{copy.close} ×</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.fullscreen}
            contentContainerStyle={styles.fullscreenContent}>
            {content}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
};

const createStyles = (theme: ThemeType) =>
  StyleSheet.create({
    compactControls: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.secondaryColor,
    },
    compactToolbar: {borderBottomWidth: 0, padding: theme.spacing.sm},
    fullscreen: {flex: 1, backgroundColor: theme.backgroundColor},
    fullscreenContent: {padding: theme.spacing.sm},
    fullscreenHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: theme.spacing.sm,
    },
    fullscreenHeading: {flexShrink: 1},
    fullscreenTitle: {
      color: theme.textColor,
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.lg,
      fontWeight: '800',
      paddingHorizontal: theme.spacing.md,
    },
    closeButton: {
      borderRadius: theme.borderRadius * 3,
      backgroundColor: theme.buttonBackgroundColor,
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.md,
    },
    closeLabel: {
      color: theme.buttonTextColor,
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.sm,
      fontWeight: '700',
    },
    preferences: {
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.xs,
    },
    saveButton: {minHeight: 44, justifyContent: 'center'},
    remembered: {opacity: 0.7},
    saveLabel: {
      color: theme.buttonBackgroundColor,
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.xs,
      fontWeight: '700',
    },
    saveError: {
      color: theme.severeBelowRange,
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.xs,
      lineHeight: 18,
    },
    rowReverse: {flexDirection: 'row-reverse'},
    rangeButton: {
      borderRadius: theme.borderRadius * 3,
      backgroundColor: theme.backgroundColor,
      minHeight: 44,
      minWidth: 44,
      justifyContent: 'center',
      alignItems: 'center',
      marginEnd: theme.spacing.sm,
      marginBottom: theme.spacing.xs,
      paddingHorizontal: theme.spacing.md,
    },
    rangeSelected: {backgroundColor: theme.buttonBackgroundColor},
    rangeLabelSelected: {color: theme.buttonTextColor},
    disabled: {opacity: 0.4},
    rtlText: {textAlign: 'right', writingDirection: 'rtl'},
    shell: {
      backgroundColor: theme.white,
      borderColor: theme.borderColor,
      borderRadius: theme.borderRadius * 2,
      borderWidth: 1,
      overflow: 'hidden',
      paddingBottom: theme.spacing.md,
      width: '100%',
    },
    toolbar: {
      alignItems: 'center',
      backgroundColor: theme.secondaryColor,
      borderBottomColor: theme.borderColor,
      borderBottomWidth: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      padding: theme.spacing.md,
    },
    modeGroup: {
      backgroundColor: theme.secondaryColor,
      borderRadius: theme.borderRadius * 3,
      flexDirection: 'row',
      padding: theme.spacing.xs,
    },
    modeButton: {
      borderRadius: theme.borderRadius * 3,
      minHeight: 44,
      paddingHorizontal: theme.spacing.md,
      justifyContent: 'center',
    },
    modeButtonSelected: {backgroundColor: theme.buttonBackgroundColor},
    modeLabel: {
      fontFamily: theme.fontFamily,
      color: addOpacity(theme.textColor, 0.75),
      fontWeight: '800',
    },
    modeLabelSelected: {color: theme.buttonTextColor},
    hint: {
      color: addOpacity(theme.textColor, 0.75),
      flexShrink: 1,
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.xs,
      lineHeight: 17,
      marginHorizontal: theme.spacing.sm,
      marginVertical: theme.spacing.xs,
    },
    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    legendPill: {
      backgroundColor: theme.secondaryColor,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: theme.borderRadius * 3,
      marginEnd: theme.spacing.xs,
      marginTop: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    legendSymbol: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.md,
      fontWeight: '800',
      marginEnd: theme.spacing.xs,
    },
    legendLabel: {
      color: theme.textColor,
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.xs,
      fontWeight: '700',
    },
    factual: {
      color: addOpacity(theme.textColor, 0.75),
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.xs,
      lineHeight: 16,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
  });
