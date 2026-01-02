export type TooltipPlacement = 'auto' | 'top';

type TooltipPositionArgs = {
  pointX: number;
  pointY: number;
  tooltipWidth: number;
  tooltipHeight: number;
  containerWidth: number;
  containerHeight: number;
  offset: number;
  placement?: TooltipPlacement;
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
  placement = 'auto',
}: TooltipPositionArgs) => {
  const maxX = Math.max(0, containerWidth - tooltipWidth);
  const maxY = Math.max(0, containerHeight - tooltipHeight);

  let tooltipX = clamp(pointX - tooltipWidth / 2, 0, maxX);

  let tooltipY: number;
  if (placement === 'top') {
    tooltipY = clamp(offset, 0, maxY);
  } else {
    tooltipY = pointY - tooltipHeight - offset;
    if (tooltipY < 0) {
      tooltipY = pointY + offset;
    }
    tooltipY = clamp(tooltipY, 0, maxY);
  }

  return {x: tooltipX, y: tooltipY};
};
