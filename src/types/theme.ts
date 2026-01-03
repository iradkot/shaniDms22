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

  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };

  typography: {
    fontFamily: string;
    size: {
      xs: number;
      sm: number;
      md: number;
      lg: number;
      xl: number;
      xxl: number;
    };
    lineHeight: {
      tight: number;
      normal: number;
      relaxed: number;
    };
  };

  determineBgColorByGlucoseValue: (bgValue: number) => string;
  getShadowStyles: (elevation: number, color?: string) => string;

  shadow: {
    default: string;
    small: string;
  };

  /**
   * Semantic colors used across the app.
   *
   * Note: This is intentionally minimal. Add tokens here as design requirements
   * become explicit, rather than hardcoding colors in components.
   */
  colors: {
    insulin: string;
    insulinSecondary: string;
    carbs: string;
    barTrack: string;
  };

  /**
   * Glucose log load bars (IOB/COB) colors.
   */
  loadBars: {
    iob: {
      bolusFill: string;
      autoFill: string;
      track: string;
    };
    cob: {
      fill: string;
      track: string;
    };
  };
};

// Extend the DefaultTheme from styled-components
declare module 'styled-components' {
  export interface DefaultTheme extends ThemeType {}
}
