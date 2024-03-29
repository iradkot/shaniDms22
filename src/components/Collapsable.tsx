import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  LayoutAnimation,
  TouchableOpacity,
} from 'react-native';
import styled from 'styled-components/native';
import AntDesign from 'react-native-vector-icons/AntDesign';
import {useLayout} from '@react-native-community/hooks';
import {Theme} from 'app/types/theme';
import DropShadow from 'react-native-drop-shadow';

const CollapsableContainer = styled.View<{theme: Theme}>`
  width: 100%;
  border-bottom-width: 1px;
  border-bottom-color: #ddd;
  background-color: ${({theme}) => theme.backgroundColor};
`;

const TitleContainer = styled.View`
  flex-direction: row;
  align-items: center;
  height: 48px;
  padding: 0 16px;
`;

const TitleText = styled.Text<{theme: Theme}>`
  font-size: 18px;
  color: #333;
  align-items: center;
  justify-content: center;
`;

const IconContainer = styled.View`
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
`;

const ContentContainer = styled(Animated.View)`
  overflow: hidden;
`;

const ContentOverlay = styled(Animated.View)`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #fff;
`;

interface CollapsableProps {
  title: string;
  initialIsCollapsed?: boolean;
  children: React.ReactNode;
}

const openAnimationDuration = 500;
const closeAnimationDuration = 200;
const Collapsable: React.FC<CollapsableProps> = ({
  title,
  children,
  initialIsCollapsed = true,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(initialIsCollapsed);
  const contentHeight = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const arrowRotation = useRef(new Animated.Value(0)).current;
  // WIP TO MAKE BETTER ANIMATION WITH LAYOUT PROP
  // const {onLayout, ...layout} = useLayout();
  const {onLayout} = useLayout();

  // console.log('layout: ', layout);
  useEffect(() => {
    if (isCollapsed) {
      contentHeight.setValue(0);
    } else {
      contentHeight.setValue(200);
    }
    // eslint-disable-next-line
  }, [isCollapsed]);

  useEffect(() => {
    LayoutAnimation.configureNext({
      duration: isCollapsed ? closeAnimationDuration : openAnimationDuration,
      update: {
        type: LayoutAnimation.Types.easeOut,
      },
    });
  }, [isCollapsed]);

  useEffect(() => {
    Animated.timing(arrowRotation, {
      toValue: isCollapsed ? 1 : 0,
      duration: isCollapsed ? closeAnimationDuration : openAnimationDuration,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
  }, [isCollapsed, arrowRotation]);

  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: isCollapsed ? 1 : 0,
      duration: isCollapsed ? closeAnimationDuration : openAnimationDuration,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
  }, [isCollapsed, overlayOpacity]);

  return (
    <CollapsableContainer>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setIsCollapsed(prevCollapsed => !prevCollapsed)}>
        <TitleContainer>
          <DropShadow
            style={{
              shadowColor: '#000',
              shadowOffset: {
                width: 1,
                height: 1,
              },
              shadowOpacity: 0.2,
              shadowRadius: 1,
              flex: 1,
              height: 48,
              justifyContent: 'center',
            }}>
            <TitleText>{title}</TitleText>
          </DropShadow>
          <DropShadow
            style={{
              shadowColor: '#000',
              shadowOffset: {
                width: 1,
                height: 1,
              },
              shadowOpacity: 0.5,
              shadowRadius: 1,
            }}>
            <IconContainer>
              <Animated.View
                style={{
                  transform: [
                    {
                      rotate: arrowRotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '180deg'],
                      }),
                    },
                  ],
                }}>
                <AntDesign name="up" size={24} color="#333" />
              </Animated.View>
            </IconContainer>
          </DropShadow>
        </TitleContainer>
      </TouchableOpacity>
      {!isCollapsed && (
        <ContentContainer
          // style={{height: contentHeight}}
          pointerEvents="auto"
          onLayout={onLayout}>
          {children}
          <ContentOverlay
            style={{
              opacity: overlayOpacity,
            }}
            pointerEvents={isCollapsed ? 'auto' : 'none'}
          />
        </ContentContainer>
      )}
    </CollapsableContainer>
  );
};

export default Collapsable;
