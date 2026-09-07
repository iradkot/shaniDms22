import React, {useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Circle} from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from 'styled-components/native';
import type {DayGraphCalendarDay} from '../../modules/dayGraph';
import type {ThemeType} from '../../types/theme';
import {addOpacity} from '../../style/styling.utils';
import type {DestinationLocale} from '../destinations';

export interface DayGraphCalendarModalProps {
  readonly locale: DestinationLocale;
  readonly selectedDayStartMs: number;
  readonly todayStartMs: number;
  readonly monthStartMs: number;
  readonly days: readonly DayGraphCalendarDay[];
  readonly targetMinMgDl: number;
  readonly targetMaxMgDl: number;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly stale: boolean;
  readonly onChangeMonth: (monthStartMs: number) => void;
  readonly onSelectDay: (dayStartMs: number) => void;
  readonly onClose: () => void;
  readonly onRetry: () => void;
}

const COPY = {
  en: {
    title: 'Find your day',
    subtitle: 'A month of glucose, at a glance.',
    close: 'Close calendar',
    today: 'Today',
    showToday: 'Go to today',
    previous: 'Previous month',
    next: 'Next month',
    jump: 'Choose month and year',
    year: 'Year',
    previousYear: 'Previous year',
    nextYear: 'Next year',
    validYear: 'Enter a year up to',
    weekdays: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    loading: 'Checking this month…',
    failed: 'Some dates could not be checked.',
    retry: 'Retry',
    saved: 'Saved or partial data',
    data: 'Readings available',
    unknown: 'Not checked',
    empty: 'No readings found',
    partial: 'Partial data',
    partialLegend: '• Partial day',
    emptyLegend: '— No readings',
    unknownLegend: '· Not checked',
    caption: '% of recorded readings',
    caveat: 'A high percentage does not mean a complete day.',
    inRange: '% of recorded readings in range',
    coverage: '% estimated coverage',
    future: 'Future date',
  },
  he: {
    title: 'איזה יום נפתח?',
    subtitle: 'חודש של נתוני סוכר, במבט אחד.',
    close: 'סגירת לוח השנה',
    today: 'היום',
    showToday: 'מעבר להיום',
    previous: 'החודש הקודם',
    next: 'החודש הבא',
    jump: 'בחירת חודש ושנה',
    year: 'שנה',
    previousYear: 'השנה הקודמת',
    nextYear: 'השנה הבאה',
    validYear: 'יש להזין שנה עד',
    weekdays: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'],
    loading: 'בודק את החודש…',
    failed: 'לא הצלחנו לבדוק חלק מהתאריכים.',
    retry: 'ניסיון נוסף',
    saved: 'נתונים שמורים או חלקיים',
    data: 'יש קריאות',
    unknown: 'טרם נבדק',
    empty: 'לא נמצאו קריאות',
    partial: 'נתונים חלקיים',
    partialLegend: '• יום חלקי',
    emptyLegend: '— ללא קריאות',
    unknownLegend: '· טרם נבדק',
    caption: '% מהקריאות שנרשמו',
    caveat: 'אחוז גבוה אינו מעיד על יום מלא של נתונים.',
    inRange: '% מהקריאות שנרשמו בטווח',
    coverage: '% כיסוי משוער',
    future: 'תאריך עתידי',
  },
} as const;

