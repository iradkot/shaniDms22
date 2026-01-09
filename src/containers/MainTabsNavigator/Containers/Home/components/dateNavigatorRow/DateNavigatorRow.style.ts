// noinspection CssInvalidPropertyValue

import styled from 'styled-components/native';
import {TouchableOpacity} from 'react-native';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

export const Container = styled.View`
  height: 82px;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  border-radius: ${({theme}: {theme: ThemeType}) => theme.spacing.sm + 2}px;
  background-color: ${({theme}: {theme: ThemeType}) => theme.white};
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.xs + 2}px;
  shadow-color: ${({theme}: {theme: ThemeType}) => theme.shadowColor};
  shadow-offset: 0px 4px;
  shadow-opacity: 0.3;
  shadow-radius: 4;
  elevation: 2;
`;

export const ButtonContainer = styled(TouchableOpacity).attrs({
  activeOpacity: 0.7,
})<{
  disabled?: boolean;
  active?: boolean;
  flex?: number;
  width?: number;
}>`
  justify-content: center;
  align-items: center;
  ${props => (props.flex ? `flex: ${props.flex}` : 'flex: 1')};
  ${props => props.disabled && 'opacity: 0.5;'}
  ${props =>
    props.active &&
    `border-radius: ${(props.theme as ThemeType).spacing.sm + 2}px;`}
  ${props =>
    props.active &&
    `margin: ${(props.theme as ThemeType).spacing.xs - 1}px;`}
  ${props =>
    props.active &&
    `padding: ${(props.theme as ThemeType).spacing.xs - 1}px;`}
  ${props =>
    !props.active &&
    `padding-left: ${(props.theme as ThemeType).spacing.sm - 2}px;`}
  ${props =>
    !props.active &&
    `padding-right: ${(props.theme as ThemeType).spacing.sm - 2}px;`}
`;

export const IconContainer = styled.View`
  width: 30px;
  border-radius: 15px;
  justify-content: center;
  align-items: center;
`;

export const DateText = styled.Text`
  text-align: center;
  font-size: 18px;
  font-weight: bold;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.9)};
`;

export const DateButton = styled(TouchableOpacity)`
  flex: 4;
  justify-content: center;
`;
