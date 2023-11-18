import React, {FC, useEffect, useRef} from 'react';
import {Animated, Easing} from 'react-native';
import styled, {useTheme} from 'styled-components/native';
import MAIcon from 'react-native-vector-icons/MaterialIcons';
import {theme} from 'app/style/theme';
import {ThemeTypes} from 'app/style/theme.types';

interface RollingFlowerProps {
  isLoading: boolean;
}

const LoadingIcon: FC<RollingFlowerProps> = ({isLoading}) => {
  const appTheme = useTheme() as typeof theme;
  // const [rotation, setRotation] = useState(0);
  const iconRotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(iconRotation, {
      toValue: isLoading ? 0 : 1,
      duration: isLoading ? 50000 : 400,
      useNativeDriver: true,
      easing: Easing[isLoading ? 'in' : 'out'](Easing.ease),
    }).start();
  }, [isLoading, iconRotation]);

  return (
    <GradientContainer>
      <Animated.View
        // @ts-ignore
        style={{
          transform: [
            {
              [isLoading ? 'rotateZ' : 'rotateY']: iconRotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', isLoading ? '360000deg' : '36000deg'],
              }),
            },
          ],
        }}>
        <MAIcon
          name={isLoading ? 'autorenew' : 'check'}
          size={30}
          color={isLoading ? appTheme.accentColor : appTheme.inRangeColor}
        />
      </Animated.View>
    </GradientContainer>
  );
};

const GradientContainer = styled.View<{theme: ThemeTypes}>`
  border-radius: 10px;
  background-color: ${({theme}) => theme.backgroundColor};
  overflow: hidden;
`;

const shouldUpdate = (prevProps: any, nextProps: any) => {
  return prevProps.isLoading === nextProps.isLoading;
};
export default React.memo(LoadingIcon, shouldUpdate);
