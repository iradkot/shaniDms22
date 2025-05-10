import styled from 'styled-components/native';
import {TouchableOpacity} from 'react-native-gesture-handler';

export const DeleteButtonContainer = styled.View`
  justify-content: center;
  align-items: center;
  margin-left: 8px;
`;
export const DeleteButton = styled.TouchableOpacity`
  height: 40px;
  width: 40px;
  border-radius: 20px;
  background-color: #ffeaea;
  justify-content: center;
  align-items: center;
  elevation: 1;
`;

export const DeleteButtonText = styled.Text``;

export const NotificationCardContainer = styled.View`
  flex-direction: row;
  align-items: stretch;
  background-color: #ffffff;
  border-radius: 12px;
  padding: 14px 10px;
  margin-vertical: 8px;
  margin-horizontal: 4px;
  elevation: 3;
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.08;
  shadow-radius: 4px;
  min-height: 100px;
`;

export const NotificationCardDetails = styled.View`
  flex: 1;
  justify-content: center;
  align-items: flex-start;
  padding-right: 8px;
`;
export const NotificationCardRow = styled.View`
  width: 100%;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
`;
export const NotificationTitle = styled.Text`
  font-size: 20px;
  font-weight: bold;
  color: #333;
  margin-bottom: 6px;
`;
export const NotificationSwitchContainer = styled.View`
  width: 56px;
  justify-content: center;
  align-items: center;
  padding-right: 4px;
`;
export const NotificationEnableSwitch = styled.Switch``;
export const NotificationCardText = styled.Text`
  font-size: 16px;
  color: #555;
`;
