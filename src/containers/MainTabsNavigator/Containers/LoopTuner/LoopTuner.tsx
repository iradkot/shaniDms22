import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Pressable,
  ScrollView,
} from 'react-native';
import styled, {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {addOpacity} from 'app/style/styling.utils';
import {useSettingsChanges, ChangeTypeFilter} from 'app/hooks/loop/useSettingsChanges';
import {SettingsChangeEvent} from 'app/services/loopAnalysis/settingsChangeDetection';

import {
  SettingsChangeCard,
  DateSectionHeader,
  shouldShowDateSection,
} from './components/SettingsChangeCard';

// ─────────────────────────────────────────────────────────────────────────────
// Filter Config
// ─────────────────────────────────────────────────────────────────────────────

interface FilterOption {
  key: ChangeTypeFilter;
  label: string;
  icon: string;
  color: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  {key: 'all', label: 'All', icon: '📋', color: '#8E8E93'},
  {key: 'carb_ratio', label: 'Carb Ratio', icon: '🍞', color: '#FF9500'},
  {key: 'isf', label: 'ISF', icon: '💉', color: '#5856D6'},
  {key: 'targets', label: 'Targets', icon: '🎯', color: '#34C759'},
  {key: 'basal', label: 'Basal', icon: '⏱️', color: '#007AFF'},
  {key: 'dia', label: 'DIA', icon: '⏳', color: '#AF52DE'},
];

// ─────────────────────────────────────────────────────────────────────────────
// Styled Components
// ─────────────────────────────────────────────────────────────────────────────

const Container = styled.View<{theme: ThemeType}>`
  flex: 1;
  background-color: ${(p: {theme: ThemeType}) => p.theme.backgroundColor};
`;

const HeaderSection = styled.View<{theme: ThemeType}>`
  padding-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.lg}px;
  padding-top: ${(p: {theme: ThemeType}) => p.theme.spacing.lg}px;
  padding-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  background-color: ${(p: {theme: ThemeType}) => p.theme.white};
  border-bottom-width: 1px;
  border-bottom-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.borderColor, 0.5)};
`;

const HeaderTitle = styled.Text<{theme: ThemeType}>`
  font-size: 28px;
  font-weight: 800;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
  letter-spacing: -0.5px;
`;

const HeaderSubtitle = styled.Text<{theme: ThemeType}>`
  font-size: 15px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.6)};
  margin-top: 4px;
  line-height: 20px;
`;

const StatsRow = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  gap: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
`;

const StatBadge = styled.View<{theme: ThemeType; $color: string}>`
  flex-direction: row;
  align-items: center;
  padding-horizontal: 12px;
  padding-vertical: 6px;
  border-radius: 20px;
  background-color: ${(p: {$color: string}) => addOpacity(p.$color, 0.12)};
`;

const StatIcon = styled.Text`
  font-size: 14px;
  margin-right: 6px;
`;

const StatText = styled.Text<{$color: string}>`
  font-size: 13px;
  font-weight: 700;
  color: ${(p: {$color: string}) => p.$color};
`;

// Filter Chips
const FilterScrollContainer = styled(ScrollView)`
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  margin-horizontal: -${(p: {theme: ThemeType}) => p.theme.spacing.lg}px;
  padding-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.lg}px;
`;

const FilterChip = styled(Pressable)<{theme: ThemeType; $isActive: boolean; $color: string}>`
  flex-direction: row;
  align-items: center;
  padding-horizontal: 14px;
  padding-vertical: 8px;
  border-radius: 20px;
  margin-right: 8px;
  background-color: ${(p: {theme: ThemeType; $isActive: boolean; $color: string}) =>
    p.$isActive ? addOpacity(p.$color, 0.15) : addOpacity(p.theme.borderColor, 0.3)};
  border-width: ${(p: {$isActive: boolean}) => (p.$isActive ? '2px' : '0px')};
  border-color: ${(p: {$color: string}) => p.$color};
`;

const FilterChipIcon = styled.Text`
  font-size: 14px;
  margin-right: 6px;
`;

const FilterChipText = styled.Text<{theme: ThemeType; $isActive: boolean; $color: string}>`
  font-size: 13px;
  font-weight: ${(p: {$isActive: boolean}) => (p.$isActive ? '700' : '500')};
  color: ${(p: {theme: ThemeType; $isActive: boolean; $color: string}) =>
    p.$isActive ? p.$color : addOpacity(p.theme.textColor, 0.7)};
`;

const FilterChipCount = styled.Text<{$color: string}>`
  font-size: 11px;
  font-weight: 700;
  color: ${(p: {$color: string}) => p.$color};
  margin-left: 6px;
  background-color: ${(p: {$color: string}) => addOpacity(p.$color, 0.2)};
  padding-horizontal: 6px;
  padding-vertical: 2px;
  border-radius: 10px;
  overflow: hidden;
