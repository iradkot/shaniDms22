/**
 * Meal Timeline — the scrollable section of the redesigned Home screen.
 *
 * Renders auto-detected meal segments in reverse chronological order
 * (latest first). Each meal is shown as a MealTimelineCard.
 * When no meals are detected, shows a friendly empty state.
 *
 * NOTE: This component renders plain Views (not FlatList) because it lives
 * inside the Home screen ScrollView. Meal counts per day are small enough
 * that virtualization is unnecessary.
 */
import React from 'react';
import styled from 'styled-components/native';

import MealTimelineCard from 'app/containers/MainTabsNavigator/Containers/Home/components/MealTimelineCard';
import type {MealSegment} from 'app/containers/MainTabsNavigator/Containers/Home/hooks/useMealSegments';
import type {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

// ── Props ───────────────────────────────────────────────────────────────

type Props = {
  meals: MealSegment[];
  isLoading: boolean;
  isToday: boolean;
  /** Called when the user taps the tag button on a meal card. */
  onTagPress?: (segment: MealSegment) => void;
};

// ── Component ───────────────────────────────────────────────────────────

const MealTimeline: React.FC<Props> = ({meals, isLoading, isToday, onTagPress}) => {
  const reversedMeals = React.useMemo(
    () => [...meals].reverse(), // latest first
    [meals],
  );

  if (reversedMeals.length === 0 && !isLoading) {
    return (
      <EmptyContainer>
        <EmptyTitle>No meals detected yet</EmptyTitle>
        <EmptySub>
          Meals appear automatically when carb or bolus events are recorded in Nightscout.
        </EmptySub>
      </EmptyContainer>
    );
  }

  return (
    <>
      <SectionHeader>
        <SectionTitle>{isToday ? "Today's Meals" : 'Meals'}</SectionTitle>
        <MealCount>{reversedMeals.length}</MealCount>
      </SectionHeader>
      {reversedMeals.map((meal, index) => (
        <MealTimelineCard key={meal.id} segment={meal} isLatest={index === 0} onTagPress={onTagPress} />
      ))}
    </>
  );
};

// ── Styled Components ───────────────────────────────────────────────────

const SectionHeader = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  margin-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
`;

const SectionTitle = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  font-weight: 800;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
`;

const MealCount = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  font-weight: 700;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.45)};
`;

const EmptyContainer = styled.View<{theme: ThemeType}>`
  align-items: center;
  justify-content: center;
  padding-vertical: ${(p: {theme: ThemeType}) => p.theme.spacing.xl}px;
  padding-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.lg}px;
`;

const EmptyTitle = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  font-weight: 700;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.5)};
`;

const EmptySub = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.35)};
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
  text-align: center;
`;

export default React.memo(MealTimeline);
