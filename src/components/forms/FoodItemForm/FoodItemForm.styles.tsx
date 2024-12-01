import {DefaultTheme} from 'styled-components/native';
import styled from 'styled-components/native';

export const Container = styled.View<{theme: DefaultTheme}>`
  flex: 1;
  background: ${props => props.theme.backgroundColor};
  padding: 20px;
`;

export const FormInput = styled.TextInput<{theme: DefaultTheme}>`
  border: 1px solid ${props => props.theme.borderColor || '#ccc'};
  border-radius: 5px;
  padding: 10px;
  margin: 10px 0;
  background-color: ${props => props.theme.inputBackgroundColor || '#fff'};
  color: ${props => props.theme.inputTextColor || '#000'};
`;

export const FormErrorText = styled.Text<{theme: DefaultTheme}>`
  color: ${props => props.theme.errorColor || 'red'};
  margin: 10px 0;
  font-size: 14px;
`;

export const FormLabel = styled.Text<{theme: DefaultTheme}>`
  font-size: 16px;
  color: ${props => props.theme.labelColor || '#000'};
  margin: 5px 0;
`;

export const ButtonContainer = styled.View`
  margin: 20px 0;
`;

export const SubmitButton = styled.TouchableOpacity<{theme: DefaultTheme}>`
  background-color: ${props => props.theme.buttonBackgroundColor || '#3f51b5'};
  padding: 15px;
  border-radius: 5px;
  align-items: center;
`;

export const SubmitButtonText = styled.Text<{theme: DefaultTheme}>`
  color: ${props => props.theme.buttonTextColor || '#fff'};
  font-size: 16px;
  font-weight: bold;
`;
