import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import styled from "styled-components/native";
import LinearGradient from 'react-native-linear-gradient';
import { Theme } from "app/types/theme";

export const SportTypeButton = ({ title, onPress, iconName, isSelected }) => (
  <SportTypeWrapper onPress={onPress} isSelected={isSelected}>
    <LinearGradient
      colors={isSelected ? ['rgba(58, 123, 213, 1)', 'rgba(58, 96, 115, 1)'] : ['rgba(58, 123, 213, 0.7)', 'rgba(58, 96, 115, 0.7)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 10,
        padding: 20,
      }}
    >
      <Icon name={iconName} size={60} color="#fff" />
      <SportTypeText>{title}</SportTypeText>
    </LinearGradient>
  </SportTypeWrapper>
);


const SportTypeWrapper = styled.TouchableOpacity<{ theme: Theme, isSelected: boolean }>`
  flex: 1;
  margin: 10px;
  border-radius: 10px;
  ${({theme, isSelected}) => isSelected && theme.shadow.bright};
`;

const SportTypeText = styled.Text`
  color: #fff;
  font-size: 24px;
  font-weight: bold;
  text-align: center;
`;

export const SportTypesContainer = styled.View`
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  flex-direction: row;
  justify-content: space-around;
  margin-top: 20px;
`;
