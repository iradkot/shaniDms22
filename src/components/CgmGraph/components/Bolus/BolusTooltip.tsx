import React, {useContext} from 'react';
import {Rect, Text} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import {ThemeType} from 'app/types/theme';
import Tooltip from 'app/components/CgmGraph/components/Tooltips/Tooltip';
import {GraphStyleContext} from 'app/components/CgmGraph/contextStores/GraphStyleContext';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';

type Props = {
  x: number;
  y: number;
  timestamp: Date;
  amount: number;
};

const BolusTooltip: React.FC<Props> = ({x, y, timestamp, amount}) => {
  const theme = useTheme() as ThemeType;
  const [{graphWidth, graphHeight}] = useContext(GraphStyleContext);

  const tooltipWidth = 160;
  const tooltipHeight = 60;

  let tooltipX = x - tooltipWidth / 2;
  let tooltipY = y - tooltipHeight - theme.spacing.sm;

  tooltipX = Math.max(0, Math.min(tooltipX, Math.max(0, graphWidth - tooltipWidth)));
  if (tooltipY < 0) {
    tooltipY = y + theme.spacing.sm;
  }
  tooltipY = Math.max(0, Math.min(tooltipY, Math.max(0, graphHeight - tooltipHeight)));

  return (
    <Tooltip x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight}>
      <Rect
        width={tooltipWidth}
        height={tooltipHeight}
        fill={theme.white}
        stroke={theme.borderColor}
        strokeWidth={1}
        rx={8}
      />
      <Text
        x={16}
        y={22}
        fontSize={String(theme.typography.size.sm)}
        fontFamily={theme.typography.fontFamily}
        fill={theme.textColor}
        textAnchor="start">
        Bolus: {amount.toFixed(1)}u
      </Text>
      <Text
        x={16}
        y={42}
        fontSize={String(theme.typography.size.sm)}
        fontFamily={theme.typography.fontFamily}
        fill={theme.textColor}
        opacity={0.8}
        textAnchor="start">
        Time: {formatDateToLocaleTimeString(timestamp)}
      </Text>
    </Tooltip>
  );
};

export default BolusTooltip;
