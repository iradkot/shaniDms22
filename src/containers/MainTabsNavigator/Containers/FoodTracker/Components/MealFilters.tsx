import React from 'react';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useTheme} from 'styled-components/native';
import {format, subDays, addDays, isFuture} from 'date-fns';

import {CarbRangeFilter} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/types';
import {
  FiltersRow,
  FilterChip,
  FilterChipText,
  WeekNav,
  WeekLabel,
  NavButton,
} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/styles';
import {ThemeType} from 'app/types/theme';

const FILTERS: {label: string; key: CarbRangeFilter}[] = [
  {label: 'All', key: 'all'},
  {label: '<20g', key: 'low'},
  {label: '20-50g', key: 'medium'},
  {label: '>50g', key: 'high'},
];

interface MealFiltersProps {
  /** Current active filter. */
  activeFilter: CarbRangeFilter;
  onFilterChange: (filter: CarbRangeFilter) => void;
  /** First day of current range. */
  rangeStart: Date;
  /** Move range by ±7 days. */
  onWeekChange: (direction: -1 | 1) => void;
}

const MealFilters: React.FC<MealFiltersProps> = ({
  activeFilter,
  onFilterChange,
  rangeStart,
  onWeekChange,
}) => {
  const theme = useTheme() as ThemeType;
  const rangeEnd = addDays(rangeStart, 6);
  const canGoForward = !isFuture(addDays(rangeEnd, 1));

  return (
    <>
      {/* Week navigator */}
      <WeekNav>
        <NavButton onPress={() => onWeekChange(-1)}>
          <MaterialIcons name="chevron-left" size={28} color={theme.textColor} />
        </NavButton>
        <WeekLabel>
          {format(rangeStart, 'dd MMM')} – {format(rangeEnd, 'dd MMM yyyy')}
        </WeekLabel>
        <NavButton
          onPress={() => canGoForward && onWeekChange(1)}
          disabled={!canGoForward}>
          <MaterialIcons
            name="chevron-right"
            size={28}
            color={canGoForward ? theme.textColor : theme.secondaryColor}
          />
        </NavButton>
      </WeekNav>

      {/* Carb-range filter chips */}
      <FiltersRow>
        {FILTERS.map(f => (
          <FilterChip
            key={f.key}
            active={activeFilter === f.key}
            onPress={() => onFilterChange(f.key)}>
            <FilterChipText active={activeFilter === f.key}>
              {f.label}
            </FilterChipText>
          </FilterChip>
        ))}
      </FiltersRow>
    </>
  );
};

export default React.memo(MealFilters);
