import {colors} from 'app/style/colors';
import {ThemeType} from 'app/types/theme';
import {Dimensions} from 'react-native';
import {
  addOpacity,
  determineBgColorByGlucoseValue,
  shadowStyles,
} from 'app/style/styling.utils';

const {width, height} = Dimensions.get('window');

export type AppThemeId = 'calmBlue' | 'darkFocus' | 'highContrastRisk' | 'sunsetGlow';

export const APP_THEME_OPTIONS: Array<{id: AppThemeId; title: string; description: string}> = [
  {id: 'calmBlue', title: 'Calm Blue', description: 'העיצוב הנוכחי והרגוע'},
  {id: 'darkFocus', title: 'Dark Focus', description: 'מצב כהה עם ניגודיות טובה'},
  {id: 'highContrastRisk', title: 'High-Contrast Risk', description: 'ירוק = טוב, אדום = סיכון'},
  {id: 'sunsetGlow', title: 'Sunset Glow', description: 'עיצוב חם ונעים לעין'},
];

const COMMON_THEME_PART: Omit<
  ThemeType,
  | 'primaryColor'
  | 'secondaryColor'
  | 'dark'
  | 'inRangeColor'
  | 'belowRangeColor'
  | 'aboveRangeColor'
  | 'severeBelowRange'
  | 'severeAboveRange'
  | 'backgroundColor'
  | 'textColor'
  | 'buttonTextColor'
  | 'buttonBackgroundColor'
  | 'accentColor'
  | 'shadowColor'
  | 'white'
  | 'black'
  | 'colors'
  | 'borderColor'
  | 'determineBgColorByGlucoseValue'
  | 'getShadowStyles'
  | 'shadow'
  | 'loadBars'
> = {
  screenHeight: height,
  screenWidth: width,
  tabBarHeight: 50,
  dimensions: {
    width,
    height,
  },
  fontFamily: 'sans-serif',
  lineHeight: 1.5,
  textSize: 16,
  borderRadius: 8,
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  typography: {
    fontFamily: 'sans-serif',
    size: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 20,
      xxl: 24,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
  },
};

const createTheme = (tokens: {
  primaryColor: string;
  secondaryColor: string;
  dark: boolean;
  inRangeColor: string;
  belowRangeColor: string;
  aboveRangeColor: string;
  severeBelowRange: string;
  severeAboveRange: string;
  backgroundColor: string;
  textColor: string;
  buttonTextColor: string;
  buttonBackgroundColor: string;
  accentColor: string;
  shadowColor: string;
  white: string;
  black: string;
  borderColor: string;
  colors: ThemeType['colors'];
  loadBars: ThemeType['loadBars'];
}): ThemeType => ({
  ...COMMON_THEME_PART,
  ...tokens,
  get determineBgColorByGlucoseValue() {
    return (bgValue: number) => determineBgColorByGlucoseValue(bgValue, this);
  },
  get getShadowStyles() {
    return (elevation: number, color?: string) =>
      shadowStyles({elevation, color, theme: this});
  },
  get shadow() {
    return {
      default: this.getShadowStyles(1),
      small: this.getShadowStyles(0.5),
      dark: this.getShadowStyles(1, colors.black),
      bright: this.getShadowStyles(2, colors.white),
    };
  },
});

