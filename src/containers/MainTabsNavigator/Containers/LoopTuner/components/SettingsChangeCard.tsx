import React from 'react';
import {View, Text} from 'react-native';
import styled, {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {
  SettingsChangeEvent,
  SettingsChangeDetail,
  SettingsChangeType,
} from 'app/services/loopAnalysis/settingsChangeDetection';

// =============================================================================
// CONSTANTS
// =============================================================================

const CHANGE_TYPE_CONFIG: Record<
  SettingsChangeType,
  {icon: string; color: string; label: string}
> = {
  carb_ratio: {icon: '🍞', color: '#FF9500', label: 'Carb Ratio'},
  isf: {icon: '💉', color: '#5856D6', label: 'ISF'},
  target_low: {icon: '🎯', color: '#34C759', label: 'Target Low'},
  target_high: {icon: '🎯', color: '#FF3B30', label: 'Target High'},
  basal: {icon: '⏱️', color: '#007AFF', label: 'Basal'},
  dia: {icon: '⏳', color: '#AF52DE', label: 'DIA'},
  profile_switch: {icon: '🔄', color: '#5AC8FA', label: 'Profile'},
};

// =============================================================================
// STYLED COMPONENTS
// =============================================================================

const Card = styled.Pressable<{theme: ThemeType}>`
  background-color: ${(p: {theme: ThemeType}) => p.theme.white};
  border-radius: 16px;
  margin-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  margin-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.08;
  shadow-radius: 8px;
  elevation: 3;
  overflow: hidden;
`;

const CardHeader = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  align-items: center;
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.borderColor, 0.5)};
`;

const TimeContainer = styled.View`
  margin-right: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
`;

const TimeText = styled.Text<{theme: ThemeType}>`
  font-size: 24px;
  font-weight: 700;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
  letter-spacing: -0.5px;
`;

const AmPmText = styled.Text<{theme: ThemeType}>`
  font-size: 12px;
  font-weight: 600;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.5)};
  margin-top: 2px;
`;

const HeaderInfo = styled.View`
  flex: 1;
`;

const ProfileName = styled.Text<{theme: ThemeType}>`
  font-size: 16px;
  font-weight: 700;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
`;

const EnteredBy = styled.Text<{theme: ThemeType}>`
  font-size: 12px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.5)};
  margin-top: 2px;
`;

const SourceBadge = styled.View<{theme: ThemeType; $isUser: boolean}>`
  flex-direction: row;
  align-items: center;
  padding-horizontal: 8px;
  padding-vertical: 3px;
  border-radius: 8px;
  margin-left: 8px;
  background-color: ${(p: {theme: ThemeType; $isUser: boolean}) =>
    addOpacity(p.$isUser ? '#34C759' : '#007AFF', 0.15)};
`;

const SourceBadgeText = styled.Text<{$isUser: boolean}>`
  font-size: 10px;
  font-weight: 700;
  color: ${(p: {$isUser: boolean}) => (p.$isUser ? '#34C759' : '#007AFF')};
`;

const ProfileRow = styled.View`
  flex-direction: row;
  align-items: center;
`;

const TypeBadges = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 4px;
`;

const TypeBadge = styled.View<{theme: ThemeType; $color: string}>`
  padding-horizontal: 8px;
  padding-vertical: 4px;
  border-radius: 12px;
  background-color: ${(p: {$color: string}) => addOpacity(p.$color, 0.15)};
`;

const TypeBadgeText = styled.Text<{$color: string}>`
  font-size: 11px;
  font-weight: 700;
  color: ${(p: {$color: string}) => p.$color};
`;

const ChangesContainer = styled.View<{theme: ThemeType}>`
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
`;

const ChangeRow = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  align-items: center;
  padding-vertical: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  border-bottom-width: 1px;
  border-bottom-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.borderColor, 0.3)};
`;

const ChangeIcon = styled.Text`
  font-size: 18px;
  width: 28px;
