import {Platform} from 'react-native';
import {Theme} from 'app/types/theme';

export function shadowStyles(elevation: number, theme: Theme) {
  const shadowTL = Platform.select({
    ios: `shadowColor: ${theme.accentColor}; shadowOffset: {width: 0, height: 2}; shadowOpacity: 0.8; shadowRadius: ${theme.borderRadius}px;`,
    android: `elevation: ${elevation};`,
  });

  return shadowTL || '';
}
