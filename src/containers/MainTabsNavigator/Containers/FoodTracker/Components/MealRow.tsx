import React from 'react';
import {format} from 'date-fns';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from 'styled-components/native';

import {MealEntry} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/types';
import {MEAL_SLOT_ICON} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/constants';
import {
  RowContainer,
  RowCell,
  CellText,
  CellTextBold,
  CellTextMuted,
} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/styles';
import {ThemeType} from 'app/types/theme';

interface MealRowProps {
  meal: MealEntry;
  isExpanded: boolean;
  onPress: () => void;
}

/** Color the score: green ≥70%, yellow 50-69%, red <50%. */
function scoreColor(score: number, theme: ThemeType): string {
  if (score >= 70) return theme.inRangeColor;
  if (score >= 50) return theme.aboveRangeColor;
  return theme.belowRangeColor;
}

/**
 * Color the absorbed grams relative to entered:
 *   absorbed ≈ entered (±10%) → green (good estimate)
 *   absorbed < entered by >10% → yellow (over-estimated carbs)
 *   absorbed > entered → red (under-estimated carbs)
 */
function absGramsColor(
  absorbed: number,
  entered: number,
  theme: ThemeType,
): string {
  const ratio = entered > 0 ? absorbed / entered : 1;
  if (ratio > 1.0) return theme.belowRangeColor;   // under-estimated
  if (ratio >= 0.9) return theme.inRangeColor;       // spot on
  return theme.aboveRangeColor;                      // over-estimated
}

const MealRow: React.FC<MealRowProps> = ({meal, isExpanded, onPress}) => {
  const theme = useTheme() as ThemeType;
  const icon = MEAL_SLOT_ICON[meal.mealSlot];

  const timeLabel = format(new Date(meal.timestamp), 'EEE HH:mm');
  const dateLabel = format(new Date(meal.timestamp), 'dd/MM');

  return (
    <RowContainer
      onPress={onPress}
      activeOpacity={0.7}
      style={isExpanded ? {backgroundColor: theme.secondaryColor} : undefined}>
      {/* Icon */}
      <RowCell flex={0.4}>
        {icon.set === 'ionicons' ? (
          <Ionicons name={icon.name} size={20} color={theme.colors.carbs} />
        ) : (
          <MaterialCommunityIcons
            name={icon.name}
            size={20}
            color={theme.colors.carbs}
          />
        )}
      </RowCell>

      {/* Time */}
      <RowCell flex={1.1}>
        <CellText style={{flexShrink: 1}}>
          {timeLabel}
          {'\n'}
          <CellTextMuted>{dateLabel}</CellTextMuted>
        </CellText>
      </RowCell>

      {/* Carbs: entered on top, absorbed below, bolus */}
      <RowCell flex={1.4} style={{flexDirection: 'column', alignItems: 'flex-start'}}>
        {/* Entered line — always shown */}
        <CellTextMuted style={{fontSize: 11}}>
          Entered: {meal.carbsEntered}g
        </CellTextMuted>
        {/* Absorbed line — shown when available, color-coded */}
        {meal.absorbed != null ? (
          <CellTextBold
            style={{
              color: absGramsColor(meal.absorbed, meal.carbsEntered, theme),
              fontSize: 13,
              marginTop: 1,
            }}>
            Absorbed: {meal.absorbed}g
          </CellTextBold>
        ) : (
          <CellTextMuted style={{fontSize: 11, marginTop: 1}}>
            Absorbed: —
          </CellTextMuted>
        )}
        {/* Bolus insulin */}
        {meal.bolusInsulinU != null ? (
          <CellTextMuted style={{fontSize: 11, marginTop: 1, color: theme.colors.insulin}}>
            Bolus: {meal.bolusInsulinU}U
          </CellTextMuted>
        ) : null}
      </RowCell>

      {/* Score (TIR %) */}
      <RowCell flex={0.8}>
        {meal.score != null ? (
          <CellTextBold style={{color: scoreColor(meal.score, theme)}}>
            {meal.score}%
          </CellTextBold>
        ) : (
          <CellTextMuted>—</CellTextMuted>
        )}
      </RowCell>
    </RowContainer>
  );
};

export default React.memo(MealRow);
