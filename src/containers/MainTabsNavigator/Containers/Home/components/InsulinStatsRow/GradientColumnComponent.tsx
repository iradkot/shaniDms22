// GradientColumnComponent.tsx
import React from 'react';
import styled from 'styled-components/native';
import LinearGradient from 'react-native-linear-gradient';
import {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
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

const ValueText = styled.Text<{ theme: ThemeType }>`
    font-size: 16px;
    font-weight: bold;
    color: ${props => props.theme.textColor};
    margin-top: 5px;
`;

const LabelText = styled.Text`
    font-size: 14px;
  color: ${(props: {theme: ThemeType}) => props.theme.white};
    margin-top: 5px;
  font-family: ${(props: {theme: ThemeType}) => props.theme.typography.fontFamily};
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
                                                                         gradientColors,
                                                                         progress,
                                                                       }) => {
  const theme = useTheme() as ThemeType;

  const effectiveGradientColors =
    gradientColors && gradientColors.length
      ? gradientColors
      : [addOpacity(theme.accentColor, 0.9), addOpacity(theme.accentColor, 0.65), addOpacity(theme.accentColor, 0.45)];

  return (
    <GradientColumn colors={effectiveGradientColors}>
      {progress !== undefined ? (
        <AnimatedCircularProgress
          size={60}
          width={5}
          fill={progress}
          tintColor={theme.white}
          backgroundColor={addOpacity(theme.white, 0.3)}
        >
          {() => <ValueText>{value}</ValueText>}
        </AnimatedCircularProgress>
      ) : (
        <>
          {iconName && <Icon name={iconName} size={30} color={theme.white} />}
          <ValueText>{value}</ValueText>
        </>
      )}
      <LabelText>{label}</LabelText>
      {time && <TimeValueText>{time}</TimeValueText>}
    </GradientColumn>
  );
};
