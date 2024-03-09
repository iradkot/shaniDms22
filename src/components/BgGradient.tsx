import React from 'react';
import {ViewStyle} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {addOpacity} from 'app/utils/styling.utils';

interface BgGradientProps {
  startColor: string;
  endColor: string;
  style?: ViewStyle;
  children?: React.ReactNode; // Explicitly declare children
}

const BgGradient: React.FC<BgGradientProps> = ({
  startColor,
  endColor,
  style,
  children,
}) => {
  return (
    <LinearGradient
      colors={[
        addOpacity(startColor, 0.2),
        addOpacity(startColor, 0.5),
        addOpacity(startColor, 0.9),
        startColor,
        endColor,
        addOpacity(endColor, 0.9),
        addOpacity(endColor, 0.5),
        addOpacity(endColor, 0.2),
      ]}
      locations={[0, 0.02, 0.15, 0.25, 0.75, 0.85, 0.98, 1]}
      start={{x: 0, y: 1}}
      end={{x: 0, y: 0}}
      style={style}>
      {children}
    </LinearGradient>
  );
};

export default BgGradient;
