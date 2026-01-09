// GradientColumnComponent.tsx
import React from 'react';
import styled from 'styled-components/native';
import LinearGradient from 'react-native-linear-gradient';
import {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {AnimatedCircularProgress} from 'react-native-circular-progress';

const GradientColumn = styled(LinearGradient)<{gradientColors: string[]; theme: ThemeType}>`
  flex-direction: column;
  align-items: center;
  padding: ${({theme}) => theme.spacing.md}px;
  height: 100%;
  flex: 1;
  border-radius: ${({theme}) => theme.borderRadius + 2}px;
  margin: ${({theme}) => theme.spacing.sm - 3}px;
`;

const ValueText = styled.Text<{theme: ThemeType}>`
  font-size: ${({theme}) => theme.typography.size.md}px;
  font-weight: bold;
  color: ${({theme}) => theme.textColor};
  margin-top: ${({theme}) => theme.spacing.sm - 3}px;
`;

const LabelText = styled.Text<{theme: ThemeType}>`
  font-size: ${({theme}) => theme.typography.size.sm}px;
  color: ${({theme}) => theme.white};
  margin-top: ${({theme}) => theme.spacing.sm - 3}px;
  font-family: ${({theme}) => theme.typography.fontFamily};
  font-weight: 600;
`;

const TimeValueText = styled(ValueText)`
  font-size: ${({theme}) => (theme as ThemeType).typography.size.sm}px;
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
      : [
          addOpacity(theme.accentColor, 0.9),
          addOpacity(theme.accentColor, 0.65),
          addOpacity(theme.accentColor, 0.45),
        ];

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
