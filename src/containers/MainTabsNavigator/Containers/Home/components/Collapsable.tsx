import React, {useState, useRef, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  Easing,
} from 'react-native';
import styled from 'styled-components/native';
import AntDesign from 'react-native-vector-icons/AntDesign';

const CollapsableContainer = styled.View`
  width: 100%;
  border-bottom-width: 1px;
  border-bottom-color: #ddd;
`;

const TitleContainer = styled.View`
  flex-direction: row;
  align-items: center;
  height: 48px;
  padding: 0 16px;
`;

const TitleText = styled.Text`
  font-size: 18px;
  color: #333;
  flex: 1;
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
  children: React.ReactNode;
}

const openAnimationDuration = 500;
const closeAnimationDuration = 200;
const Collapsable: React.FC<CollapsableProps> = ({title, children}) => {
  const [collapsed, setCollapsed] = useState(true);
  const contentHeight = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const arrowRotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (collapsed) {
      contentHeight.setValue(0);
    } else {
      contentHeight.setValue(200);
    }
  }, [collapsed]);

  useEffect(() => {
    LayoutAnimation.configureNext({
      duration: collapsed ? closeAnimationDuration : openAnimationDuration,
      update: {
        type: LayoutAnimation.Types.easeOut,
      },
    });
  }, [collapsed]);

  useEffect(() => {
    Animated.timing(arrowRotation, {
      toValue: collapsed ? 1 : 0,
      duration: collapsed ? closeAnimationDuration : openAnimationDuration,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
  }, [collapsed, arrowRotation]);

  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: collapsed ? 1 : 0,
      duration: collapsed ? closeAnimationDuration : openAnimationDuration,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
  }, [collapsed, overlayOpacity]);

  return (
    <CollapsableContainer>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setCollapsed(prevCollapsed => !prevCollapsed)}>
        <TitleContainer>
          <TitleText>{title}</TitleText>
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
        </TitleContainer>
      </TouchableOpacity>
      {!collapsed && (
        <ContentContainer style={{height: contentHeight}}>
          {children}
          <ContentOverlay
            style={{
              opacity: overlayOpacity,
            }}
          />
        </ContentContainer>
      )}
    </CollapsableContainer>
  );
};

export default Collapsable;
