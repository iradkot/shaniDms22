import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTheme} from 'styled-components/native';
import type {DayGraphDataAvailability} from '../../modules/dayGraph';
import type {ThemeType} from '../../types/theme';
import type {DestinationLocale} from '../destinations';

const COPY = {
  en: {
    treatments: 'Boluses, temporary basal and recorded carbs',
    deviceStatus: 'Active insulin and active carbs',
    profile: 'Scheduled basal profile',
    unavailable: 'could not load.',
    stale: 'showing a previous copy.',
    retry: 'Refresh the day to try again. Missing data is not zero.',
  },
  he: {
    treatments: 'בולוסים, בזאל זמני ופחמימות שנרשמו',
    deviceStatus: 'אינסולין פעיל ופחמימות פעילות',
    profile: 'פרופיל בזאל מתוכנן',
    unavailable: 'הטעינה נכשלה.',
    stale: 'מוצג עותק קודם.',
    retry: 'אפשר לרענן את היום כדי לנסות שוב. נתון חסר אינו אפס.',
  },
} as const;

export function DayGraphSourceStatus({
  availability,
  locale,
}: {
  availability: DayGraphDataAvailability;
  locale: DestinationLocale;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const missing = (['treatments', 'deviceStatus', 'profile'] as const).flatMap(
    key => {
      const status = availability[key];
      return status === 'available' ? [] : [{key, status}];
    },
  );
  if (missing.length === 0) {
    return null;
  }
  const copy = COPY[locale];
  return (
    <View
      style={styles.card}
      testID="day-graph-source-status"
      accessibilityLiveRegion="polite">
      {missing.map(({key, status}) => (
        <Text
          key={key}
          style={[
            styles.message,
            locale === 'he' && styles.rtl,
          ]}>{`${copy[key]}: ${copy[status]}`}</Text>
      ))}
      <Text style={[styles.hint, locale === 'he' && styles.rtl]}>
        {copy.retry}
      </Text>
    </View>
  );
}

const createStyles = (theme: ThemeType) =>
  StyleSheet.create({
    card: {
      margin: theme.spacing.sm,
      padding: theme.spacing.md,
      borderRadius: theme.borderRadius,
      borderWidth: 1,
      borderColor: theme.borderColor,
      backgroundColor: theme.secondaryColor,
    },
    message: {
      color: theme.textColor,
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.sm,
      fontWeight: '600',
      lineHeight: Math.ceil(
        theme.typography.size.sm * theme.typography.lineHeight.normal,
      ),
      marginBottom: theme.spacing.xs,
    },
    hint: {
      color: theme.textColor,
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.xs,
      lineHeight: Math.ceil(
        theme.typography.size.xs * theme.typography.lineHeight.normal,
      ),
    },
    rtl: {textAlign: 'right', writingDirection: 'rtl'},
  });
