import {Pressable} from 'react-native';
import styled from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

export const Row = styled(Pressable)<{theme: ThemeType; $selected?: boolean}>`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-vertical: ${({theme}) => theme.spacing.sm}px;
  padding-horizontal: ${({theme}) => theme.spacing.md}px;
  border-radius: ${({theme}) => theme.borderRadius}px;
  background-color: ${({theme, $selected}) =>
    $selected ? addOpacity(theme.accentColor, 0.12) : 'transparent'};
`;

export const RowLeft = styled.View`
  flex: 1;
  padding-right: 12px;
`;

export const RowTitle = styled.Text<{theme: ThemeType}>`
  font-size: ${({theme}) => theme.typography.size.md}px;
  color: ${({theme}) => theme.textColor};
  font-weight: 600;
`;

export const RowMeta = styled.Text<{theme: ThemeType}>`
  margin-top: 2px;
  font-size: ${({theme}) => theme.typography.size.sm}px;
  color: ${({theme}) => addOpacity(theme.textColor, 0.7)};
`;

export const RowRight = styled.Text<{theme: ThemeType}>`
  font-size: ${({theme}) => theme.typography.size.md}px;
  color: ${({theme}) => theme.textColor};
  font-weight: 700;
`;
