import React, {useCallback, useMemo, useState} from 'react';
import {ScrollView, View} from 'react-native';
import {format, subDays} from 'date-fns';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {useMealTreatments} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/hooks/useMealTreatments';
import MealFilters from 'app/containers/MainTabsNavigator/Containers/FoodTracker/Components/MealFilters';
import MealTable from 'app/containers/MainTabsNavigator/Containers/FoodTracker/Components/MealTable';
import MealSummaryStrip from 'app/containers/MainTabsNavigator/Containers/FoodTracker/Components/MealSummaryStrip';
import {CarbRangeFilter, MealEntry} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/types';
import {
  Container,
  Header,
  HeaderTitle,
  FiltersRow,
  FilterChip,
  FilterChipText,
} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/styles';
import Loader from 'app/components/common-ui/Loader/Loader';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {useMealTags} from 'app/hooks/useMealTags';
import TagMealSheet from 'app/components/MealTagging/TagMealSheet';

const RANGE_DAYS = 7;

const FoodTracker: React.FC = () => {
  // ── week navigation state ──
  const [rangeEnd, setRangeEnd] = useState(() => new Date());
  const rangeStart = useMemo(
    () => subDays(rangeEnd, RANGE_DAYS - 1),
    [rangeEnd],
  );

  // ── filter state ──
  const [carbFilter, setCarbFilter] = useState<CarbRangeFilter>('all');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  // ── data ──
  const {meals, isLoading, getChartDataForMeal} = useMealTreatments(
    rangeStart,
    rangeEnd,
  );

  // ── tags ──
  const mealIds = useMemo(() => meals.map(m => m.id), [meals]);
  const {tagMap, knownTags, suggestions, tagMeal, refreshTags} = useMealTags(mealIds);

  // Enrich meals with tags from the local tag store
  const mealsWithTags = useMemo(() => {
    return meals.map(m => ({
      ...m,
      tags: [...new Set([...(m.tags || []), ...(tagMap[m.id] || [])])],
    }));
  }, [meals, tagMap]);

  // Filtered meals — apply tag filter on top of carb filter
  const filteredMeals = useMemo(() => {
    if (!activeTagFilter) return mealsWithTags;
    return mealsWithTags.filter(m => m.tags.includes(activeTagFilter));
  }, [mealsWithTags, activeTagFilter]);

  // ── tag sheet state ──
  const [tagSheetMeal, setTagSheetMeal] = useState<MealEntry | null>(null);

  const handleTagPress = useCallback((meal: MealEntry) => {
    setTagSheetMeal(meal);
  }, []);

  const handleTagSave = useCallback(
    async (tags: string[]) => {
      if (tagSheetMeal) {
        await tagMeal(tagSheetMeal.id, tags);
      }
      setTagSheetMeal(null);
    },
    [tagSheetMeal, tagMeal],
  );

  const handleTagSheetClose = useCallback(() => {
    setTagSheetMeal(null);
  }, []);

  const tagSheetCurrentTags = useMemo(() => {
    if (!tagSheetMeal) return [];
    return tagMap[tagSheetMeal.id] ?? tagSheetMeal.tags ?? [];
  }, [tagSheetMeal, tagMap]);

  const tagSheetLabel = useMemo(() => {
    if (!tagSheetMeal) return '';
    return `${format(new Date(tagSheetMeal.timestamp), 'EEE HH:mm')} · ${tagSheetMeal.carbsEntered}g`;
  }, [tagSheetMeal]);

  // Unique tags present in current meals (for filter chips)
  const availableTagsInRange = useMemo(() => {
    const tagSet = new Set<string>();
    for (const m of mealsWithTags) {
      for (const t of m.tags) tagSet.add(t);
    }
    return Array.from(tagSet).sort();
  }, [mealsWithTags]);

  const handleWeekChange = useCallback((direction: -1 | 1) => {
    setRangeEnd(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + direction * RANGE_DAYS);
      // Don't go into the future
      const now = new Date();
      return next > now ? now : next;
    });
  }, []);

  return (
    <Container testID={E2E_TEST_IDS.screens.food}>
      <Header>
        <HeaderTitle>Meals</HeaderTitle>
      </Header>

      <MealSummaryStrip meals={filteredMeals} />

      <MealFilters
        activeFilter={carbFilter}
        onFilterChange={setCarbFilter}
        rangeStart={rangeStart}
        onWeekChange={handleWeekChange}
      />

      {/* Tag filter chips */}
      {availableTagsInRange.length > 0 ? (
        <View style={{flexShrink: 0, paddingBottom: 8}}>
          <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 6}}>
            <Icon name="tag-multiple-outline" size={14} color="#888" />
            <FilterChipText active={false} style={{fontSize: 11, marginLeft: 4, opacity: 0.5}}>
              Filter by tag
            </FilterChipText>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{flexGrow: 0}}
            contentContainerStyle={{paddingHorizontal: 16, alignItems: 'center'}}>
            <FilterChip
              active={activeTagFilter === null}
              onPress={() => setActiveTagFilter(null)}
              style={{marginRight: 8}}>
              <FilterChipText active={activeTagFilter === null}>
                All
              </FilterChipText>
            </FilterChip>
            {availableTagsInRange.map(tag => (
              <FilterChip
                key={tag}
                active={activeTagFilter === tag}
                onPress={() =>
                  setActiveTagFilter(prev => (prev === tag ? null : tag))
                }
                style={{marginRight: 8}}>
                <FilterChipText active={activeTagFilter === tag}>
                  #{tag}
                </FilterChipText>
              </FilterChip>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {isLoading ? (
        <Loader />
      ) : (
        <View style={{flex: 1}}>
          <MealTable
            meals={filteredMeals}
            carbFilter={carbFilter}
            getChartDataForMeal={getChartDataForMeal}
            onTagPress={handleTagPress}
          />
        </View>
      )}

      {/* Tag meal sheet */}
      <TagMealSheet
        visible={tagSheetMeal != null}
        mealLabel={tagSheetLabel}
        currentTags={tagSheetCurrentTags}
        suggestions={suggestions}
        onSave={handleTagSave}
        onClose={handleTagSheetClose}
      />
    </Container>
  );
};

export default FoodTracker;

