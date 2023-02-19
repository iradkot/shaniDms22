import {Theme} from 'app/types/theme';
import styled from 'styled-components/native';

export const Container = styled.View<{theme: Theme}>`
  flex: 1;
  background: ${props => props.theme.backgroundColor};
  height: 100%;
  width: 100%;
`;

export const FormInput = styled.TextInput`
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 10px;
  margin: 5px;
`;

export const FormErrorText = styled.Text`
  color: red;
  margin: 10px;
`;
