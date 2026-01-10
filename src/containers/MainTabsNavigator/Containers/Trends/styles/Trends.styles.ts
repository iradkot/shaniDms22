// /Trends/styles/Trends.styles.ts

import styled from 'styled-components/native';
import {TouchableOpacity} from 'react-native';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

export const TrendsContainer = styled.View.attrs({collapsable: false})<{theme: ThemeType}>`
  flex: 1;
  background-color: ${({theme}) => theme.backgroundColor};
  padding: ${({theme}) => theme.spacing.sm + 2}px;
`;

export const DateRangeSelector = styled.View`
  flex-direction: row;
  justify-content: space-around;
  margin-vertical: ${({theme}) => theme.spacing.sm + 2}px;
`;

export const SectionTitle = styled.Text`
  font-size: 20px;
  font-weight: 700;
  color: ${({theme}) => theme.textColor};
  margin: ${({theme}) => theme.spacing.sm + 2}px 0;
`;

export const StatRow = styled.View`
  margin-vertical: ${({theme}) => theme.spacing.xs + 1}px;
  padding: ${({theme}) => theme.spacing.sm + 2}px;
  background-color: ${({theme}) => theme.white};
  border-radius: 5px;
`;

export const StatLabel = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: ${({theme}) => theme.textColor};
`;

export const StatValue = styled.Text<{color?: string}>`
  font-size: 16px;
  font-weight: bold;
  color: ${({theme, color}) => color || theme.textColor};
`;

export const ExplanationText = styled.Text`
  font-size: 14px;
  color: ${({theme}) => theme.textColor};
  margin-top: 2px;
`;

export const HighlightBox = styled.View`
  background-color: ${({theme}) => theme.white};
  border-left-width: 4px;
  border-left-color: ${({theme}) => theme.accentColor};
  padding: ${({theme}) => theme.spacing.sm + 2}px;
  border-radius: 5px;
  margin-vertical: ${({theme}) => theme.spacing.xs + 1}px;
`;

export const CompareBox = styled.View`
  background-color: ${({theme}) => addOpacity(theme.accentColor, 0.08)};
  border-left-width: 4px;
  border-left-color: ${({theme}) => addOpacity(theme.accentColor, 0.5)};
  padding: ${({theme}) => theme.spacing.sm + 2}px;
  border-radius: 5px;
  margin-vertical: ${({theme}) => theme.spacing.xs + 1}px;
`;

export const BoldText = styled.Text`
  font-weight: bold;
`;

export const InteractiveRow = styled(TouchableOpacity)`
  padding: ${({theme}) => theme.spacing.sm + 2}px;
  background-color: ${({theme}) => theme.secondaryColor};
  margin-vertical: ${({theme}) => theme.spacing.xs + 1}px;
  border-radius: 5px;
`;

export const InteractiveRowText = styled.Text`
  font-size: 16px;
  color: ${({theme}) => addOpacity(theme.textColor, 0.9)};
`;

export const Emoji = styled.Text`
  font-size: 16px;
`;

export const Row = styled.View`
  flex-direction: row;
  align-items: center;
`;

export const MetricSelector = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-bottom: ${({theme}) => theme.spacing.sm + 2}px;
`;

export const MetricButton = styled.TouchableOpacity<{selected?: boolean}>`
  padding: 8px 12px;
  border-radius: 5px;
  margin: 0 5px;
  background-color: ${({selected, theme}) =>
    selected ? theme.accentColor : theme.secondaryColor};
`;

export const MetricButtonText = styled.Text<{selected?: boolean}>`
  color: ${({selected, theme}) =>
    selected ? theme.buttonTextColor : addOpacity(theme.textColor, 0.8)};
  font-weight: 700;
`;

export const DateRangeHeader = styled.View`
  align-items: center;
  margin-vertical: ${({theme}) => theme.spacing.sm + 2}px;
`;

export const DateRangeText = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: ${({theme}) => theme.textColor};
`;

/**
 * Overall Stats Grid
 */
export const OverallStatsGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  margin-top: ${({theme}) => theme.spacing.sm + 2}px;
`;

export const OverallStatsItem = styled.View`
  width: 48%;
  background-color: ${({theme}) => theme.white};
  padding: ${({theme}) => theme.spacing.sm + 2}px;
  border-radius: 6px;
  margin-bottom: ${({theme}) => theme.spacing.sm + 2}px;
  shadow-color: ${({theme}) => theme.shadowColor};
  shadow-offset: 0px 2px;
  shadow-opacity: 0.1;
  shadow-radius: 3px;
  elevation: 2;
`;

export const Subtle = styled.Text`
  font-size: 12px;
  color: ${({theme}) => addOpacity(theme.textColor, 0.6)};
`;

export const ComparisonTitle = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: ${({theme}) => addOpacity(theme.textColor, 0.9)};
  margin-bottom: ${({theme}) => theme.spacing.xs + 1}px;
`;

export const ComparisonSubtitle = styled.Text`
  font-size: 14px;
  color: ${({theme}) => addOpacity(theme.textColor, 0.8)};
  margin-bottom: ${({theme}) => theme.spacing.sm + 2}px;
`;

export const ComparisonDateRange = styled.Text`
  font-size: 12px;
  color: ${({theme}) => addOpacity(theme.textColor, 0.7)};
  margin-bottom: ${({theme}) => theme.spacing.lg - 1}px;
  font-style: italic;
`;

export const StatChange = styled.Text<{color?: string}>`
  font-size: 14px;
  font-weight: bold;
  color: ${({theme, color}) => color || theme.textColor};
`;
