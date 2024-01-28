// noinspection CssInvalidPropertyValue

import styled from 'styled-components/native';
import {TouchableOpacity} from 'react-native';

export const Container = styled.View`
  height: 100px;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  border-radius: 10px;
  background-color: white;
  padding: 10px;
  shadow-color: #000;
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
  ${props => props.active && 'border-radius: 10px;'}
  ${props => props.active && 'margin: 5px;'}
  ${props => props.active && 'padding: 5px;'}
  ${props => props.active && 'box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);'}
  ${props => props.active && 'transition: 0.3s;'}
  ${props => props.active && '&:hover { transform: scale(1.1); }'}
  ${props => !props.active && 'padding-left: 10px;'}
  ${props => !props.active && 'padding-right: 10px;'}
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
  color: #333;
`;

export const DateButton = styled(TouchableOpacity)`
  flex: 4;
  justify-content: center;
`;
