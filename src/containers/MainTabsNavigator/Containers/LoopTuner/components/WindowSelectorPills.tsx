import React from 'react';
import {Pressable} from 'react-native';
import styled, {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

// ─────────────────────────────────────────────────────────────────────────────
// Styled Components
// ─────────────────────────────────────────────────────────────────────────────

const Container = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  background-color: ${(p: {theme: ThemeType}) => p.theme.white};
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius}px;
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => p.theme.borderColor};
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
  margin-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
`;

const Pill = styled(Pressable)<{theme: ThemeType; $active: boolean}>`
  flex: 1;
  padding-vertical: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  padding-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius - 2}px;
  align-items: center;
  justify-content: center;
  background-color: ${(p: {theme: ThemeType; $active: boolean}) =>
    p.$active ? addOpacity(p.theme.accentColor, 0.15) : 'transparent'};
`;

const PillText = styled.Text<{theme: ThemeType; $active: boolean}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  font-weight: ${(p: {$active: boolean}) => (p.$active ? '700' : '500')};
  color: ${(p: {theme: ThemeType; $active: boolean}) =>
    p.$active ? p.theme.accentColor : addOpacity(p.theme.textColor, 0.7)};
`;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface WindowSelectorPillsProps<T extends number> {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function WindowSelectorPills<T extends number>({
  options,
  selected,
  onSelect,
}: WindowSelectorPillsProps<T>): React.ReactElement {
  const theme = useTheme() as ThemeType;

  return (
    <Container>
      {options.map((option) => (
        <Pill
          key={option}
          $active={option === selected}
          onPress={() => onSelect(option)}
        >
          <PillText $active={option === selected}>
            {option} days
          </PillText>
        </Pill>
      ))}
    </Container>
  );
}
