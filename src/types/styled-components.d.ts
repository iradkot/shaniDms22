// Allows styled-components/native to understand DefaultTheme from ThemeType
import 'styled-components/native';
import {ThemeType} from 'app/types/theme';

declare module 'styled-components/native' {
  export interface DefaultTheme extends ThemeType {}
}