`;

const EmptyStateContainer = styled.View<{theme: ThemeType}>`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.xl}px;
`;

const EmptyStateIcon = styled.Text`
  font-size: 64px;
  margin-bottom: 16px;
`;

const EmptyStateTitle = styled.Text<{theme: ThemeType}>`
  font-size: 20px;
  font-weight: 700;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
  text-align: center;
  margin-bottom: 8px;
`;

const EmptyStateText = styled.Text<{theme: ThemeType}>`
  font-size: 15px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.6)};
  text-align: center;
  line-height: 22px;
`;

const ErrorBanner = styled.View<{theme: ThemeType}>`
  margin: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  background-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.belowRangeColor, 0.1)};
  border-radius: 12px;
  border-left-width: 4px;
  border-left-color: ${(p: {theme: ThemeType}) => p.theme.belowRangeColor};
`;

const ErrorText = styled.Text<{theme: ThemeType}>`
  font-size: 14px;
  color: ${(p: {theme: ThemeType}) => p.theme.belowRangeColor};
`;

const LoaderContainer = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`;

const LoadingMoreContainer = styled.View<{theme: ThemeType}>`
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.lg}px;
  align-items: center;
`;

const LoadingMoreText = styled.Text<{theme: ThemeType}>`
  font-size: 13px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.5)};
  margin-top: 8px;
`;

const FooterContainer = styled.View<{theme: ThemeType}>`
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.xl}px;
  align-items: center;
`;

const FooterText = styled.Text<{theme: ThemeType}>`
  font-size: 13px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.4)};
`;

// ─────────────────────────────────────────────────────────────────────────────
// List Item Types
// ─────────────────────────────────────────────────────────────────────────────

type ListItem =
  | {type: 'date_section'; timestamp: number; key: string}
  | {type: 'event'; event: SettingsChangeEvent; key: string};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

