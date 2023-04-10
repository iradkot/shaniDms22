import {colors} from 'app/style/colors';
// import {fonts} from 'app/style/fonts';
// import {spacing} from 'app/style/spacing';
// import {typography} from 'app/style/typography';
import {Theme} from 'app/types/theme';
import {Dimensions} from 'react-native';
import {
  determineBgColorByGlucoseValue,
  shadowStyles,
} from 'app/utils/styling.utils';

const {width, height} = Dimensions.get('window');

export const theme: Theme = {
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
};
