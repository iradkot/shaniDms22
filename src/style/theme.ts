import {colors} from 'app/style/colors';
// import {fonts} from 'app/style/fonts';
// import {spacing} from 'app/style/spacing';
// import {typography} from 'app/style/typography';
import {ThemeType} from 'app/types/theme';
import {Dimensions} from 'react-native';
import {
  addOpacity,
  determineBgColorByGlucoseValue,
  shadowStyles,
} from 'app/style/styling.utils';

const {width, height} = Dimensions.get('window');

// TODO - move all coolors to be under colors key, so instead of inRangeColor or primaryColor, it will be colors.inRange or colors.primary
export const theme: ThemeType = {
  primaryColor: colors.purple[500],
  secondaryColor: colors.gray[200],
  screenHeight: height,
  screenWidth: width,
  tabBarHeight: 50,
  dark: false,
  inRangeColor: colors.green.main,
  belowRangeColor: colors.red.main,
  aboveRangeColor: colors.yellow.main,
  severeBelowRange: colors.red[900],
  severeAboveRange: colors.yellow[800],
  backgroundColor: colors.gray[200],
  textColor: colors.black,
  buttonTextColor: colors.white,
  buttonBackgroundColor: colors.purple[500],
  accentColor: colors.purple[500],
  shadowColor: colors.black,
  white: colors.white,
  black: colors.black,

  colors: {
    insulin: colors.blue[800],
    insulinSecondary: colors.blue[400],
    carbs: colors.orange[800],
    barTrack: addOpacity(colors.black, 0.12),
  },

  dimensions: {
    width,
    height: height,
  },
  borderColor: colors.gray[300],
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
};
