import styled from 'styled-components/native';
import {TouchableOpacity} from 'react-native-gesture-handler';

export const DeleteButtonContainer = styled.View`
  position: absolute;
  bottom: 10px;
  left: 5px;
  height: 30px;
  width: 60px;
  z-index: 1;
`;
export const DeleteButton = styled.TouchableOpacity`
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
  padding-left: 8px;
`;

export const DeleteButtonText = styled.Text``;

export const NotificationCardContainer = styled(TouchableOpacity)`
  height: 150px;
  align-items: center;
  position: relative;
  z-index: 1;
  flex-direction: row;
  background-color: #fff;
  border-color: #ccc;
  border-width: 1px;
`;

export const NotificationCardDetails = styled.View`
  flex: 3;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
`;
export const NotificationCardRow = styled.View`
  width: 100%;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;
export const NotificationTitle = styled.Text`
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 4px;
`;
export const NotificationSwitchContainer = styled.View`
  display: flex;
  flex: 1;
  align-items: flex-end;
  justify-content: center;
  padding-right: 10px;
`;
export const NotificationEnableSwitch = styled.Switch``;
export const NotificationCardText = styled.Text`
  font-size: 16px;
  color: #000;
  opacity: 0.7;
`;
