import React, {useMemo} from 'react';
import {Pressable, ViewStyle} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import styled, {useTheme} from 'styled-components/native';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

const FULL_SCREEN_BUTTON_CONSTANTS = {
  iconSize: 22,
  buttonSize: 36,
  hitSlop: {top: 10, bottom: 10, left: 10, right: 10},
} as const;

export type FullScreenButtonProps = {
  onPress: () => void;
  testID?: string;
  style?: ViewStyle;
};

/**
 * Small icon button used to enter fullscreen mode.
 */
const FullScreenButton: React.FC<FullScreenButtonProps> = ({onPress, testID, style}) => {
  const theme = useTheme() as ThemeType;

  const iconColor = useMemo(() => theme.textColor, [theme.textColor]);
  const backgroundColor = useMemo(
    () => addOpacity(theme.white, 0.92),
    [theme.white],
  );
  const borderColor = useMemo(
    () => addOpacity(theme.borderColor, 0.9),
    [theme.borderColor],
  );

  return (
    <Container
      accessibilityRole="button"
      accessibilityLabel="Fullscreen"
      testID={testID}
      onPress={onPress}
      hitSlop={FULL_SCREEN_BUTTON_CONSTANTS.hitSlop}
      style={[
        {
          width: FULL_SCREEN_BUTTON_CONSTANTS.buttonSize,
          height: FULL_SCREEN_BUTTON_CONSTANTS.buttonSize,
          backgroundColor,
          borderColor,
        },
        style,
      ]}>
      <MaterialIcons
        name="fullscreen"
        size={FULL_SCREEN_BUTTON_CONSTANTS.iconSize}
        color={iconColor}
      />
    </Container>
  );
};

const Container = styled(Pressable)`
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border-width: 1px;
  elevation: 4;
`;

export default FullScreenButton;
