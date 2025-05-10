import styled from 'styled-components/native';

import { Platform } from 'react-native';
export const AddNotificationScreenContainer = styled.KeyboardAvoidingView.attrs({
  behavior: Platform.OS === 'ios' ? 'padding' : undefined,
  enabled: true,
})`
  flex: 1;
  background-color: #f7f8fa;
`;

export const AddNotificationScreenTitle = styled.Text`
  font-size: 24px;
  font-weight: bold;
  color: #222;
  margin: 24px 0 16px 0;
  text-align: center;
`;

export const AddNotificationScreenButton = styled.TouchableOpacity`
  background-color: #4a90e2;
  padding: 14px 0;
  margin: 24px 16px 0 16px;
  border-radius: 8px;
  align-items: center;
  shadow-color: #000;
  shadow-opacity: 0.08;
  shadow-radius: 4px;
  elevation: 2;
`;

export const AddNotificationScreenText = styled.Text`
  font-size: 18px;
  color: #222;
`;
export const AddNotificationScreenButtonText = styled(
  AddNotificationScreenText,
)`
  color: #fff;
  font-weight: 600;
  text-align: center;
`;
