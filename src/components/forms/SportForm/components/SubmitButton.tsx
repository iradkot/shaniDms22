import styled from "styled-components/native";


const SubmitButtonContainer = styled.TouchableOpacity`
  background-color: #3f3f3f;
  padding-vertical: 10px;
  padding-horizontal: 20px;
  border-radius: 5px;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
`;

const SubmitButtonText = styled.Text`
  color: white;
  font-size: 18px;
  font-weight: bold;
`;

export const SubmitButton = ({ onPress }: { onPress: () => void }) => {
  return (
    <SubmitButtonContainer onPress={onPress}>
      <SubmitButtonText>Submit</SubmitButtonText>
    </SubmitButtonContainer>
  );
};
