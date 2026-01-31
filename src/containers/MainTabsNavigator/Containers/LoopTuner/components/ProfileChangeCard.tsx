import React from 'react';
import {Pressable, Text, View} from 'react-native';
import styled, {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {ProfileChangeEvent} from 'app/types/loopAnalysis.types';
import {addOpacity} from 'app/style/styling.utils';
import {formatDateToDateAndTimeString} from 'app/utils/datetime.utils';

// ─────────────────────────────────────────────────────────────────────────────
// Styled Components
// ─────────────────────────────────────────────────────────────────────────────

const Card = styled(Pressable)<{theme: ThemeType}>`
  background-color: ${(p: {theme: ThemeType}) => p.theme.white};
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius}px;
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => p.theme.borderColor};
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
`;

const CardHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
`;

const DateText = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  font-weight: 700;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
`;

const SourceBadge = styled.View<{theme: ThemeType; $color: string}>`
  padding-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  padding-vertical: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius / 2}px;
  background-color: ${(p: {$color: string}) => addOpacity(p.$color, 0.15)};
`;

const SourceText = styled.Text<{theme: ThemeType; $color: string}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  font-weight: 700;
  color: ${(p: {$color: string}) => p.$color};
  text-transform: uppercase;
`;

const ChangesList = styled.View<{theme: ThemeType}>`
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
`;

const ChangeRow = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: 4px;
`;

const ChangeLabel = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.7)};
  width: 80px;
`;

const ChangeValue = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  font-weight: 600;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
  flex: 1;
  flex-shrink: 1;
`;

const ArrowIcon = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.md}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.4)};
  margin-left: auto;
`;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ProfileChangeCardProps {
  event: ProfileChangeEvent;
  onPress: () => void;
  testID?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getSourceColor(source: ProfileChangeEvent['source']): string {
  switch (source) {
    case 'loop-ios':
      return '#007AFF'; // iOS blue
    case 'androidaps':
      return '#3DDC84'; // Android green
    case 'openaps':
      return '#FF9500'; // Orange
    default:
      return '#8E8E93'; // Gray
  }
}

function formatSourceLabel(source: ProfileChangeEvent['source']): string {
  switch (source) {
    case 'loop-ios':
      return 'Loop';
    case 'androidaps':
      return 'AAPS';
    case 'openaps':
      return 'OpenAPS';
    default:
      return 'Unknown';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const ProfileChangeCard: React.FC<ProfileChangeCardProps> = ({
  event,
  onPress,
  testID,
}) => {
  const theme = useTheme() as ThemeType;
  const sourceColor = getSourceColor(event.source);

  return (
    <Card onPress={onPress} testID={testID}>
      <CardHeader>
        <View>
          <DateText>
            {formatDateToDateAndTimeString(new Date(event.timestamp))}
          </DateText>
        </View>
        <SourceBadge $color={sourceColor}>
          <SourceText $color={sourceColor}>
            {formatSourceLabel(event.source)}
          </SourceText>
        </SourceBadge>
      </CardHeader>

      <ChangesList>
        <ChangeRow>
          <ChangeLabel>Profile:</ChangeLabel>
          <ChangeValue>{event.profileName || 'Default'}</ChangeValue>
        </ChangeRow>
        {event.summary && (
          <ChangeRow>
            <ChangeLabel>Change:</ChangeLabel>
            <ChangeValue numberOfLines={2}>{event.summary}</ChangeValue>
          </ChangeRow>
        )}
        {event.durationMinutes && event.durationMinutes > 0 && (
          <ChangeRow>
            <ChangeLabel>Duration:</ChangeLabel>
            <ChangeValue>{event.durationMinutes} min</ChangeValue>
          </ChangeRow>
        )}
      </ChangesList>

      <ArrowIcon>→</ArrowIcon>
    </Card>
  );
};
