import React, {useMemo, useState} from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from 'styled-components/native';
import {
  getChartPalette,
  glucoseChartColor,
} from 'app/components/charts/chartPalette';
import {addOpacity} from 'app/style/styling.utils';
import type {ThemeType} from 'app/types/theme';

type InspectorCell = {
  key: string;
  label: string;
  color: string;
  symbol: string;
  value: string;
};
type Selection = {
  timeText: string;
  anchorTimeMs: number;
  bgText: string;
  bgValue: number | null;
  bgTrendIcon: string | null;
  cells: InspectorCell[];
  context: string[];
};
type Props = Selection & {locale: 'en' | 'he'; collapsible: boolean};

/** Live values stay with their lanes. Opening details freezes one selection and
 * uses a separate surface, so neither touch expiry nor layout can move it. */
export function CompactChartInspector(props: Props) {
  const theme = useTheme();
  const palette = getChartPalette(theme);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const he = props.locale === 'he';
  const [details, setDetails] = useState<Selection | null>(null);
  const close = () => setDetails(null);
  const header = (selection: Selection) => {
    const bgColor =
      selection.bgValue === null
        ? palette.text
        : glucoseChartColor(selection.bgValue, theme);
    return (
      <>
        <Text style={[styles.time, {color: palette.text}]}>
          {selection.timeText}
        </Text>
        <View>
          <Text
            style={[
              styles.label,
              {color: palette.mutedText},
              he && styles.rtl,
            ]}>
            {he ? 'סוכר' : 'Glucose'}
          </Text>
          <View style={styles.glucose}>
            <Text style={[styles.glucoseValue, {color: bgColor}]}>
              {selection.bgText}
            </Text>
            {selection.bgTrendIcon ? (
              <Icon name={selection.bgTrendIcon} size={18} color={bgColor} />
            ) : null}
          </View>
        </View>
      </>
    );
  };
  const values = (selection: Selection, fullDetails = false) => (
    <>
      <View style={[styles.grid, he && styles.reverse]}>
        {selection.cells.map(cell => (
          <View key={cell.key} style={styles.cell}>
            <Text
              style={[
                styles.label,
                {color: palette.mutedText},
                he && styles.rtl,
              ]}>
              <Text
                style={{
                  color:
                    props.cells.find(current => current.key === cell.key)
                      ?.color ?? cell.color,
                }}>
                {cell.symbol}{' '}
              </Text>
              {cell.label}
            </Text>
            <Text
              style={[
                styles.value,
                {color: palette.text},
                he ? styles.alignRight : styles.alignLeft,
                /\d/.test(cell.value) || !he ? styles.ltrFlow : styles.rtlFlow,
              ]}
              testID={`chart-inspector-value-${cell.key}`}>
              {cell.value}
            </Text>
          </View>
        ))}
      </View>
      {(fullDetails
        ? selection.context
        : [0, 1, 2].map(index => selection.context[index] ?? '\u00a0')
      ).map((line, index) => (
        <Text
          key={index}
          {...(!fullDetails ? {numberOfLines: 1} : {})}
          style={[
            styles.context,
            {color: palette.mutedText},
            he && styles.rtl,
          ]}>
          {line}
        </Text>
      ))}
    </>
  );
  return (
    <>
      <View
        pointerEvents="auto"
        style={[
          styles.panel,
          !props.collapsible && styles.expandedPanel,
          {backgroundColor: palette.surface, borderColor: palette.grid},
        ]}>
        <View style={[styles.header, he && styles.reverse]}>
          {header(props)}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{expanded: details !== null}}
            aria-expanded={details !== null}
            accessibilityLabel={
              he ? 'פרטי הנקודה שנבחרה' : 'Selected point details'
            }
            onPress={() => setDetails(current => (current ? null : props))}
            style={styles.detailsButton}
            testID="chart-inspector-toggle-details">
            <Text style={[styles.label, {color: palette.text}]}>
              {he ? 'פרטים' : 'Details'} ⤢
            </Text>
          </Pressable>
        </View>
        {!props.collapsible ? values(props) : null}
      </View>
      {details ? (
        <Modal transparent visible animationType="fade" onRequestClose={close}>
          <SafeAreaProvider>
            <View
              style={[
                styles.backdrop,
                {backgroundColor: addOpacity(theme.textColor, 0.35)},
              ]}>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={close}
                accessible={false}
                importantForAccessibility="no"
              />
              <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
                <View
                  accessibilityViewIsModal
                  testID="chart-inspector-details"
                  style={[
                    styles.sheet,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.grid,
                    },
                  ]}>
                  <View style={[styles.sheetHeading, he && styles.reverse]}>
                    <View style={styles.headingText}>
                      <Text
                        accessibilityRole="header"
                        style={[
                          styles.value,
                          {color: palette.text},
                          he && styles.rtl,
                        ]}>
                        {he ? 'פרטי הנקודה שנבחרה' : 'Selected point details'}
                      </Text>
                      <Text
                        style={[
                          styles.label,
                          {color: palette.mutedText},
                          he && styles.rtl,
                        ]}>
                        {new Date(details.anchorTimeMs).toLocaleDateString(
                          he ? 'he-IL' : 'en-US',
                        )}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={close}
                      accessibilityLabel={
                        he ? 'סגירת פרטי הנקודה' : 'Close point details'
                      }
                      testID="chart-inspector-close-details"
                      style={styles.detailsButton}>
                      <Icon name="close" size={24} color={palette.text} />
                    </Pressable>
                  </View>
                  <ScrollView contentContainerStyle={styles.sheetContent}>
                    <View style={[styles.header, he && styles.reverse]}>
                      {header(details)}
                    </View>
                    {values(details, true)}
                  </ScrollView>
                </View>
              </SafeAreaView>
            </View>
          </SafeAreaProvider>
        </Modal>
      ) : null}
    </>
  );
}

