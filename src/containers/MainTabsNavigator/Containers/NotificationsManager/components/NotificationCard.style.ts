import styled from 'styled-components/native';

export const NotificationCardContainer = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  padding: 10px;
  border-width: 1px;
  border-color: #ccc;
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