const LoopTuner: React.FC = () => {
  const theme = useTheme() as ThemeType;
  
  // Type filter state
  const [typeFilter, setTypeFilter] = useState<ChangeTypeFilter>('all');

  // Use the settings changes hook with filter
  const {
    events,
    allEvents,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
  } = useSettingsChanges({typeFilter});

  // Count events per filter type for chips
  const filterCounts = React.useMemo(() => {
    const counts: Record<ChangeTypeFilter, number> = {
      all: allEvents.length,
      carb_ratio: 0,
      isf: 0,
      targets: 0,
      basal: 0,
      dia: 0,
    };
    
    for (const event of allEvents) {
      for (const type of event.changeTypes) {
        if (type === 'carb_ratio') counts.carb_ratio++;
        if (type === 'isf') counts.isf++;
        if (type === 'target_low' || type === 'target_high') counts.targets++;
        if (type === 'basal') counts.basal++;
        if (type === 'dia') counts.dia++;
      }
    }
    
    return counts;
  }, [allEvents]);

  // Build list data with date sections
  const listData: ListItem[] = React.useMemo(() => {
    const items: ListItem[] = [];
    let previousTimestamp: number | null = null;

    for (const event of events) {
      // Add date section header if needed
      if (shouldShowDateSection(event.timestamp, previousTimestamp)) {
        items.push({
          type: 'date_section',
          timestamp: event.timestamp,
          key: `section-${event.timestamp}`,
        });
      }

      items.push({
        type: 'event',
        event,
        key: event.id,
      });

      previousTimestamp = event.timestamp;
    }

    return items;
  }, [events]);

  // Calculate stats for header
  const stats = React.useMemo(() => {
    const now = Date.now();
    const last30Days = now - 30 * 24 * 60 * 60 * 1000;
    const last7Days = now - 7 * 24 * 60 * 60 * 1000;

    const changesLast30Days = events.filter(e => e.timestamp >= last30Days).length;
    const changesLast7Days = events.filter(e => e.timestamp >= last7Days).length;

    return {
      total: events.length,
      last30Days: changesLast30Days,
      last7Days: changesLast7Days,
    };
  }, [events]);

  // Handle end reached for infinite scroll
  const handleEndReached = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      loadMore();
    }
  }, [isLoadingMore, hasMore, loadMore]);

  // Render item
  const renderItem = useCallback(
    ({item}: {item: ListItem}) => {
      if (item.type === 'date_section') {
        return <DateSectionHeader timestamp={item.timestamp} />;
      }

      return (
        <SettingsChangeCard
          event={item.event}
          maxChangesToShow={3}
        />
      );
    },
    [],
  );

  // Key extractor
  const keyExtractor = useCallback((item: ListItem) => item.key, []);

  // Footer component
  const ListFooter = useCallback(() => {
    if (isLoadingMore) {
      return (
        <LoadingMoreContainer>
          <ActivityIndicator size="small" color={theme.accentColor} />
          <LoadingMoreText>Loading more changes...</LoadingMoreText>
        </LoadingMoreContainer>
      );
    }

    if (!hasMore && events.length > 0) {
      return (
        <FooterContainer>
          <FooterText>All {events.length} settings changes loaded</FooterText>
        </FooterContainer>
      );
    }

    return null;
  }, [isLoadingMore, hasMore, events.length, theme.accentColor]);

  // ─────────────────────────────────────────────────────────────────────────
  // Filter Control Component
  // ─────────────────────────────────────────────────────────────────────────

  const FilterControl = useCallback(() => (
    <FilterScrollContainer horizontal showsHorizontalScrollIndicator={false}>
      {FILTER_OPTIONS.map(option => {
        const isActive = typeFilter === option.key;
        const count = filterCounts[option.key];
        
        // Hide filters with 0 count (except All)
        if (option.key !== 'all' && count === 0) return null;
        
        return (
          <FilterChip
            key={option.key}
            $isActive={isActive}
            $color={option.color}
            onPress={() => setTypeFilter(option.key)}
          >
            <FilterChipIcon>{option.icon}</FilterChipIcon>
            <FilterChipText $isActive={isActive} $color={option.color}>
              {option.label}
            </FilterChipText>
            {count > 0 && option.key !== 'all' && (
              <FilterChipCount $color={option.color}>{count}</FilterChipCount>
            )}
          </FilterChip>
        );
      })}
    </FilterScrollContainer>
  ), [typeFilter, filterCounts]);

  // ─────────────────────────────────────────────────────────────────────────
  // Empty State Message
  // ─────────────────────────────────────────────────────────────────────────

  const getEmptyStateMessage = useCallback(() => {
    const filterOption = FILTER_OPTIONS.find(f => f.key === typeFilter);
    if (typeFilter !== 'all' && filterOption) {
      return `No ${filterOption.label} changes found.\n\nTry selecting "All" to see other changes.`;
    }
    return 'Settings changes like Carb Ratio, ISF, Targets, and Basal adjustments will appear here.\n\nMake sure your Loop app is uploading profiles to Nightscout.';
  }, [typeFilter]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Loading State
  // ─────────────────────────────────────────────────────────────────────────

  if (isLoading && events.length === 0) {
    return (
      <Container testID={E2E_TEST_IDS.loopTuner.container}>
        <HeaderSection>
          <HeaderTitle>Settings History</HeaderTitle>
          <HeaderSubtitle>Loading your Loop settings changes...</HeaderSubtitle>
          <FilterControl />
        </HeaderSection>
        <LoaderContainer>
          <ActivityIndicator size="large" color={theme.accentColor} />
        </LoaderContainer>
      </Container>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Error State
  // ─────────────────────────────────────────────────────────────────────────

  if (error && events.length === 0) {
    return (
      <Container testID={E2E_TEST_IDS.loopTuner.container}>
        <HeaderSection>
          <HeaderTitle>Settings History</HeaderTitle>
          <FilterControl />
        </HeaderSection>
        <ErrorBanner>
          <ErrorText>{error}</ErrorText>
        </ErrorBanner>
      </Container>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Empty State
  // ─────────────────────────────────────────────────────────────────────────

  if (events.length === 0) {
    return (
      <Container testID={E2E_TEST_IDS.loopTuner.container}>
        <HeaderSection>
          <HeaderTitle>Settings History</HeaderTitle>
          <HeaderSubtitle>Track changes to your Loop settings</HeaderSubtitle>
          <FilterControl />
        </HeaderSection>
        <EmptyStateContainer>
          <EmptyStateIcon>⚙️</EmptyStateIcon>
          <EmptyStateTitle>No Settings Changes Found</EmptyStateTitle>
          <EmptyStateText>
            {getEmptyStateMessage()}
          </EmptyStateText>
        </EmptyStateContainer>
      </Container>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: List View
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Container testID={E2E_TEST_IDS.loopTuner.container}>
      <HeaderSection>
        <HeaderTitle>Settings History</HeaderTitle>
        <HeaderSubtitle>
          See how your CR, ISF, Targets, and Basal changes affect your glucose
        </HeaderSubtitle>
        <FilterControl />
        <StatsRow>
          <StatBadge $color={theme.accentColor}>
            <StatIcon>📊</StatIcon>
            <StatText $color={theme.accentColor}>{stats.total} total</StatText>
          </StatBadge>
          {stats.last7Days > 0 && (
            <StatBadge $color="#34C759">
              <StatIcon>📅</StatIcon>
              <StatText $color="#34C759">{stats.last7Days} this week</StatText>
            </StatBadge>
          )}
        </StatsRow>
      </HeaderSection>

      <FlatList
        data={listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        ListFooterComponent={ListFooter}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refresh}
            tintColor={theme.accentColor}
          />
        }
        contentContainerStyle={{paddingBottom: 20}}
        showsVerticalScrollIndicator={false}
      />
    </Container>
  );
};

export default LoopTuner;
