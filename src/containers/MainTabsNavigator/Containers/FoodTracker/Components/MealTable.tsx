import React, {useCallback, useMemo, useState} from 'react';
import {FlatList, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useTheme} from 'styled-components/native';

import MealRow from 'app/containers/MainTabsNavigator/Containers/FoodTracker/Components/MealRow';
import MealChartExpander from 'app/containers/MainTabsNavigator/Containers/FoodTracker/Components/MealChartExpander';

import {
  MealEntry,
  MealChartData,
  SortField,
  SortDirection,
  CarbRangeFilter,
} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/types';

import {
  TableHeader,
  HeaderCell,
  HeaderCellText,
  EmptyContainer,
  EmptyText,
} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/styles';
import {ThemeType} from 'app/types/theme';

// ── constants ────────────────────────────────────────

interface ColumnConfig {
  label: string;
  field: SortField | null;
  flex: number;
}

const COLUMNS: ColumnConfig[] = [
  {label: '', field: null, flex: 0.4}, // icon
  {label: 'Time', field: 'timestamp', flex: 1.1},
  {label: 'Carbs', field: 'carbsEntered', flex: 1.4},
  {label: 'Score', field: 'score', flex: 0.8},
];

// ── helpers ──────────────────────────────────────────

function filterMeals(
  meals: MealEntry[],
  carbFilter: CarbRangeFilter,
): MealEntry[] {
  switch (carbFilter) {
    case 'low':
      return meals.filter(m => m.carbsEntered < 20);
    case 'medium':
      return meals.filter(m => m.carbsEntered >= 20 && m.carbsEntered <= 50);
    case 'high':
      return meals.filter(m => m.carbsEntered > 50);
    default:
      return meals;
  }
}

function sortMeals(
  meals: MealEntry[],
  field: SortField,
  dir: SortDirection,
): MealEntry[] {
  const mult = dir === 'asc' ? 1 : -1;
  return [...meals].sort((a, b) => {
    const va = a[field] ?? -Infinity;
    const vb = b[field] ?? -Infinity;
    return (va < vb ? -1 : va > vb ? 1 : 0) * mult;
  });
}

// ── component ────────────────────────────────────────

interface MealTableProps {
  meals: MealEntry[];
  carbFilter: CarbRangeFilter;
  getChartDataForMeal: (meal: MealEntry) => MealChartData;
}

const MealTable: React.FC<MealTableProps> = ({
  meals,
  carbFilter,
  getChartDataForMeal,
}) => {
  const theme = useTheme() as ThemeType;
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Cached chart data so re-renders don't refetch
  const [expandedChart, setExpandedChart] = useState<MealChartData | null>(
    null,
  );

  const handleSort = useCallback(
    (field: SortField) => {
      if (field === sortField) {
        setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('desc');
      }
    },
    [sortField],
  );

  const handleRowPress = useCallback(
    (meal: MealEntry) => {
      if (expandedId === meal.id) {
        setExpandedId(null);
        setExpandedChart(null);
      } else {
        setExpandedId(meal.id);
        setExpandedChart(getChartDataForMeal(meal));
      }
    },
    [expandedId, getChartDataForMeal],
  );

  const processed = useMemo(() => {
    const filtered = filterMeals(meals, carbFilter);
    return sortMeals(filtered, sortField, sortDir);
  }, [meals, carbFilter, sortField, sortDir]);

  const renderItem = useCallback(
    ({item}: {item: MealEntry}) => {
      const isExpanded = item.id === expandedId;
      return (
        <View>
          <MealRow
            meal={item}
            isExpanded={isExpanded}
            onPress={() => handleRowPress(item)}
          />
          {isExpanded && expandedChart && (
            <MealChartExpander chartData={expandedChart} meal={item} />
          )}
        </View>
      );
    },
    [expandedId, expandedChart, handleRowPress],
  );

  const keyExtractor = useCallback((item: MealEntry) => item.id, []);

  const ListHeader = useMemo(
    () => (
      <TableHeader>
        {COLUMNS.map((col, idx) => {
          const isSorted = col.field === sortField;
          return (
            <HeaderCell
              key={idx}
              flex={col.flex}
              disabled={!col.field}
              onPress={() => col.field && handleSort(col.field)}>
              <HeaderCellText>{col.label}</HeaderCellText>
              {isSorted && (
                <MaterialIcons
                  name={sortDir === 'asc' ? 'arrow-upward' : 'arrow-downward'}
                  size={12}
                  color={theme.textColor}
                />
              )}
            </HeaderCell>
          );
        })}
      </TableHeader>
    ),
    [sortField, sortDir, handleSort, theme],
  );

  const ListEmpty = useMemo(
    () => (
      <EmptyContainer>
        <MaterialIcons name="no-meals" size={48} color={theme.secondaryColor} />
        <EmptyText>No meals recorded for this period</EmptyText>
      </EmptyContainer>
    ),
    [theme],
  );

  return (
    <FlatList
      data={processed}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={ListEmpty}
      stickyHeaderIndices={[0]}
      initialNumToRender={15}
      maxToRenderPerBatch={10}
      windowSize={5}
      removeClippedSubviews
    />
  );
};

export default React.memo(MealTable);
