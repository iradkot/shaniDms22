// AGP Component Styles

import styled from 'styled-components/native';

export const StatisticsContainer = styled.View`
  padding: 16px;
  background-color: #FFFFFF;
`;

export const StatRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom-width: 1px;
  border-bottom-color: #F0F0F0;
`;

export const StatLabel = styled.Text`
  font-size: 14px;
  color: #333333;
  font-weight: 500;
`;

export const StatValue = styled.Text<{ color?: string }>`
  font-size: 16px;
  font-weight: bold;
  color: ${(props: { color?: string }) => props.color || '#333333'};
`;

export const InsightText = styled.Text`
  font-size: 12px;
  color: #666666;
  line-height: 18px;
  margin-bottom: 4px;
`;

export const MetricCard = styled.View`
  background-color: #F8F9FA;
  padding: 12px;
  border-radius: 8px;
  border-width: 1px;
  border-color: #E9ECEF;
  align-items: center;
`;

export const RangeBar = styled.View`
  flex-direction: row;
  height: 20px;
  border-radius: 4px;
  overflow: hidden;
  border-width: 1px;
  border-color: #E0E0E0;
`;

export const LegendContainer = styled.View`
  padding: 12px;
  background-color: #F8F9FA;
  border-radius: 8px;
  margin: 8px 0;
`;

export const LegendRow = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: 6px;
`;

export const LegendColor = styled.View<{ color: string }>`
  width: 16px;
  height: 16px;
  background-color: ${(props: { color: string }) => props.color};
  border-radius: 2px;
  margin-right: 8px;
`;

export const LegendLabel = styled.Text`
  font-size: 12px;
  color: #333333;
  flex: 1;
`;

export const ChartContainer = styled.View`
  background-color: #FFFFFF;
  border-radius: 8px;
  padding: 12px 8px;  /* Reduced horizontal padding */
  margin: 8px 0;
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.1;
  shadow-radius: 4px;
  elevation: 3;
  align-items: center;
  justify-content: center;
`;

export const ChartTitle = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: #333333;
  text-align: center;
  margin-bottom: 16px;
`;

export const ErrorContainer = styled.View`
  padding: 20px;
  align-items: center;
  justify-content: center;
  background-color: #FFF5F5;
  border-radius: 8px;
  border-width: 1px;
  border-color: #FED7D7;
`;

export const ErrorText = styled.Text`
  color: #E53E3E;
  font-size: 14px;
  text-align: center;
`;

export const WarningContainer = styled.View`
  padding: 12px;
  background-color: #FFFBF0;
  border-radius: 6px;
  border-left-width: 4px;
  border-left-color: #F6AD55;
  margin: 8px 0;
`;

export const WarningText = styled.Text`
  color: #C05621;
  font-size: 12px;
`;

export const LoadingContainer = styled.View`
  padding: 40px;
  align-items: center;
  justify-content: center;
`;

export const LoadingText = styled.Text`
  color: #666666;
  font-size: 14px;
  margin-top: 8px;
`;
