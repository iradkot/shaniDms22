import React, {FC} from 'react';
import LinearGradient from 'react-native-linear-gradient';
import {useSpring} from '@react-spring/native';

import {
  ButtonContainer,
  IconContainer,
} from 'app/containers/MainTabsNavigator/Containers/Home/components/dateNavigatorRow/DateNavigatorRow.style';
import Icon from 'react-native-vector-icons/Ionicons';

/**
 * @type {Boolean} isLoading
 * @description Indicates if the data is loading. This component is used to show a loading animation.
 */
type IsLoading = boolean;

interface RollingFlowerProps {
  /**
   * @type {isLoading}
   */
  isLoading: IsLoading;
}
import {animated} from '@react-spring/native';

const AnimatedIcon = animated(Icon);

const RollingFlower: FC<RollingFlowerProps> = ({isLoading}) => {
  console.log('isLoading', isLoading);
  const {rotate} = useSpring({
    from: {rotate: 0},
    to: {rotate: isLoading ? 1 : 0},
    loop: {reverse: true},
    config: {duration: 1000},
  });

  return (
    <ButtonContainer>
      <LinearGradient
        colors={['#de72c1', '#71de6f', '#333', '#71de6f', '#de72c1']}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 0}}
        style={{borderRadius: 10, padding: 5}}>
        <IconContainer>
          <AnimatedIcon
            name={'ios-flower-outline'}
            size={20}
            color={isLoading ? '#fff' : '#000'}
            style={{
              transform: [{rotate: rotate.to([0, 1], ['0deg', '360deg'])}],
            }}
          />
        </IconContainer>
      </LinearGradient>
    </ButtonContainer>
  );
};

export default React.memo(RollingFlower, (prevProps, nextProps) => {
  return prevProps.isLoading === nextProps.isLoading;
});
