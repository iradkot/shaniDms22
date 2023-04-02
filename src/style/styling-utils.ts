import {Platform} from 'react-native';

export const shadowStyles = ({ elevation, color, theme }) => {
  const shadowTL = Platform.select({
    ios: `shadowColor: ${color || theme.accentColor}; shadowOffset: {width: 0, height: 2}; shadowOpacity: 0.8; shadowRadius: ${theme.borderRadius}px;`,
    android: `elevation: ${elevation};`,
  });

  return shadowTL || '';
}
