import {colors} from 'app/style/colors';
// import {fonts} from 'app/style/fonts';
// import {spacing} from 'app/style/spacing';
// import {typography} from 'app/style/typography';
import {Theme} from 'app/types/theme';
import {Dimensions} from 'react-native';
import {determineBgColorByGlucoseValue} from 'app/utils/styling.utils';

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
  accentColor: colors.purple[500],
  white: '#ffffff',
  dimensions: {
    width,
    height,
  },
  borderColor: colors.gray[300],
  fontFamily: 'sans-serif',
  lineHeight: 1.5,
  textSize: 16,
  borderRadius: 8,
  get determineBgColorByGlucoseValue() {
    return (bgValue: number) => determineBgColorByGlucoseValue(bgValue, this);
  },
};
