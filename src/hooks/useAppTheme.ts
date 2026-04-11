import {useTheme as useStyledTheme} from 'styled-components/native';
import {theme as fallbackTheme} from 'app/style/theme';
import {ThemeType} from 'app/types/theme';

export const useAppTheme = (): ThemeType => {
  const themed = useStyledTheme() as ThemeType | undefined;
  return themed || fallbackTheme;
};