/** Calendar arithmetic stays in local time, including daylight-saving changes. */
const calendarDate = (year: number, month: number, day = 1): Date => {
  const result = new Date(0);
  result.setFullYear(year, month, day);
  result.setHours(0, 0, 0, 0);
  return result;
};
const dateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(date.getDate()).padStart(2, '0')}`;
const displayPercent = (value: number): number =>
  Math.round(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)));
const RING_SIZE = 34;
const RING_RADIUS = 14;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const DayGraphCalendarModal = ({
  locale,
  selectedDayStartMs,
  todayStartMs,
  monthStartMs,
  days,
  targetMinMgDl,
  targetMaxMgDl,
  loading,
  failed,
  stale,
  onChangeMonth,
  onSelectDay,
  onClose,
  onRetry,
}: DayGraphCalendarModalProps) => {
  const theme = useTheme() as ThemeType;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {width, height} = useWindowDimensions();
  const copy = COPY[locale];
  const rtl = locale === 'he';
  // Isolate the numeric range and Latin unit from the surrounding Hebrew text.
  // Otherwise the bidi algorithm presents the endpoints as 180–70.
  const targetRange = `${targetMinMgDl}–${targetMaxMgDl} mg/dL`;
  const rangeLabel = rtl ? `\u2066${targetRange}\u2069` : targetRange;
  const row = rtl ? styles.rowRtl : styles.row;
  const align = rtl ? styles.textRtl : styles.textLtr;
  const month = new Date(monthStartMs);
  const today = new Date(todayStartMs);
  const currentMonthStart = calendarDate(
    today.getFullYear(),
    today.getMonth(),
  ).getTime();
  const nextMonthStart = calendarDate(
    month.getFullYear(),
    month.getMonth() + 1,
  ).getTime();
  const nextMonthDisabled = nextMonthStart > currentMonthStart;
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpYear, setJumpYear] = useState(String(month.getFullYear()));
  const year = /^\d{1,4}$/.test(jumpYear) ? Number(jumpYear) : Number.NaN;
  const validYear =
    Number.isInteger(year) && year >= 1 && year <= today.getFullYear();
  const dateFormats = useMemo(() => {
    const language = locale === 'he' ? 'he-IL' : 'en-US';
    return {
      month: new Intl.DateTimeFormat(language, {
        month: 'long',
        year: 'numeric',
      }),
      monthOnly: new Intl.DateTimeFormat(language, {month: 'short'}),
      day: new Intl.DateTimeFormat(language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    };
  }, [locale]);
  const dayByStart = useMemo(
    () => new Map(days.map(day => [day.dayStartMs, day])),
    [days],
  );
  const cells = useMemo(() => {
    const first = new Date(monthStartMs);
    const yearNumber = first.getFullYear();
    const monthNumber = first.getMonth();
    const count = calendarDate(yearNumber, monthNumber + 1, 0).getDate();
    const leading = first.getDay();
    const total = Math.ceil((leading + count) / 7) * 7;
    return Array.from({length: total}, (_, index) =>
      index < leading || index >= leading + count
        ? null
        : calendarDate(yearNumber, monthNumber, index - leading + 1),
    );
  }, [monthStartMs]);
  const selectDay = (start: number) => {
    if (start <= todayStartMs) {
      onSelectDay(start);
    }
  };
  const changeMonth = (start: number) => {
    if (start <= currentMonthStart) {
      onChangeMonth(start);
    }
  };
  const ringColor = theme.inRangeColor;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      supportedOrientations={['portrait', 'landscape']}
      statusBarTranslucent
      onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.overlay}>
          <Pressable
            testID="day-graph-calendar-backdrop"
            accessibilityRole="button"
            accessibilityLabel={copy.close}
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
          <View
            testID="day-graph-calendar"
            accessibilityViewIsModal
            style={[
              styles.panel,
              {width: Math.min(520, width - 24), maxHeight: height - 48},
            ]}>
            <View style={[styles.header, row]}>
              <View style={styles.headerCopy}>
                <Text accessibilityRole="header" style={[styles.title, align]}>
                  {copy.title}
                </Text>
                <Text style={[styles.subtitle, align]}>{copy.subtitle}</Text>
              </View>
              <Pressable
                testID="day-graph-calendar-close"
                accessibilityRole="button"
                accessibilityLabel={copy.close}
                style={styles.iconButton}
                onPress={onClose}>
                <Icon name="close" size={21} color={theme.textColor} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled">
              <View style={[styles.navigation, row]}>
                <Pressable
                  testID="day-graph-calendar-previous-month"
                  accessibilityRole="button"
                  accessibilityLabel={copy.previous}
                  style={styles.iconButton}
                  onPress={() =>
                    changeMonth(
                      calendarDate(
                        month.getFullYear(),
                        month.getMonth() - 1,
                      ).getTime(),
                    )
                  }>
                  <Icon
                    name={rtl ? 'chevron-right' : 'chevron-left'}
                    size={24}
                    color={theme.textColor}
                  />
                </Pressable>
                <Pressable
                  testID="day-graph-calendar-jump"
                  accessibilityRole="button"
                  accessibilityLabel={copy.jump}
                  accessibilityState={{expanded: jumpOpen}}
                  style={[styles.monthTitleButton, row]}
                  onPress={() => {
                    setJumpYear(String(month.getFullYear()));
                    setJumpOpen(value => !value);
                  }}>
                  <Text style={styles.monthTitle}>
                    {dateFormats.month.format(month)}
                  </Text>
                  <Icon
                    name={jumpOpen ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={theme.primaryColor}
                  />
                </Pressable>
                <Pressable
                  testID="day-graph-calendar-next-month"
                  accessibilityRole="button"
                  accessibilityLabel={copy.next}
                  accessibilityState={{disabled: nextMonthDisabled}}
                  disabled={nextMonthDisabled}
                  style={[
                    styles.iconButton,
                    nextMonthDisabled && styles.disabled,
                  ]}
                  onPress={() => changeMonth(nextMonthStart)}>
                  <Icon
                    name={rtl ? 'chevron-left' : 'chevron-right'}
                    size={24}
                    color={theme.textColor}
                  />
                </Pressable>
              </View>
              {jumpOpen ? (
                <View style={styles.jumpPanel}>
                  <View style={[styles.yearRow, row]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={copy.previousYear}
                      style={styles.iconButton}
                      disabled={!validYear || year <= 1}
                      onPress={() => {
                        if (validYear && year > 1) {
                          setJumpYear(String(year - 1));
                        }
                      }}>
                      <Icon name="minus" size={20} color={theme.textColor} />
                    </Pressable>
                    <TextInput
                      testID="day-graph-calendar-year"
                      accessibilityLabel={copy.year}
                      keyboardType="number-pad"
                      selectTextOnFocus
                      maxLength={4}
                      value={jumpYear}
                      onChangeText={setJumpYear}
                      style={styles.yearInput}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={copy.nextYear}
                      style={styles.iconButton}
                      disabled={!validYear || year >= today.getFullYear()}
                      onPress={() => {
                        if (validYear && year < today.getFullYear()) {
                          setJumpYear(String(year + 1));
                        }
                      }}>
                      <Icon name="plus" size={20} color={theme.textColor} />
                    </Pressable>
                  </View>
                  {!validYear && (
                    <Text style={[styles.statusText, align]}>
                      {`${copy.validYear} ${today.getFullYear()}`}
                    </Text>
                  )}
                  <View style={[styles.monthChoices, row]}>
                    {Array.from({length: 12}, (_, index) => {
                      const start = validYear
                        ? calendarDate(year, index).getTime()
                        : Number.NaN;
                      const disabled = !validYear || start > currentMonthStart;
                      return (
                        <Pressable
                          key={index}
                          testID={`day-graph-calendar-jump-month-${index + 1}`}
                          accessibilityRole="button"
                          accessibilityState={{disabled}}
                          disabled={disabled}
                          style={[
                            styles.monthChoice,
                            start === monthStartMs && styles.selected,
                            disabled && styles.disabled,
                          ]}
                          onPress={() => {
                            if (!disabled) {
                              changeMonth(start);
                              setJumpOpen(false);
                            }
                          }}>
                          <Text style={styles.monthChoiceText}>
                            {dateFormats.monthOnly.format(
                              calendarDate(2026, index),
                            )}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : (
                <>
                  <View style={[styles.weekdays, row]}>
                    {copy.weekdays.map(weekday => (
                      <Text key={weekday} style={styles.weekday}>
                        {weekday}
                      </Text>
                    ))}
                  </View>
                  <View style={[styles.grid, row]}>
                    {cells.map((date, index) => {
                      if (!date) {
                        return (
                          <View key={`blank-${index}`} style={styles.cell} />
                        );
                      }
                      const start = date.getTime();
                      const record = dayByStart.get(start);
                      const status = record?.status ?? 'unknown';
                      const future = start > todayStartMs;
                      const selected = start === selectedDayStartMs;
                      const isToday = start === todayStartMs;
                      const tir =
                        status === 'data' && record?.timeInRangePct != null
                          ? displayPercent(record.timeInRangePct)
                          : null;
                      const partial = status === 'data' && record?.partial;
                      const description = future
                        ? copy.future
                        : status === 'empty'
                        ? copy.empty
                        : status === 'unknown'
                        ? copy.unknown
                        : [
                            tir === null ? copy.data : `${tir}${copy.inRange}`,
                            `${displayPercent(record?.coveragePct ?? 0)}${
                              copy.coverage
                            }`,
                            partial ? copy.partial : '',
                          ]
                            .filter(Boolean)
                            .join(', ');
                      return (
                        <View key={start} style={styles.cell}>
                          <Pressable
                            testID={`day-graph-calendar-day-${dateKey(date)}`}
                            accessibilityRole="button"
                            accessibilityLabel={`${dateFormats.day.format(
                              date,
                            )}, ${description}${
                              isToday ? `, ${copy.today}` : ''
                            }`}
                            accessibilityState={{selected, disabled: future}}
                            disabled={future}
                            style={[
                              styles.day,
                              selected && styles.selected,
                              future && styles.disabled,
                            ]}
                            onPress={() => selectDay(start)}>
                            <View style={styles.ring} accessibilityElementsHidden>
                              {!future && (
                                <Svg
                                  width={RING_SIZE}
                                  height={RING_SIZE}
                                  style={StyleSheet.absoluteFill}>
                                  <Circle
                                    cx={17}
                                    cy={17}
                                    r={RING_RADIUS}
                                    stroke={theme.colors.barTrack}
                                    strokeWidth={2.5}
                                    {...(status === 'unknown'
                                      ? {strokeDasharray: '2 3'}
                                      : {})}
                                    fill="none"
                                  />
                                  {tir !== null && tir > 0 && (
                                    <Circle
                                      cx={17}
                                      cy={17}
                                      r={RING_RADIUS}
                                      stroke={ringColor}
                                      strokeWidth={2.5}
                                      strokeLinecap="round"
                                      strokeDasharray={`${
                                        (tir / 100) * CIRCUMFERENCE
                                      } ${CIRCUMFERENCE}`}
                                      transform="rotate(-90 17 17)"
                                      fill="none"
                                    />
                                  )}
                                </Svg>
                              )}
                              <Text
                                style={[
                                  styles.dayNumber,
                                  isToday && styles.todayNumber,
                                ]}>
                                {date.getDate()}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.metric,
                                tir !== null && styles.metricData,
                              ]}>
                              {future
                                ? ' '
                                : tir !== null
                                ? `${tir}%${partial ? ' •' : ''}`
                                : status === 'empty'
                                ? '—'
                                : '·'}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                  <View style={styles.legend}>
                    <View style={[styles.legendItems, row]}>
                      <Text style={styles.legendText}>
                        {copy.partialLegend}
                      </Text>
                      <Text style={styles.legendText}>{copy.emptyLegend}</Text>
                      <Text style={styles.legendText}>
                        {copy.unknownLegend}
                      </Text>
                    </View>
                    <Text style={[styles.caption, align]}>
                      {`${copy.caption} · ${rangeLabel}`}
                    </Text>
                    <Text style={[styles.caveat, align]}>{copy.caveat}</Text>
                  </View>
                </>
              )}
              {(loading || failed || stale) && (
                <View style={styles.status} accessibilityLiveRegion="polite">
                  {loading && (
                    <View style={[styles.statusRow, row]}>
                      <ActivityIndicator
                        size="small"
                        color={theme.primaryColor}
                      />
                      <Text style={[styles.statusText, align]}>
                        {copy.loading}
                      </Text>
                    </View>
                  )}
                  {stale && (
                    <Text style={[styles.statusText, align]}>{copy.saved}</Text>
                  )}
                  {failed && (
                    <View style={[styles.statusRow, row]}>
                      <Text style={[styles.statusText, styles.flex, align]}>
                        {copy.failed}
                      </Text>
                      <Pressable
                        testID="day-graph-calendar-retry"
                        accessibilityRole="button"
                        accessibilityLabel={copy.retry}
                        style={styles.retryButton}
                        onPress={onRetry}>
                        <Text style={styles.retryText}>{copy.retry}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
            <View style={styles.footer}>
              <Pressable
                testID="day-graph-calendar-today"
                accessibilityRole="button"
                accessibilityLabel={copy.showToday}
                style={[styles.todayButton, row]}
                onPress={() => selectDay(todayStartMs)}>
                <Icon
                  name="calendar-today"
                  size={18}
                  color={theme.primaryColor}
                />
                <Text style={styles.todayButtonText}>{copy.showToday}</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
};

const createStyles = (theme: ThemeType) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(4, 12, 25, 0.56)',
    },
    panel: {
      backgroundColor: theme.backgroundColor,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.borderColor,
      overflow: 'hidden',
    },
    row: {flexDirection: 'row'},
    rowRtl: {flexDirection: 'row-reverse'},
    textRtl: {textAlign: 'right', writingDirection: 'rtl'},
    textLtr: {textAlign: 'left', writingDirection: 'ltr'},
    flex: {flex: 1},
    header: {padding: 16, paddingBottom: 8, alignItems: 'center', gap: 8},
    headerCopy: {flex: 1},
    title: {fontSize: 22, fontWeight: '700', color: theme.textColor},
    subtitle: {
      fontSize: 13,
      lineHeight: 19,
      color: addOpacity(theme.textColor, 0.65),
      marginTop: 4,
    },
    scroll: {flexGrow: 0, flexShrink: 1},
    content: {paddingHorizontal: 12, paddingBottom: 12},
    iconButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20,
    },
    navigation: {alignItems: 'center', marginVertical: 8},
    monthTitleButton: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    monthTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.textColor,
      flexShrink: 1,
    },
    disabled: {opacity: 0.3},
    weekdays: {paddingBottom: 6},
    weekday: {
      width: '14.285714%',
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '600',
      color: addOpacity(theme.textColor, 0.58),
    },
    grid: {flexWrap: 'wrap'},
    cell: {width: '14.285714%', height: 65, padding: 1},
    day: {
      flex: 1,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    selected: {
      backgroundColor: addOpacity(theme.primaryColor, 0.12),
      borderColor: addOpacity(theme.primaryColor, 0.6),
    },
    ring: {
      width: RING_SIZE,
      height: RING_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayNumber: {fontSize: 13, fontWeight: '600', color: theme.textColor},
    todayNumber: {color: theme.primaryColor, fontWeight: '800'},
    metric: {
      fontSize: 10,
      lineHeight: 16,
      color: addOpacity(theme.textColor, 0.5),
      writingDirection: 'ltr',
    },
    metricData: {color: theme.textColor, fontWeight: '600'},
    legend: {
      marginTop: 10,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.borderColor,
      gap: 6,
    },
    legendItems: {flexWrap: 'wrap', justifyContent: 'space-between', gap: 6},
    legendText: {fontSize: 11, color: addOpacity(theme.textColor, 0.7)},
    caption: {fontSize: 12, fontWeight: '600', color: theme.textColor},
    caveat: {
      fontSize: 11,
      lineHeight: 16,
      color: addOpacity(theme.textColor, 0.62),
    },
    status: {
      marginTop: 12,
      gap: 6,
      padding: 10,
      borderRadius: 12,
      backgroundColor: addOpacity(theme.primaryColor, 0.07),
    },
    statusRow: {alignItems: 'center', gap: 8},
    statusText: {fontSize: 12, lineHeight: 18, color: theme.textColor},
    retryButton: {padding: 8, minHeight: 40, justifyContent: 'center'},
    retryText: {fontSize: 12, fontWeight: '700', color: theme.primaryColor},
    footer: {
      padding: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.borderColor,
    },
    todayButton: {
      minHeight: 44,
      borderRadius: 14,
      backgroundColor: addOpacity(theme.primaryColor, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    todayButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.primaryColor,
    },
    jumpPanel: {
      padding: 8,
      borderRadius: 16,
      backgroundColor: addOpacity(theme.primaryColor, 0.04),
    },
    yearRow: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      marginBottom: 12,
    },
    yearInput: {
      width: 100,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.borderColor,
      textAlign: 'center',
      fontSize: 20,
      fontWeight: '700',
      color: theme.textColor,
      backgroundColor: theme.backgroundColor,
    },
    monthChoices: {flexWrap: 'wrap', justifyContent: 'space-between', gap: 8},
    monthChoice: {
      width: '30%',
      minHeight: 48,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.borderColor,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 4,
    },
    monthChoiceText: {fontSize: 13, fontWeight: '600', color: theme.textColor},
  });
