import React, {FC} from 'react';
import LinearGradient from 'react-native-linear-gradient';
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

const RollingFlower: FC<RollingFlowerProps> = ({isLoading}) => {
  return (
    <ButtonContainer>
      <LinearGradient
        colors={['#de72c1', '#71de6f', '#333', '#71de6f', '#de72c1']}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 0}}
        style={{borderRadius: 10, padding: 5}}>
        <IconContainer>
          <Icon
            name={`ios-flower-${isLoading ? 'outline' : 'sharp'}`}
            size={20}
            color="#fff"
          />
        </IconContainer>
      </LinearGradient>
    </ButtonContainer>
  );
};

export default RollingFlower;
