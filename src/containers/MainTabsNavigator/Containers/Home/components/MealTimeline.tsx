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
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {useGlucoseSettings} from 'app/contexts/GlucoseSettingsContext';
import {t as tr} from 'app/i18n/translations';

// ── Props ───────────────────────────────────────────────────────────────

type Props = {
  meals: MealSegment[];
  isLoading: boolean;
  isToday: boolean;
  /** Called when the user taps the tag button on a meal card. */
  onTagPress?: (segment: MealSegment) => void;
};

type CoreMealBucket = 'breakfast' | 'lunch' | 'dinner';

function classifyCoreMealBucket(params: {
  startMs: number;
  breakfastStartHour: number;
  lunchStartHour: number;
  dinnerStartHour: number;
}): CoreMealBucket | 'other' {
  const {startMs, breakfastStartHour, lunchStartHour, dinnerStartHour} = params;
  const h = new Date(startMs).getHours();
  if (h >= breakfastStartHour && h < lunchStartHour) return 'breakfast';
  if (h >= lunchStartHour && h < dinnerStartHour) return 'lunch';
  if (h >= dinnerStartHour) return 'dinner';
  return 'other';
}

function coreMealLabel(language: string, bucket: CoreMealBucket): string {
  if (language === 'he') {
    if (bucket === 'breakfast') return 'בוקר';
    if (bucket === 'lunch') return 'צהריים';
    return 'ערב';
  }
  if (bucket === 'breakfast') return 'Breakfast';
  if (bucket === 'lunch') return 'Lunch';
  return 'Dinner';
}

// ── Component ───────────────────────────────────────────────────────────

const MealTimeline: React.FC<Props> = ({meals, isLoading, isToday, onTagPress}) => {
  const {language} = useAppLanguage();
  const {settings: glucoseSettings} = useGlucoseSettings();

  const coreMeals = React.useMemo(() => {
    const sorted = [...meals].sort((a, b) => a.startMs - b.startMs);

    const byBucket: Record<CoreMealBucket, MealSegment | null> = {
      breakfast: null,
      lunch: null,
      dinner: null,
    };

    for (const meal of sorted) {
      const bucket = classifyCoreMealBucket({
        startMs: meal.startMs,
        breakfastStartHour: glucoseSettings.breakfastStartHour,
        lunchStartHour: glucoseSettings.lunchStartHour,
        dinnerStartHour: glucoseSettings.dinnerStartHour,
      });
      if (bucket === 'other') continue;
      // Keep the latest event inside each core meal bucket.
      byBucket[bucket] = meal;
    }

    return byBucket;
  }, [glucoseSettings.breakfastStartHour, glucoseSettings.dinnerStartHour, glucoseSettings.lunchStartHour, meals]);

  const orderedBuckets: CoreMealBucket[] = ['breakfast', 'lunch', 'dinner'];
  const availableCount = orderedBuckets.filter(b => !!coreMeals[b]).length;

  if (availableCount === 0 && !isLoading) {
    return (
      <EmptyContainer>
        <EmptyTitle>{tr(language, 'home.noMealsTitle')}</EmptyTitle>
        <EmptySub>{tr(language, 'home.noMealsSub')}</EmptySub>
      </EmptyContainer>
    );
  }

  return (
    <>
      <SectionHeader>
        <SectionTitle>{isToday ? tr(language, 'home.mealsToday') : tr(language, 'home.meals')}</SectionTitle>
        <MealCount>{`${availableCount}/3`}</MealCount>
      </SectionHeader>

      {orderedBuckets.map(bucket => {
        const meal = coreMeals[bucket];
        if (!meal) {
          return (
            <MissingMealCard key={bucket}>
              <MissingMealTitle>{coreMealLabel(language, bucket)}</MissingMealTitle>
              <MissingMealSub>
                {language === 'he' ? 'אין ארוחה מזוהה בטווח הזה היום' : 'No detected meal in this time range today'}
              </MissingMealSub>
            </MissingMealCard>
          );
        }

        return (
          <MealTimelineCard
            key={meal.id}
            segment={meal}
            isLatest={false}
            onTagPress={onTagPress}
          />
        );
      })}
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

const MissingMealCard = styled.View<{theme: ThemeType}>`
  margin-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  margin-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  border-radius: 12px;
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.15)};
  background-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.white, 0.9)};
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
`;

const MissingMealTitle = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  font-weight: 800;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
`;

const MissingMealSub = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.55)};
`;

export default React.memo(MealTimeline);
