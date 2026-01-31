import React from 'react';
import {View} from 'react-native';
import styled, {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

// ─────────────────────────────────────────────────────────────────────────────
// Styled Components
// ─────────────────────────────────────────────────────────────────────────────

const Row = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  align-items: center;
  background-color: ${(p: {theme: ThemeType}) => p.theme.white};
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius}px;
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => p.theme.borderColor};
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  margin-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
`;

const LabelColumn = styled.View`
  flex: 1.2;
`;

const Label = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  font-weight: 600;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
`;

const ValueColumn = styled.View`
  flex: 1;
  align-items: center;
`;

const ColumnHeader = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.5)};
  margin-bottom: 2px;
`;

const Value = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  font-weight: 600;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
`;

const DeltaColumn = styled.View`
  flex: 1;
  align-items: flex-end;
`;

const DeltaBadge = styled.View<{theme: ThemeType; $color: string}>`
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  padding-vertical: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius / 2}px;
  background-color: ${(p: {$color: string}) => addOpacity(p.$color, 0.12)};
`;

const DeltaText = styled.Text<{theme: ThemeType; $color: string}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  font-weight: 700;
  color: ${(p: {$color: string}) => p.$color};
`;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface MetricRowProps {
  label: string;
  beforeValue: string;
  afterValue: string;
  delta: number;
  deltaUnit?: string;
  isPositiveGood?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getDeltaColor(delta: number, isPositiveGood: boolean): string {
  if (Math.abs(delta) < 0.5) return '#8E8E93'; // Neutral gray

  const isPositive = delta > 0;
  const isGood = isPositiveGood ? isPositive : !isPositive;

  return isGood ? '#34C759' : '#FF3B30'; // Green for good, red for bad
}

function formatDelta(delta: number, unit?: string): string {
  const sign = delta > 0 ? '+' : '';
  const formattedValue = Math.abs(delta) < 10 ? delta.toFixed(1) : delta.toFixed(0);
  const suffix = unit ? ` ${unit}` : '';
  return `${sign}${formattedValue}${suffix}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const MetricRow: React.FC<MetricRowProps> = ({
  label,
  beforeValue,
  afterValue,
  delta,
  deltaUnit,
  isPositiveGood = true,
}) => {
  const theme = useTheme() as ThemeType;
  const deltaColor = getDeltaColor(delta, isPositiveGood);

  return (
    <Row>
      <LabelColumn>
        <Label>{label}</Label>
      </LabelColumn>

      <ValueColumn>
        <ColumnHeader>Before</ColumnHeader>
        <Value>{beforeValue}</Value>
      </ValueColumn>

      <ValueColumn>
        <ColumnHeader>After</ColumnHeader>
        <Value>{afterValue}</Value>
      </ValueColumn>

      <DeltaColumn>
        <DeltaBadge $color={deltaColor}>
          <DeltaText $color={deltaColor}>{formatDelta(delta, deltaUnit)}</DeltaText>
        </DeltaBadge>
      </DeltaColumn>
    </Row>
  );
};
