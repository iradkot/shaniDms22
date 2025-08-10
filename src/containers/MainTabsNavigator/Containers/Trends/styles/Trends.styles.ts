// /Trends/styles/Trends.styles.ts

import styled from 'styled-components/native';
import {TouchableOpacity} from 'react-native';
import {ThemeType} from 'app/types/theme';

export const TrendsContainer = styled.View`
  flex: 1;
  background-color: ${({theme}: {theme: ThemeType}) => theme.backgroundColor};
  padding: 10px;
`;

export const DateRangeSelector = styled.View`
  flex-direction: row;
  justify-content: space-around;
  margin-vertical: 10px;
`;

export const SectionTitle = styled.Text`
  font-size: 20px;
  font-weight: 700;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
  margin: 10px 0;
`;

export const StatRow = styled.View`
  margin-vertical: 5px;
  padding: 10px;
  background-color: ${({theme}: {theme: ThemeType}) => theme.backgroundColor};
  border-radius: 5px;
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) => theme.borderColor};
`;

export const StatLabel = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

export const StatValue = styled.Text<{color?: string}>`
  font-size: 16px;
  font-weight: bold;
  color: ${({color, theme}: {color?: string; theme: ThemeType}) => color || theme.textColor};
`;

export const ExplanationText = styled.Text`
  font-size: 14px;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor}88;
  margin-top: 2px;
`;

export const HighlightBox = styled.View`
  background-color: ${({theme}: {theme: ThemeType}) => theme.primaryColor + '20'};
  border-left-width: 4px;
  border-left-color: ${({theme}: {theme: ThemeType}) => theme.primaryColor};
  padding: 10px;
  border-radius: 5px;
  margin-vertical: 5px;
`;

export const CompareBox = styled.View`
  background-color: ${({theme}: {theme: ThemeType}) => theme.accentColor + '20'};
  border-left-width: 4px;
  border-left-color: ${({theme}: {theme: ThemeType}) => theme.accentColor};
  padding: 10px;
  border-radius: 5px;
  margin-vertical: 5px;
`;

export const BoldText = styled.Text`
  font-weight: bold;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

export const InteractiveRow = styled(TouchableOpacity)`
  padding: 10px;
  background-color: ${({theme}: {theme: ThemeType}) => theme.backgroundColor};
  margin-vertical: 5px;
  border-radius: 5px;
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) => theme.borderColor};
`;

export const InteractiveRowText = styled.Text`
  font-size: 16px;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
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
  margin-bottom: 10px;
`;

export const MetricButton = styled.TouchableOpacity<{selected?: boolean}>`
  padding: 8px 12px;
  border-radius: 5px;
  margin: 0 5px;
  background-color: ${({selected, theme}: {selected?: boolean; theme: ThemeType}) => 
    selected ? theme.primaryColor : theme.backgroundColor};
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) => theme.primaryColor};
`;

export const MetricButtonText = styled.Text<{selected?: boolean}>`
  color: ${({selected, theme}: {selected?: boolean; theme: ThemeType}) => 
    selected ? theme.white : theme.primaryColor};
  font-weight: bold;
`;

/**
 * Overall Stats Grid
 */
export const OverallStatsGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  margin-top: 10px;
`;

export const OverallStatsItem = styled.View`
  width: 48%;
  background-color: ${({theme}: {theme: ThemeType}) => theme.backgroundColor};
  padding: 10px;
  border-radius: 6px;
  margin-bottom: 10px;
  shadow-color: ${({theme}: {theme: ThemeType}) => theme.shadowColor};
  shadow-offset: 0px 2px;
  shadow-opacity: 0.1;
  shadow-radius: 3px;
  elevation: 2;
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) => theme.borderColor};
`;

export const Subtle = styled.Text`
  font-size: 12px;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor}88;
`;

export const ComparisonTitle = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
  margin-bottom: 5px;
`;

export const ComparisonSubtitle = styled.Text`
  font-size: 14px;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
  margin-bottom: 10px;
`;

export const ComparisonDateRange = styled.Text`
  font-size: 12px;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor}88;
  margin-bottom: 15px;
  font-style: italic;
`;

export const StatChange = styled.Text<{color?: string}>`
  font-size: 14px;
  font-weight: bold;
  color: ${({color, theme}: {color?: string; theme: ThemeType}) => color || theme.textColor};
`;
