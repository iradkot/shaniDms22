import React from 'react';
import {Text} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import {SportItemDTO} from 'app/types/sport.types';
import styled, {useTheme} from 'styled-components/native';
import {Theme} from 'app/types/theme';
import {theme} from 'app/style/theme';

interface SportItemProps {
  sportItem: SportItemDTO;
}

const SportItem: React.FC<SportItemProps> = ({
  sportItem: {name, durationMinutes, intensity, timestamp},
}) => {
  const appTheme = useTheme() as typeof theme;

  // convert timestamp to readable date format
  const date = new Date(timestamp).toLocaleDateString();

  return (
    <LinearGradient
      style={{
        opacity: 0.95,
        borderRadius: appTheme.borderRadius,
        borderColor: appTheme.white,
        borderWidth: 1,
        marginVertical: appTheme.dimensions.height * 0.015,
      }}
      colors={[appTheme.accentColor, appTheme.white]}
      start={{x: 0, y: 0}}
      end={{x: 1, y: 0}}>
      <Container>
        <Header>
          <HeaderText>{name}</HeaderText>
        </Header>
        <Content>
          <IconContainer>
            <Icon name="time-outline" size={24} color="#FFFFFF" />
          </IconContainer>
          <Text style={{color: '#FFFFFF', fontSize: appTheme.textSize}}>
            {durationMinutes} min
          </Text>
          <IconContainer>
            <Icon name="flame-outline" size={24} color="#FFFFFF" />
          </IconContainer>
          <Text style={{color: '#FFFFFF', fontSize: appTheme.textSize}}>
            {intensity}
          </Text>
          <IconContainer>
            <Icon name="calendar-outline" size={24} color="#FFFFFF" />
          </IconContainer>
          <Text style={{color: '#FFFFFF', fontSize: appTheme.textSize}}>
            {date}
          </Text>
        </Content>
      </Container>
    </LinearGradient>
  );
};

const Container = styled.View<{theme: Theme}>`
  position: relative;
  border-radius: ${props => props.theme.borderRadius}px;
  margin-horizontal: ${props => props.theme.dimensions.width * 0.05}px;
  margin-vertical: ${props => props.theme.dimensions.height * 0.015}px;
  padding-vertical: ${props => props.theme.dimensions.height * 0.025}px;
  padding-horizontal: ${props => props.theme.dimensions.width * 0.05}px;
  opacity: 0.9;
  ${({theme}) => theme.shadow};
`;

const Header = styled.View<{theme: Theme}>`
  margin-bottom: ${props => props.theme.dimensions.height * 0.02}px;
`;

const HeaderText = styled.Text<{theme: Theme}>`
  font-size: ${props => props.theme.textSize * 1.5}px;
  font-weight: bold;
  color: ${props => props.theme.white}
  text-transform: uppercase;
`;

const Content = styled.View<{theme: Theme}>`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-top: ${props => props.theme.dimensions.height * 0.02}px;
`;

const IconContainer = styled.View<{theme: Theme}>`
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: ${props => props.theme.borderRadius * 0.5}px;
  width: ${props => props.theme.dimensions.width * 0.1}px;
  height: ${props => props.theme.dimensions.width * 0.1}px;
  justify-content: center;
  align-items: center;
`;

export default SportItem;
