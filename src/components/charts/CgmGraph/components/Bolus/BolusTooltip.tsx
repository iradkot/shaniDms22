import React, {useContext} from 'react';
import {Text} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import {ThemeType} from 'app/types/theme';
import Tooltip from 'app/components/charts/CgmGraph/components/Tooltips/Tooltip';
import {GraphStyleContext} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import {getClampedTooltipPosition} from 'app/components/charts/tooltipPosition';
import SvgTooltipBox from 'app/components/charts/SvgTooltipBox';

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

  const {x: tooltipX, y: tooltipY} = getClampedTooltipPosition({
    pointX: x,
    pointY: y,
    tooltipWidth,
    tooltipHeight,
    containerWidth: graphWidth,
    containerHeight: graphHeight,
    offset: theme.spacing.sm,
  });

  return (
    <Tooltip x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight}>
      <SvgTooltipBox width={tooltipWidth} height={tooltipHeight} />
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
