import React from 'react';
import styled from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

const Track = styled.View<{theme: ThemeType}>`
  height: 8px;
  width: 100%;
  border-radius: 8px;
  background-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.08)};
  overflow: hidden;
`;

const Fill = styled.View<{theme: ThemeType; $percent: number}>`
  height: 8px;
  width: ${(p: {theme: ThemeType; $percent: number}) => `${Math.round(p.$percent * 100)}%`};
  border-radius: 8px;
  background-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.accentColor, 0.85)};
`;

const Meta = styled.Text<{theme: ThemeType}>`
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.7)};
`;

function fmtInt(n: number): string {
  try {
    return new Intl.NumberFormat().format(n);
  } catch {
    return String(n);
  }
}

export function OracleProgressBar(props: {
  percent: number;
  meta?: string;
}): React.JSX.Element {
  const p = Math.max(0, Math.min(1, props.percent));
  return (
    <>
      <Track>
        <Fill $percent={p} />
      </Track>
      {!!props.meta && <Meta>{props.meta}</Meta>}
    </>
  );
}

export function formatOracleProgressMeta(params: {
  scanned: number;
  total: number;
  matchCount: number;
}): string {
  const {scanned, total, matchCount} = params;
  const pct = total > 0 ? Math.round((scanned / total) * 100) : 100;
  return `${pct}% • scanned ${fmtInt(scanned)}/${fmtInt(total)} • matches ${fmtInt(matchCount)}`;
}
