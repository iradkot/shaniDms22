import React from 'react';
import {Animated, Text, View} from 'react-native';
import { Ionicons as Icon } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {SportItemDTO} from 'app/types/sport.types';
import styled, {useTheme} from 'styled-components/native';
import {Theme} from 'app/types/theme';
import {theme} from 'app/style/theme';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors} from 'app/style/colors';
import {
  formatDateToDateAndTimeString,
  formatDateToLocaleTimeString,
  getTimeInMinutes,
} from 'app/utils/datetime.utils';
import DigitalClock from 'app/components/DigitalClock';

interface SportItemProps {
  sportItem: SportItemDTO;
  y: Animated.Value;
  index: number;
}

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

const SportItem: React.FC<SportItemProps> = ({
  sportItem: {name, intensity, startTimestamp, endTimestamp},
  y,
  index,
}) => {
  const appTheme = useTheme() as typeof theme;
  const {height} = appTheme.dimensions;
  const insets = useSafeAreaInsets();

  // const availableHeight = height - appTheme.tabBarHeight - insets.top - insets.bottom;
  const availableHeight = height;
  const CARD_AREA = availableHeight * 0.135;
  const position = Animated.subtract(index * CARD_AREA, y);
  const isDisappearing = -CARD_AREA;
  const isTop = 0;
  const isBottom = availableHeight - CARD_AREA;
  const isAppearing = availableHeight;
  const translateY = Animated.add(
    y,
    y.interpolate({
      inputRange: [0, index * CARD_AREA],
      outputRange: [0, -index * CARD_AREA],
      extrapolateRight: 'clamp',
    }),
  );
  const scale = position.interpolate({
    inputRange: [isDisappearing, isTop, isBottom, isAppearing],
    outputRange: [0.7, 1, 1, 0.8],
    extrapolate: 'clamp',
  });
  const rotate = position.interpolate({
    inputRange: [isDisappearing, isTop, isBottom, isAppearing],
    outputRange: ['-10deg', '0deg', '0deg', '10deg'],
    extrapolate: 'clamp',
  });

  // convert startTimestamp to readable date format
  const date = new Date(startTimestamp).toLocaleDateString();

  return (
    <AnimatedLinearGradient
      style={{
        borderRadius: appTheme.borderRadius,
        borderColor: appTheme.white,
        borderWidth: 1,
        // marginVertical: appTheme.dimensions.height * 0.015,
        // opacity,
        transform: [{translateY}, {scale}, {rotate}],
      }}
      colors={[
        appTheme.accentColor,
        colors.purple['300'],
        'rgba(255, 255, 255, 0.8)',
        'rgba(255, 255, 255, 0.6)',
      ]}
      start={{x: 0, y: 0}}
      end={{x: 1, y: 0}}>
      <Container>
        <Header>
          <HeaderText>{name}</HeaderText>
        </Header>
        <Content>
          <TimeWrapper>
            <TimeItem>
              <IconContainer>
                <Icon name="time-outline" size={24} color="#FFFFFF" />
              </IconContainer>
              <Text style={{color: '#FFFFFF', fontSize: appTheme.textSize}}>
                Start: {formatDateToLocaleTimeString(startTimestamp)}
              </Text>
            </TimeItem>
            <TimeItem>
              <IconContainer>
                <Icon name="time-outline" size={24} color="#FFFFFF" />
              </IconContainer>
              <Text style={{color: '#FFFFFF', fontSize: appTheme.textSize}}>
                End: {formatDateToLocaleTimeString(endTimestamp)}
              </Text>
            </TimeItem>
          </TimeWrapper>
          <InfoWrapper>
            <IconContainer>
              <Icon name="flame-outline" size={24} color="#FFFFFF" />
            </IconContainer>
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: appTheme.textSize,
                fontWeight: 'bold',
              }}>
              {intensity}
            </Text>
            <IconContainer>
              <Icon name="calendar-outline" size={24} color="#FFFFFF" />
            </IconContainer>
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: appTheme.textSize,
                fontWeight: 'bold',
              }}>
              Duration -{' '}
              {getTimeInMinutes(new Date(endTimestamp - startTimestamp))}
              Minutes
            </Text>
          </InfoWrapper>
        </Content>
      </Container>
    </AnimatedLinearGradient>
  );
};

const Container = styled(Animated.View)<{theme: Theme}>`
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

const IconContainer = styled.View<{theme: Theme}>`
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: ${props => props.theme.borderRadius * 0.5}px;
  width: ${props => props.theme.dimensions.width * 0.1}px;
  height: ${props => props.theme.dimensions.width * 0.1}px;
  justify-content: center;
  align-items: center;
  margin-right: ${props => props.theme.dimensions.width * 0.025}px;
`;

const Content = styled.View<{theme: Theme}>`
  flex-direction: column;
  margin-top: ${props => props.theme.dimensions.height * 0.02}px;
`;

const TimeWrapper = styled.View<{theme: Theme}>`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${props => props.theme.dimensions.height * 0.01}px;
`;

const TimeItem = styled.View<{theme: Theme}>`
  flex-direction: row;
  align-items: center;
`;

const InfoWrapper = styled.View<{theme: Theme}>`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

export default SportItem;
