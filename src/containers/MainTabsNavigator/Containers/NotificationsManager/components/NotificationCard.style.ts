import styled from 'styled-components/native';

export const NotificationCardContainer = styled.View`
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-width: 1px;
  border-color: #ccc;
`;
export const NotificationFirstRow = styled.View`
  width: 100%;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  padding: 10px;
`;
export const NotificationSecondRow = styled.View`
  width: 100%;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
`;
export const NotificationTitle = styled.Text`
  font-size: 18px;
  font-weight: bold;
`;
export const NotificationEnableSwitch = styled.Switch``;
