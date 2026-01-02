type TooltipPositionArgs = {
  pointX: number;
  pointY: number;
  tooltipWidth: number;
  tooltipHeight: number;
  containerWidth: number;
  containerHeight: number;
  offset: number;
};

const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(value, max));
};

export const getClampedTooltipPosition = ({
  pointX,
  pointY,
  tooltipWidth,
  tooltipHeight,
  containerWidth,
  containerHeight,
  offset,
}: TooltipPositionArgs) => {
  const maxX = Math.max(0, containerWidth - tooltipWidth);
  const maxY = Math.max(0, containerHeight - tooltipHeight);

  let tooltipX = pointX - tooltipWidth / 2;
  let tooltipY = pointY - tooltipHeight - offset;

  tooltipX = clamp(tooltipX, 0, maxX);

  if (tooltipY < 0) {
    tooltipY = pointY + offset;
  }

  tooltipY = clamp(tooltipY, 0, maxY);

  return {x: tooltipX, y: tooltipY};
};
