// /Users/iradkotton/projects/shaniDms22/src/containers/MainTabsNavigator/Containers/Trends/Trends.styles.ts
import styled from "styled-components/native";
import {TouchableOpacity} from 'react-native';

export const TrendsContainer = styled.View`
  flex: 1;
  background-color: ${({ theme }) => theme.backgroundColor};
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
  color: #333;
  margin: 10px 0;
`;

export const StatRow = styled.View`
  margin-vertical: 5px;
  padding: 10px;
  background-color: #fafafa;
  border-radius: 5px;
`;

export const StatLabel = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: #444;
`;

export const StatValue = styled.Text<{ color?: string }>`
  font-size: 16px;
  font-weight: bold;
  color: ${({ color }) => color || "#000"};
`;

export const ExplanationText = styled.Text`
  font-size: 14px;
  color: #666;
  margin-top: 2px;
`;

export const HighlightBox = styled.View`
  background-color: #e6f7ff;
  border-left-width: 4px;
  border-left-color: #1890ff;
  padding: 10px;
  border-radius: 5px;
  margin-vertical: 5px;
`;

export const CompareBox = styled.View`
  background-color: #f0f5ff;
  border-left-width: 4px;
  border-left-color: #91d5ff;
  padding: 10px;
  border-radius: 5px;
  margin-vertical: 5px;
`;

export const BoldText = styled.Text`
  font-weight: bold;
`;

export const InteractiveRow = styled(TouchableOpacity)`
  padding: 10px;
  background-color: #eee;
  margin-vertical: 5px;
  border-radius: 5px;
`;

export const InteractiveRowText = styled.Text`
  font-size: 16px;
  color: #333;
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
  background-color: ${({selected})=>selected?'#1890ff':'#ddd'};
`;

export const MetricButtonText = styled.Text`
  color: #fff;
  font-weight: bold;
`;

export const OverallStatsGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  margin-top: 10px;
`;

export const OverallStatsItem = styled.View`
  /* Each tile uses nearly half the container width */
  width: 48%;
  background-color: #fff;
  padding: 10px;
  border-radius: 6px;
  margin-bottom: 10px;
  /* Optional: add shadow/elevation for a card effect */
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.1;
  shadow-radius: 3px;
  elevation: 2;
`;

