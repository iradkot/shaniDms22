import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Easing, TouchableOpacity, View} from 'react-native';
import styled from 'styled-components/native';
import AntDesign from 'react-native-vector-icons/AntDesign';
import {ThemeType} from 'app/types/theme';

const CollapsableContainer = styled.View<{theme: ThemeType}>`
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

const TitleText = styled.Text<{theme: ThemeType}>`
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

const ContentContainer = styled.View``;

interface CollapsableProps {
  title: string;
  initialIsCollapsed?: boolean;
  testID?: string;
  children: React.ReactNode;

  /**
   * If true, keeps children mounted while collapsed (hidden via height/opacity).
   * Default false because keeping mounted can trigger RN layout/clipping glitches
   * in long ScrollViews on Android.
   */
  keepMounted?: boolean;
}

const openAnimationDuration = 500;
const closeAnimationDuration = 200;
const Collapsable: React.FC<CollapsableProps> = ({
  title,
  children,
  initialIsCollapsed = true,
  testID,
  keepMounted = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(initialIsCollapsed);
  const arrowRotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(arrowRotation, {
      toValue: isCollapsed ? 1 : 0,
      duration: isCollapsed ? closeAnimationDuration : openAnimationDuration,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
  }, [isCollapsed, arrowRotation]);

  const shouldRenderChildren = useMemo(() => {
    return keepMounted ? true : !isCollapsed;
  }, [isCollapsed, keepMounted]);

  return (
    <CollapsableContainer>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setIsCollapsed(prevCollapsed => !prevCollapsed)}
        testID={testID}>
        <TitleContainer>
          <TitleText style={{flex: 1}}>
            {title}
          </TitleText>
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
      {shouldRenderChildren ? (
        <ContentContainer
          pointerEvents={isCollapsed ? 'none' : 'auto'}
          style={
            keepMounted
              ? {
                  height: isCollapsed ? 0 : undefined,
                  opacity: isCollapsed ? 0 : 1,
                  overflow: 'hidden',
                }
              : undefined
          }
          collapsable={false}
        >
          {/* Extra wrapper prevents certain flattening/layout edge-cases */}
          <View collapsable={false}>{children}</View>
        </ContentContainer>
      ) : null}
    </CollapsableContainer>
  );
};

export default Collapsable;
