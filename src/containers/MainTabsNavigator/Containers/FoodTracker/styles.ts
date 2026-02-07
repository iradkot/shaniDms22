import styled from 'styled-components/native';
import {ThemeType} from 'app/types/theme';

/* ── Screen-level ─────────────────────────────────── */

export const Container = styled.SafeAreaView<{theme: ThemeType}>`
  flex: 1;
  background-color: ${({theme}) => theme.backgroundColor};
`;

export const Header = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
`;

export const HeaderTitle = styled.Text<{theme: ThemeType}>`
  font-size: 20px;
  font-weight: 700;
  color: ${({theme}) => theme.textColor};
`;

/* ── Week navigator ───────────────────────────────── */

export const WeekNav = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding: 4px 16px 8px;
  gap: 12px;
`;

export const WeekLabel = styled.Text<{theme: ThemeType}>`
  font-size: 14px;
  color: ${({theme}) => theme.textColor};
  min-width: 150px;
  text-align: center;
`;

export const NavButton = styled.TouchableOpacity`
  padding: 6px;
`;

/* ── Filters row ──────────────────────────────────── */

export const FiltersRow = styled.View`
  flex-direction: row;
  align-items: center;
  padding: 0 16px 8px;
  gap: 8px;
`;

export const FilterChip = styled.TouchableOpacity<{
  active: boolean;
  theme: ThemeType;
}>`
  padding: 6px 14px;
  border-radius: 16px;
  background-color: ${({active, theme}) =>
    active ? theme.accentColor : theme.secondaryColor};
`;

export const FilterChipText = styled.Text<{
  active: boolean;
  theme: ThemeType;
}>`
  font-size: 13px;
  font-weight: 600;
  color: ${({active, theme}) =>
    active ? theme.buttonTextColor : theme.textColor};
`;

/* ── Table header ─────────────────────────────────── */

export const TableHeader = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  align-items: center;
  padding: 8px 12px;
  border-bottom-width: 1px;
  border-bottom-color: ${({theme}) => theme.borderColor};
  background-color: ${({theme}) => theme.backgroundColor};
`;

export const HeaderCell = styled.TouchableOpacity<{flex?: number}>`
  flex: ${({flex}) => flex ?? 1};
  flex-direction: row;
  align-items: center;
  gap: 2px;
`;

export const HeaderCellText = styled.Text<{theme: ThemeType}>`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: ${({theme}) => theme.textColor};
  opacity: 0.6;
`;

/* ── Meal row ─────────────────────────────────────── */

export const RowContainer = styled.TouchableOpacity<{theme: ThemeType}>`
  flex-direction: row;
  align-items: center;
  padding: 10px 12px;
  border-bottom-width: 0.5px;
  border-bottom-color: ${({theme}) => theme.borderColor};
`;

export const RowCell = styled.View<{flex?: number}>`
  flex: ${({flex}) => flex ?? 1};
  flex-direction: row;
  align-items: center;
`;

export const CellText = styled.Text<{theme: ThemeType}>`
  font-size: 13px;
  color: ${({theme}) => theme.textColor};
`;

export const CellTextBold = styled(CellText)`
  font-weight: 700;
`;

export const CellTextMuted = styled.Text<{theme: ThemeType}>`
  font-size: 12px;
  color: ${({theme}) => theme.textColor};
  opacity: 0.5;
`;

/* ── Chart expander ───────────────────────────────── */

export const ChartExpanderContainer = styled.View<{theme: ThemeType}>`
  padding: 8px 0 16px;
  border-bottom-width: 1px;
  border-bottom-color: ${({theme}) => theme.borderColor};
  background-color: ${({theme}) => theme.backgroundColor};
`;

/* ── Empty state ──────────────────────────────────── */

export const EmptyContainer = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
`;

export const EmptyText = styled.Text<{theme: ThemeType}>`
  font-size: 16px;
  color: ${({theme}) => theme.textColor};
  opacity: 0.5;
  text-align: center;
  margin-top: 12px;
`;

/* ── Summary strip ────────────────────────────────── */

export const SummaryRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-around;
  padding: 10px 16px;
  gap: 8px;
`;

export const SummaryItem = styled.View`
  align-items: center;
`;

export const SummaryValue = styled.Text<{theme: ThemeType}>`
  font-size: 18px;
  font-weight: 700;
  color: ${({theme}) => theme.accentColor};
`;

export const SummaryLabel = styled.Text<{theme: ThemeType}>`
  font-size: 11px;
  color: ${({theme}) => theme.textColor};
  opacity: 0.5;
  margin-top: 2px;
`;
