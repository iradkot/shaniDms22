export type SvgTooltipTextLayoutArgs = {
  rows: number;
  fontSize: number;
  lineHeightMultiplier: number;
  paddingX: number;
  paddingY: number;
};

export const getSvgTooltipTextLayout = ({
  rows,
  fontSize,
  lineHeightMultiplier,
  paddingX,
  paddingY,
}: SvgTooltipTextLayoutArgs) => {
  const lineHeight = Math.round(fontSize * lineHeightMultiplier);
  const firstRowY = paddingY + fontSize;
  const rowYs = Array.from({length: rows}, (_, index) => firstRowY + index * lineHeight);

  // Height must accommodate the last baseline + bottom padding.
  const height = firstRowY + (rows - 1) * lineHeight + paddingY;

  return {
    textX: paddingX,
    rowYs,
    height,
    lineHeight,
  };
};
