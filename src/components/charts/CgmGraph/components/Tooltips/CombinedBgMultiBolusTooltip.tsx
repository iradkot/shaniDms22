import React, {useContext, useMemo} from 'react';
import {Text} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import {ThemeType} from 'app/types/theme';
import {BgSample} from 'app/types/day_bgs.types';
import {InsulinDataEntry} from 'app/types/insulin.types';
import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import Tooltip from './Tooltip';
import {GraphStyleContext} from '../../contextStores/GraphStyleContext';
import {getClampedTooltipPosition} from 'app/components/charts/tooltipPosition';
import {getSvgTooltipTextLayout} from 'app/components/charts/svgTooltipLayout';
import SvgTooltipBox from 'app/components/charts/SvgTooltipBox';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import {determineBgColorByGlucoseValue} from 'app/style/styling.utils';

type Props = {
  x: number;
  y: number;
  bgSample: BgSample;
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

const CombinedBgMultiBolusTooltip: React.FC<Props> = ({
  x,
  y,
  bgSample,
  bolusEvents,
  carbEvents,
}) => {
  const theme = useTheme() as ThemeType;
  const [{graphWidth, graphHeight}] = useContext(GraphStyleContext);

  const rows = useMemo(() => {
    const bgRow = `BG: ${bgSample.sgv} mg/dL`;
    const header = `Boluses (${bolusEvents.length})`;
    const bolusRows = bolusEvents.map(formatBolusRow);
    const carbs = (carbEvents ?? []).filter(i => typeof i.carbs === 'number' && i.carbs > 0);
    const carbRows = carbs.length
      ? [`Carbs (${carbs.length})`, ...carbs.map(formatCarbRow)]
      : [];
    const timeRow = `Time: ${formatDateToLocaleTimeString(bgSample.date)}`;
    return [bgRow, header, ...bolusRows, ...carbRows, timeRow];
  }, [bgSample, bolusEvents, carbEvents]);

  const tooltipWidth = 250;
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

  const bgColor = determineBgColorByGlucoseValue(bgSample.sgv, theme);

  return (
    <Tooltip x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight}>
      <SvgTooltipBox width={tooltipWidth} height={tooltipHeight} />

      {rows.map((row, idx) => {
        const isBgRow = idx === 0;
        const isHeader = idx === 1;
        const isFooter = idx === rows.length - 1;

        return (
          <Text
            key={String(idx)}
            x={textX}
            y={rowYs[idx]}
            fontSize={String(fontSize)}
            fontFamily={theme.typography.fontFamily}
            fill={isBgRow ? bgColor : theme.textColor}
            opacity={isHeader ? 0.95 : isFooter ? 0.85 : 0.9}
            textAnchor="start"
          >
            {row}
          </Text>
        );
      })}
    </Tooltip>
  );
};

export default CombinedBgMultiBolusTooltip;