const createStyles = (theme: ThemeType) =>
  StyleSheet.create({
    panel: {
      margin: theme.spacing.xs,
      marginBottom: 0,
      paddingHorizontal: theme.spacing.sm,
      borderWidth: 1,
      borderRadius: theme.borderRadius,
    },
    expandedPanel: {padding: theme.spacing.md},
    header: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      columnGap: theme.spacing.xs,
    },
    detailsButton: {
      minHeight: 44,
      minWidth: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    time: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.md,
      fontWeight: '700',
      writingDirection: 'ltr',
    },
    glucose: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    glucoseValue: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.lg,
      fontWeight: '800',
      writingDirection: 'ltr',
    },
    grid: {flexDirection: 'row', flexWrap: 'wrap', columnGap: '4%'},
    cell: {width: '48%', paddingVertical: theme.spacing.sm, minHeight: 46},
    label: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.xs,
      lineHeight: 18,
    },
    value: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.sm,
      lineHeight: 20,
      fontWeight: '700',
    },
    context: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.xs,
      lineHeight: 18,
      marginTop: theme.spacing.sm,
    },
    backdrop: {flex: 1},
    safeArea: {
      flex: 1,
      justifyContent: 'flex-end',
      alignItems: 'center',
      padding: theme.spacing.md,
    },
    sheet: {
      width: '100%',
      maxWidth: 520,
      maxHeight: '90%',
      borderWidth: 1,
      borderRadius: theme.borderRadius * 2,
      overflow: 'hidden',
    },
    sheetHeading: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    headingText: {flex: 1},
    sheetContent: {
      paddingHorizontal: theme.spacing.md,
      paddingBottom: theme.spacing.md,
    },
    reverse: {flexDirection: 'row-reverse'},
    rtl: {textAlign: 'right', writingDirection: 'rtl'},
    alignRight: {textAlign: 'right'},
    alignLeft: {textAlign: 'left'},
    ltrFlow: {writingDirection: 'ltr'},
    rtlFlow: {writingDirection: 'rtl'},
  });
