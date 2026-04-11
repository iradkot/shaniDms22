import React from 'react';
import {ViewStyle} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {addOpacity} from 'app/style/styling.utils';

interface BgGradientProps {
  startColor: string;
  endColor: string;
  style?: ViewStyle;
  children?: React.ReactNode;
  useAlphaEdges?: boolean;
}

const BgGradient: React.FC<BgGradientProps> = ({
  startColor,
  endColor,
  style,
  children,
  useAlphaEdges = true,
}) => {
  const colors = useAlphaEdges
    ? [
        addOpacity(startColor, 0.2),
        addOpacity(startColor, 0.5),
        addOpacity(startColor, 0.9),
        startColor,
        endColor,
        addOpacity(endColor, 0.9),
        addOpacity(endColor, 0.5),
        addOpacity(endColor, 0.2),
      ]
    : [startColor, startColor, endColor, endColor];

  const locations = useAlphaEdges
    ? [0, 0.02, 0.15, 0.25, 0.75, 0.85, 0.98, 1]
    : [0, 0.3, 0.7, 1];

  return (
    <LinearGradient
      colors={colors}
      locations={locations}
      start={{x: 0, y: 1}}
      end={{x: 0, y: 0}}
      style={style}>
      {children}
    </LinearGradient>
  );
};

export default BgGradient;
