import {colors} from 'app/style/colors';
// import {fonts} from 'app/style/fonts';
// import {spacing} from 'app/style/spacing';
// import {typography} from 'app/style/typography';
import {Theme} from 'app/types/theme';
import {Dimensions} from 'react-native';
import {determineBgColorByGlucoseValue} from 'app/utils/styling.utils';
import {shadowStyles} from 'app/style/styling-utils';

const {width, height} = Dimensions.get('window');

export const theme: { screenWidth: number; borderColor: string; readonly shadow: { small: string; default: string }; readonly getShadowStyles: (elevation: number, color: string) => string; belowRangeColor: string; severeAboveRange: string; fontFamily: string; white: string; dark: boolean; tabBarHeight: number; buttonTextColor: string; inRangeColor: string; backgroundColor: string; textSize: number; accentColor: string; screenHeight: number; black: string; textColor: string; aboveRangeColor: string; buttonBackgroundColor: string; borderRadius: number; readonly determineBgColorByGlucoseValue: (bgValue: number) => string; lineHeight: number; severeBelowRange: string; dimensions: { width: number; height: number } } = {
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
  white: colors.white,
  black: colors.black,
  dimensions: {
    width,
    height: height,
  },
  borderColor: colors.gray[300],
  fontFamily: 'sans-serif',
  lineHeight: 1.5,
  textSize: 16,
  borderRadius: 8,
  get determineBgColorByGlucoseValue() {
    return (bgValue: number) => determineBgColorByGlucoseValue(bgValue, this);
  },

  get getShadowStyles() {
    return (elevation: number, color: string) => shadowStyles({ elevation, color, theme: this });
  },

  get shadow() {
    return {
      default: this.getShadowStyles(1),
      small: this.getShadowStyles(0.5),
      dark: this.getShadowStyles(1, colors.black),
      bright: this.getShadowStyles(2, colors.white),
    };
  },
};
