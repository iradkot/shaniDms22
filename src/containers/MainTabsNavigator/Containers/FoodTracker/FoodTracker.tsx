import React, {useCallback, useMemo, useState} from 'react';
import {subDays} from 'date-fns';

import {useMealTreatments} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/hooks/useMealTreatments';
import MealFilters from 'app/containers/MainTabsNavigator/Containers/FoodTracker/Components/MealFilters';
import MealTable from 'app/containers/MainTabsNavigator/Containers/FoodTracker/Components/MealTable';
import MealSummaryStrip from 'app/containers/MainTabsNavigator/Containers/FoodTracker/Components/MealSummaryStrip';
import {CarbRangeFilter} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/types';
import {
  Container,
  Header,
  HeaderTitle,
} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/styles';
import Loader from 'app/components/common-ui/Loader/Loader';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';

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

  // ── data ──
  const {meals, isLoading, getChartDataForMeal} = useMealTreatments(
    rangeStart,
    rangeEnd,
  );

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

      <MealSummaryStrip meals={meals} />

      <MealFilters
        activeFilter={carbFilter}
        onFilterChange={setCarbFilter}
        rangeStart={rangeStart}
        onWeekChange={handleWeekChange}
      />

      {isLoading ? (
        <Loader />
      ) : (
        <MealTable
          meals={meals}
          carbFilter={carbFilter}
          getChartDataForMeal={getChartDataForMeal}
        />
      )}
    </Container>
  );
};

export default FoodTracker;

