import React from 'react';
import styled from 'styled-components/native';
import LinearGradient from 'react-native-linear-gradient';

const GradientColumn = styled(LinearGradient).attrs(({theme}) => ({
  colors: [
    'rgba(255, 255, 255, 0.1)',
    theme.primaryColor,
    theme.secondaryColor,
  ],
}))`
  flex-direction: column;
  align-items: center;
  padding: 10px;
  height: 100%;
  flex: 1;
  border-radius: 5px;
  margin: 2.5px;
`;

const ValueText = styled.Text<{theme: any}>`
  font-size: 18px;
  font-weight: bold;
  color: ${props => props.theme.textColor};
`;

const LabelText = styled.Text`
  font-size: 16px;
  color: #333;
  margin: 4px 0;
  font-family: 'Courier New';
  font-weight: bold;
`;

const TimeValueText = styled(ValueText)`
  font-size: 16px;
  font-family: 'Courier New';
`;

interface GradientColumnProps {
  label: string;
  value: string;
  time?: string;
}

export const GradientColumnComponent: React.FC<GradientColumnProps> = ({
  label,
  value,
  time,
}) => (
  <GradientColumn>
    <LabelText>{label}</LabelText>
    <ValueText>{value}</ValueText>
    {time && <TimeValueText>{time}</TimeValueText>}
  </GradientColumn>
);