`;

const ChangeInfo = styled.View`
  flex: 1;
`;

const ChangeLabel = styled.Text<{theme: ThemeType}>`
  font-size: 13px;
  font-weight: 600;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
`;

const ChangeTimeSlot = styled.Text<{theme: ThemeType}>`
  font-size: 11px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.5)};
`;

const ChangeValueContainer = styled.View`
  flex-direction: row;
  align-items: center;
`;

const OldValue = styled.Text<{theme: ThemeType}>`
  font-size: 14px;
  font-weight: 500;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.5)};
  text-decoration-line: line-through;
`;

const Arrow = styled.Text<{theme: ThemeType}>`
  font-size: 14px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.4)};
  margin-horizontal: 6px;
`;

const NewValue = styled.Text<{theme: ThemeType; $color: string}>`
  font-size: 15px;
  font-weight: 700;
  color: ${(p: {$color: string}) => p.$color};
`;

const UnitText = styled.Text<{theme: ThemeType}>`
  font-size: 11px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.5)};
  margin-left: 2px;
`;

const LastChangeRow = styled(ChangeRow)`
  border-bottom-width: 0px;
`;

const ShowMoreButton = styled.Pressable<{theme: ThemeType}>`
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  align-items: center;
  background-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.accentColor, 0.08)};
`;

const ShowMoreText = styled.Text<{theme: ThemeType}>`
  font-size: 12px;
  font-weight: 600;
  color: ${(p: {theme: ThemeType}) => p.theme.accentColor};
`;

// =============================================================================
// DATE SECTION HEADER
// =============================================================================

const DateSectionContainer = styled.View<{theme: ThemeType}>`
  padding-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  padding-top: ${(p: {theme: ThemeType}) => p.theme.spacing.lg}px;
  padding-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
`;

const DateSectionText = styled.Text<{theme: ThemeType}>`
  font-size: 14px;
  font-weight: 800;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.6)};
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const DateSubtext = styled.Text<{theme: ThemeType}>`
  font-size: 12px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.4)};
  margin-top: 2px;
`;

// =============================================================================
// HELPERS
// =============================================================================

function formatTime(timestamp: number): {time: string; amPm: string} {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const amPm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return {
    time: `${hour12}:${minutes.toString().padStart(2, '0')}`,
    amPm,
  };
}

function formatValue(value: number | string | null): string {
  if (value === null) return '—';
  if (typeof value === 'string') return value;
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
}

