// GradientColumnComponent.tsx
import React from 'react';
import styled from 'styled-components/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from 'app/types/theme';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { AnimatedCircularProgress } from 'react-native-circular-progress';

const GradientColumn = styled(LinearGradient)<{ gradientColors: string[] }>`
    flex-direction: column;
    align-items: center;
    padding: 10px;
    height: 100%;
    flex: 1;
    border-radius: 10px;
    margin: 5px;
`;

const ValueText = styled.Text<{ theme: Theme }>`
    font-size: 16px;
    font-weight: bold;
    color: ${props => props.theme.textColor};
    margin-top: 5px;
`;

const LabelText = styled.Text`
    font-size: 14px;
    color: #ffffff;
    margin-top: 5px;
    font-family: 'Helvetica Neue';
    font-weight: 600;
`;

const TimeValueText = styled(ValueText)`
    font-size: 14px;
`;

interface GradientColumnProps {
  label: string;
  value: string;
  time?: string;
  iconName?: string;
  gradientColors?: string[];
  progress?: number; // Value between 0 and 100
}

export const GradientColumnComponent: React.FC<GradientColumnProps> = ({
                                                                         label,
                                                                         value,
                                                                         time,
                                                                         iconName,
                                                                         gradientColors = ['#4c669f', '#3b5998', '#192f6a'],
                                                                         progress,
                                                                       }) => (
  <GradientColumn colors={gradientColors}>
    {progress !== undefined ? (
      <AnimatedCircularProgress
        size={60}
        width={5}
        fill={progress}
        tintColor="#ffffff"
        backgroundColor="rgba(255,255,255,0.3)"
      >
        {() => <ValueText>{value}</ValueText>}
      </AnimatedCircularProgress>
    ) : (
      <>
        {iconName && <Icon name={iconName} size={30} color="#fff" />}
        <ValueText>{value}</ValueText>
      </>
    )}
    <LabelText>{label}</LabelText>
    {time && <TimeValueText>{time}</TimeValueText>}
  </GradientColumn>
);
