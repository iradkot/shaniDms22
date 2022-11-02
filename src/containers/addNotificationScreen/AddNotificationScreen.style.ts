import styled from 'styled-components/native';

export const AddNotificationScreenContainer = styled.ScrollView`
  flex: 1;
  background-color: #fff;
`;

export const AddNotificationScreenTitle = styled.Text`
  font-size: 20px;
  font-weight: bold;
  margin: 10px;
`;

export const AddNotificationScreenInput = styled.TextInput.attrs({
  selectTextOnFocus: true,
})`
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 10px;
  margin: 10px;
`;

export const AddNotificationScreenSwitch = styled.Switch`
  margin: 10px;
`;

export const AddNotificationScreenButton = styled.TouchableOpacity`
  background-color: #ccc;
  padding: 10px;
  margin: 10px;
  border-radius: 5px;
`;

export const AddNotificationScreenText = styled.Text`
  font-size: 18px;
`;
export const AddNotificationScreenButtonText = styled(
  AddNotificationScreenText,
)`
  text-align: center;
`;
export const AddNotificationScreenInputLabel = styled(
  AddNotificationScreenText,
)`
  margin-left: 10px;
`;
