import React from 'react';
import {View} from 'react-native';
import styled, {useTheme} from 'styled-components/native';
import {addOpacity} from 'app/style/styling.utils';
import DropShadow from 'react-native-drop-shadow';

const Card = styled.View<{bg: string; border: string}>`
  flex-direction: row;
  border-radius: 12px;
  overflow: hidden;
  background-color: ${({bg}: {bg: string}) => bg};
  border-width: 1px;
  border-color: ${({border}: {border: string}) => border};
`;

const MetricCol = styled.View<{
  isLast: boolean;
  borderColor: string;
  showDividers: boolean;
}>`
  flex: 1;
  align-items: center;
  padding: 12px 8px;
  border-right-width: ${({isLast, showDividers}: {isLast: boolean; showDividers: boolean}) =>
    !showDividers || isLast ? 0 : 1}px;
  border-right-color: ${({borderColor}: {borderColor: string}) => borderColor};
`;

const Label = styled.Text<{color: string}>`
  font-size: 11px;
  text-align: center;
  margin-bottom: 4px;
  color: ${({color}: {color: string}) => color};
`;

const Value = styled.Text<{color: string}>`
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 2px;
  color: ${({color}: {color: string}) => color};
`;

const Subtle = styled.Text<{color: string}>`
  font-size: 10px;
  text-align: center;
  color: ${({color}: {color: string}) => color};
`;

type Status = 'good' | 'fair' | 'poor';

const getStatusColor = (status: Status, theme: any) => {
  if (status === 'good') return theme.inRangeColor;
  if (status === 'fair') return theme.aboveRangeColor;
  return theme.belowRangeColor;
};

interface KeyMetric {
  label: string;
  value: string;
  status: Status;
  target: string;
}

interface AGPKeyMetricsProps {
  metrics: {
    timeInRange: KeyMetric;
    averageGlucose: KeyMetric;
    gmi: KeyMetric;
    variability: KeyMetric;
  };

  /**
   * Show vertical dividers between metric columns.
   * Defaults to true.
   */
  showDividers?: boolean;
}

const AGPKeyMetrics: React.FC<AGPKeyMetricsProps> = ({metrics, showDividers = true}) => {
  const theme = useTheme();

  const background = theme.white;
  const border = addOpacity(theme.borderColor, 0.9);
  const divider = addOpacity(theme.borderColor, 0.8);
  const labelColor = addOpacity(theme.textColor, 0.75);
  const subtleColor = addOpacity(theme.textColor, 0.6);

  const items = [
    {key: 'timeInRange', label: 'Time in Range'},
    {key: 'averageGlucose', label: 'Avg Glucose'},
    {key: 'gmi', label: 'GMI'},
    {key: 'variability', label: 'Variability'},
  ] as const;

  return (
    <DropShadow
      style={{
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.08,
        shadowRadius: 3,
        elevation: 2,
      }}>
      <Card bg={background} border={border}>
        {items.map((item, index) => {
          const data = metrics[item.key];
          const valueColor = getStatusColor(data.status, theme);
          return (
            <MetricCol
              key={item.key}
              isLast={index === items.length - 1}
              borderColor={divider}
              showDividers={showDividers}
            >
              <Label color={labelColor}>{item.label}</Label>
              <Value color={valueColor}>{data.value}</Value>
              <Subtle color={subtleColor}>{data.target}</Subtle>
            </MetricCol>
          );
        })}
      </Card>
    </DropShadow>
  );
};

export default AGPKeyMetrics;
