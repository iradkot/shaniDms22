import React, {useContext, useMemo} from 'react';
import {Text} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import {ThemeType} from 'app/types/theme';
import {InsulinDataEntry} from 'app/types/insulin.types';
import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import Tooltip from './Tooltip';
import {GraphStyleContext} from '../../contextStores/GraphStyleContext';
import {getClampedTooltipPosition} from 'app/components/charts/tooltipPosition';
import {getSvgTooltipTextLayout} from 'app/components/charts/svgTooltipLayout';
import SvgTooltipBox from 'app/components/charts/SvgTooltipBox';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';

type Props = {
  x: number;
  y: number;
  bolusEvents: InsulinDataEntry[];
  carbEvents?: Array<FoodItemDTO | formattedFoodItemDTO>;
};

function formatBolusRow(bolus: InsulinDataEntry): string {
  const amount = typeof bolus.amount === 'number' ? bolus.amount : 0;
  const time = bolus.timestamp ? formatDateToLocaleTimeString(bolus.timestamp) : '';
  return `${amount.toFixed(1)}u @ ${time}`;
}

function formatCarbRow(item: FoodItemDTO | formattedFoodItemDTO): string {
  const grams = typeof item.carbs === 'number' ? item.carbs : 0;
  const time = typeof item.timestamp === 'number' ? formatDateToLocaleTimeString(item.timestamp) : '';
  return `${Math.round(grams)}g @ ${time}`;
}

const MultiBolusTooltip: React.FC<Props> = ({x, y, bolusEvents, carbEvents}) => {
  const theme = useTheme() as ThemeType;
  const [{graphWidth, graphHeight}] = useContext(GraphStyleContext);

  const rows = useMemo(() => {
    const header = `Boluses (${bolusEvents.length})`;
    const items = bolusEvents.map(formatBolusRow);
    const carbs = (carbEvents ?? []).filter(i => typeof i.carbs === 'number' && i.carbs > 0);
    const carbRows = carbs.length
      ? [`Carbs (${carbs.length})`, ...carbs.map(formatCarbRow)]
      : [];
    return [header, ...items, ...carbRows];
  }, [bolusEvents, carbEvents]);

  const tooltipWidth = 210;
  const fontSize = theme.typography.size.xs;

  const {textX, rowYs, height: tooltipHeight} = getSvgTooltipTextLayout({
    rows: rows.length,
    fontSize,
    lineHeightMultiplier: theme.typography.lineHeight.normal,
    paddingX: theme.spacing.md,
    paddingY: theme.spacing.sm,
  });

  const {x: tooltipX, y: tooltipY} = getClampedTooltipPosition({
    pointX: x,
    pointY: y,
    tooltipWidth,
    tooltipHeight,
    containerWidth: graphWidth,
    containerHeight: graphHeight,
    offset: theme.spacing.md,
    placement: 'top',
  });

  return (
    <Tooltip x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight}>
      <SvgTooltipBox width={tooltipWidth} height={tooltipHeight} />
      {rows.map((row, idx) => (
        <Text
          key={String(idx)}
          x={textX}
          y={rowYs[idx]}
          fontSize={String(fontSize)}
          fontFamily={theme.typography.fontFamily}
          fill={idx === 0 ? theme.textColor : theme.textColor}
          opacity={idx === 0 ? 0.95 : 0.85}
          textAnchor="start"
        >
          {row}
        </Text>
      ))}
    </Tooltip>
  );
};

export default MultiBolusTooltip;
