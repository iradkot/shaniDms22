// Interface for the styled-components theme object

export interface colors {
  primary: string;
  secondary: string;
  tertiary: string; // tertiary color for text and icons in default card backgrounds
  quaternary: string; // quaternary color for text and icons in selected card backgrounds
}

export interface DetermineBgColorByGlucoseValue {
  (bgValue: number, theme: Theme): string;
}

export type Theme = {
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
  accentColor: string;
  white: string;
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
  getShadowStyles: (elevation: number) => string;

  shadow: {
    default: string;
  };
};
