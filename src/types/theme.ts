// Interface for the styled-components theme object

export interface colors {
  primary: string;
  secondary: string;
  tertiary: string; // tertiary color for text and icons in default card backgrounds
  quaternary: string; // quaternary color for text and icons in selected card backgrounds
}

export interface DetermineBgColorByGlucoseValue {
  (bgValue: number, theme: ThemeType): string;
}

export type ThemeType = {
  primaryColor: string;
  secondaryColor: string;
  tabBarHeight: number;
  screenHeight: number;
  screenWidth: number;
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
  dimensions: {
    width: number;
    height: number;
  };
  fontFamily: string;
  lineHeight: number;
  textSize: number;
  borderRadius: number;
  determineBgColorByGlucoseValue: (bgValue: number) => string;
  getShadowStyles: (elevation: number, color?: string) => string;

  shadow: {
    default: string;
    small: string;
  };
};

// Extend the DefaultTheme from styled-components
declare module 'styled-components' {
  export interface DefaultTheme extends ThemeType {}
}
