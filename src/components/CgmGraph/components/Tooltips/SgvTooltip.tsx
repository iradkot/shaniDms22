// SgvTooltip.tsx
import {BgSample} from 'app/types/day_bgs.types';
import React from 'react';
import {G, Rect, Text} from 'react-native-svg';
import Tooltip from './Tooltip';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';

interface SgvTooltipProps {
  x: number;
  y: number;
  bgSample: BgSample;
}

const SgvTooltip: React.FC<SgvTooltipProps> = ({x, y, bgSample}) => {
  const textMargin = 10; // Margin for the text
  const lineHeight = 14; // Line height for the text
  const tooltipWidth = 150; // Tooltip width

  // Calculate the x position of the tooltip
  let tooltipX = x - tooltipWidth / 2;

  // If the tooltip is too close to the left edge of the screen, adjust its position
  if (tooltipX < 0) {
    tooltipX = tooltipWidth / 2;
  }

  return (
    <Tooltip x={tooltipX} y={y}>
      <Rect
        width={tooltipWidth}
        height={60}
        fill="lightblue"
        stroke="darkblue"
        strokeWidth={2}
      />
      <Text
        x={20} // Position the key text
        y={textMargin + lineHeight} // Position the text with the margin and line height
        fontSize={14}
        fill="darkblue"
        textAnchor="start">
        BG:
      </Text>
      <Text
        x={60} // Position the value text
        y={textMargin + lineHeight} // Position the text with the margin and line height
        fontSize={14}
        fill="darkblue"
        textAnchor="start">
        {bgSample.sgv} mg/dL
      </Text>
      <Text
        x={20} // Position the key text
        y={textMargin + lineHeight * 2} // Position the text below the first text
        fontSize={12}
        fill="darkblue"
        textAnchor="start">
        Time:
      </Text>
      <Text
        x={60} // Position the value text
        y={textMargin + lineHeight * 2} // Position the text below the first text
        fontSize={12}
        fill="darkblue"
        textAnchor="start">
        {formatDateToLocaleTimeString(bgSample.date)}
      </Text>
    </Tooltip>
  );
};

export default SgvTooltip;