export function getRelativeDateLabel(timestamp: number): {
  label: string;
  subtext: string;
} {
  const now = new Date();
  const date = new Date(timestamp);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const startOfThisWeek = new Date(startOfToday.getTime() - startOfToday.getDay() * 24 * 60 * 60 * 1000);
  const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const fullDateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });

  if (dateOnly.getTime() >= startOfToday.getTime()) {
    return {label: 'Today', subtext: fullDateStr};
  }
  if (dateOnly.getTime() >= startOfYesterday.getTime()) {
    return {label: 'Yesterday', subtext: fullDateStr};
  }
  if (dateOnly.getTime() >= startOfThisWeek.getTime()) {
    return {label: 'This Week', subtext: fullDateStr};
  }
  if (dateOnly.getTime() >= startOfLastWeek.getTime()) {
    return {label: 'Last Week', subtext: fullDateStr};
  }
  if (dateOnly.getTime() >= startOfThisMonth.getTime()) {
    return {label: 'This Month', subtext: fullDateStr};
  }
  if (dateOnly.getTime() >= startOfLastMonth.getTime()) {
    return {label: 'Last Month', subtext: fullDateStr};
  }

  // Older - show month name
  const monthLabel = date.toLocaleDateString('en-US', {
    month: 'long',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
  return {label: monthLabel, subtext: ''};
}

export function shouldShowDateSection(
  currentTimestamp: number,
  previousTimestamp: number | null
): boolean {
  if (previousTimestamp === null) return true;

  const current = getRelativeDateLabel(currentTimestamp);
  const previous = getRelativeDateLabel(previousTimestamp);

  return current.label !== previous.label;
}

// =============================================================================
// COMPONENTS
// =============================================================================

interface DateSectionHeaderProps {
  timestamp: number;
}

export const DateSectionHeader: React.FC<DateSectionHeaderProps> = ({timestamp}) => {
  const {label, subtext} = getRelativeDateLabel(timestamp);

  return (
    <DateSectionContainer>
      <DateSectionText>{label}</DateSectionText>
      {subtext ? <DateSubtext>{subtext}</DateSubtext> : null}
    </DateSectionContainer>
  );
};

interface SettingsChangeCardProps {
  event: SettingsChangeEvent;
  onPress?: () => void;
  maxChangesToShow?: number;
}

export const SettingsChangeCard: React.FC<SettingsChangeCardProps> = ({
  event,
  onPress,
  maxChangesToShow = 4,
}) => {
  const theme = useTheme() as ThemeType;
  const {time, amPm} = formatTime(event.timestamp);
  const [expanded, setExpanded] = React.useState(false);

  const changesToShow = expanded ? event.changes : event.changes.slice(0, maxChangesToShow);
  const hasMoreChanges = event.changes.length > maxChangesToShow;

  const renderChange = (change: SettingsChangeDetail, index: number, isLast: boolean) => {
    const config = CHANGE_TYPE_CONFIG[change.type];
    const RowComponent = isLast ? LastChangeRow : ChangeRow;

    return (
      <RowComponent key={`${change.type}-${change.timeSlot}-${index}`}>
        <ChangeIcon>{config.icon}</ChangeIcon>
        <ChangeInfo>
          <ChangeLabel>{change.label}</ChangeLabel>
          {change.timeSlot && <ChangeTimeSlot>at {change.timeSlot}</ChangeTimeSlot>}
        </ChangeInfo>
        <ChangeValueContainer>
          {change.oldValue !== null && (
            <>
              <OldValue>{formatValue(change.oldValue)}</OldValue>
              <Arrow>→</Arrow>
            </>
          )}
          <NewValue $color={config.color}>{formatValue(change.newValue)}</NewValue>
          {change.unit && <UnitText>{change.unit}</UnitText>}
        </ChangeValueContainer>
      </RowComponent>
    );
  };

  // Get unique change types for badges
  const uniqueTypes = [...new Set(event.changeTypes)];

  return (
    <Card onPress={onPress}>
      <CardHeader>
        <TimeContainer>
          <TimeText>{time}</TimeText>
          <AmPmText>{amPm}</AmPmText>
        </TimeContainer>
        <HeaderInfo>
          <ProfileName>{event.profileName}</ProfileName>
        </HeaderInfo>
        <TypeBadges>
          {uniqueTypes.slice(0, 3).map(type => {
            const config = CHANGE_TYPE_CONFIG[type];
            return (
              <TypeBadge key={type} $color={config.color}>
                <TypeBadgeText $color={config.color}>{config.label}</TypeBadgeText>
              </TypeBadge>
            );
          })}
          {uniqueTypes.length > 3 && (
            <TypeBadge $color={theme.textColor}>
              <TypeBadgeText $color={theme.textColor}>+{uniqueTypes.length - 3}</TypeBadgeText>
            </TypeBadge>
          )}
        </TypeBadges>
      </CardHeader>

      <ChangesContainer>
        {changesToShow.map((change, index) =>
          renderChange(change, index, index === changesToShow.length - 1 && !hasMoreChanges)
        )}
      </ChangesContainer>

      {hasMoreChanges && !expanded && (
        <ShowMoreButton onPress={() => setExpanded(true)}>
          <ShowMoreText>
            Show {event.changes.length - maxChangesToShow} more changes
          </ShowMoreText>
        </ShowMoreButton>
      )}
    </Card>
  );
};