export const getThemeById = (id: AppThemeId): ThemeType => {
  switch (id) {
    case 'darkFocus':
      return createTheme({
        primaryColor: colors.indigo[400],
        secondaryColor: '#1f2937',
        dark: true,
        inRangeColor: colors.green[400],
        belowRangeColor: colors.orange[400],
        aboveRangeColor: colors.red[400],
        severeBelowRange: colors.orange[600],
        severeAboveRange: colors.red[700],
        backgroundColor: '#111827',
        textColor: '#F9FAFB',
        buttonTextColor: '#111827',
        buttonBackgroundColor: colors.indigo[300],
        accentColor: colors.indigo[300],
        shadowColor: colors.black,
        white: '#1F2937',
        black: '#F9FAFB',
        borderColor: '#374151',
        colors: {
          insulin: colors.cyan[300],
          insulinSecondary: colors.cyan[500],
          carbs: colors.amber[400],
          barTrack: addOpacity('#F9FAFB', 0.14),
        },
        loadBars: {
          iob: {
            bolusFill: colors.cyan[300],
            autoFill: colors.cyan[500],
            track: addOpacity('#F9FAFB', 0.14),
          },
          cob: {
            fill: colors.amber[400],
            track: addOpacity('#F9FAFB', 0.14),
          },
        },
      });
    case 'highContrastRisk':
      return createTheme({
        primaryColor: colors.green[700],
        secondaryColor: '#FFF8F8',
        dark: false,
        inRangeColor: colors.green[700],
        belowRangeColor: colors.red[700],
        aboveRangeColor: colors.red[600],
        severeBelowRange: colors.red[800],
        severeAboveRange: colors.darkRed[800],
        backgroundColor: '#FFF9F9',
        textColor: '#111111',
        buttonTextColor: colors.white,
        buttonBackgroundColor: colors.green[700],
        accentColor: colors.green[700],
        shadowColor: colors.black,
        white: colors.white,
        black: '#111111',
        borderColor: '#F0CFCF',
        colors: {
          insulin: colors.blue[800],
          insulinSecondary: colors.blue[500],
          carbs: colors.orange[800],
          barTrack: addOpacity(colors.black, 0.12),
        },
        loadBars: {
          iob: {
            bolusFill: colors.blue[800],
            autoFill: colors.blue[500],
            track: addOpacity(colors.black, 0.12),
          },
          cob: {
            fill: colors.orange[800],
            track: addOpacity(colors.black, 0.12),
          },
        },
      });
    case 'sunsetGlow':
      return createTheme({
        primaryColor: colors.purple[700],
        secondaryColor: '#FEF6F8',
        dark: false,
        inRangeColor: colors.teal[700],
        belowRangeColor: colors.deepOrange[700],
        aboveRangeColor: colors.pink[600],
        severeBelowRange: colors.deepOrange[800],
        severeAboveRange: colors.pink[700],
        backgroundColor: '#FFF6F1',
        textColor: '#2C1B2C',
        buttonTextColor: colors.white,
        buttonBackgroundColor: colors.purple[700],
        accentColor: colors.purple[700],
        shadowColor: colors.black,
        white: '#FFFDFE',
        black: '#2C1B2C',
        borderColor: '#F0DCE7',
        colors: {
          insulin: colors.purple[700],
          insulinSecondary: colors.indigo[400],
          carbs: colors.deepOrange[700],
          barTrack: addOpacity(colors.black, 0.12),
        },
        loadBars: {
          iob: {
            bolusFill: colors.purple[700],
            autoFill: colors.indigo[400],
            track: addOpacity(colors.black, 0.12),
          },
          cob: {
            fill: colors.deepOrange[700],
            track: addOpacity(colors.black, 0.12),
          },
        },
      });
    case 'calmBlue':
    default:
      return createTheme({
        primaryColor: colors.blue[700],
        secondaryColor: colors.gray[200],
        dark: false,
        inRangeColor: colors.blue[700],
        belowRangeColor: colors.blue[400],
        aboveRangeColor: colors.gray[500],
        severeBelowRange: colors.blue[300],
        severeAboveRange: colors.gray[700],
        backgroundColor: colors.gray[200],
        textColor: colors.black,
        buttonTextColor: colors.white,
        buttonBackgroundColor: colors.blue[700],
        accentColor: colors.blue[700],
        shadowColor: colors.black,
        white: colors.white,
        black: colors.black,
        borderColor: colors.gray[300],
        colors: {
          insulin: colors.blue[800],
          insulinSecondary: colors.blue[400],
          carbs: colors.orange[800],
          barTrack: addOpacity(colors.black, 0.12),
        },
        loadBars: {
          iob: {
            bolusFill: colors.blue[800],
            autoFill: colors.blue[400],
            track: addOpacity(colors.black, 0.12),
          },
          cob: {
            fill: colors.orange[800],
            track: addOpacity(colors.black, 0.12),
          },
        },
      });
  }
};

export const theme: ThemeType = getThemeById('calmBlue');

export const applyThemeToSingleton = (id: AppThemeId): ThemeType => {
  const next = getThemeById(id);
  Object.assign(theme, next);
  theme.colors = {...next.colors};
  theme.loadBars = {
    iob: {...next.loadBars.iob},
    cob: {...next.loadBars.cob},
  };
  return theme;
};
