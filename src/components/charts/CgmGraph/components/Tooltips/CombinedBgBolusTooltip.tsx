import React, {useContext, useMemo} from 'react';
import {Text} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import {ThemeType} from 'app/types/theme';
import {BgSample} from 'app/types/day_bgs.types';
import {InsulinDataEntry} from 'app/types/insulin.types';
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
  bolusEvent: InsulinDataEntry;
};

const CombinedBgBolusTooltip: React.FC<Props> = ({x, y, bgSample, bolusEvent}) => {
  const theme = useTheme() as ThemeType;
  const [{graphWidth, graphHeight}] = useContext(GraphStyleContext);

  const rows = useMemo(() => {
    const bgRow = `BG: ${bgSample.sgv} mg/dL`;
    const bolusAmt = typeof bolusEvent.amount === 'number' ? bolusEvent.amount : 0;
    const bolusTime = bolusEvent.timestamp
      ? formatDateToLocaleTimeString(bolusEvent.timestamp)
      : '';
    const bolusRow = `Bolus: ${bolusAmt.toFixed(1)}u @ ${bolusTime}`;
    const timeRow = `Time: ${formatDateToLocaleTimeString(bgSample.date)}`;
    return [bgRow, bolusRow, timeRow];
  }, [bgSample, bolusEvent]);

  const tooltipWidth = 240;
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
      <Text
        x={textX}
        y={rowYs[0]}
        fontSize={String(fontSize)}
        fontFamily={theme.typography.fontFamily}
        fill={bgColor}
        textAnchor="start"
      >
        {rows[0]}
      </Text>
      <Text
        x={textX}
        y={rowYs[1]}
        fontSize={String(fontSize)}
        fontFamily={theme.typography.fontFamily}
        fill={theme.textColor}
        opacity={0.9}
        textAnchor="start"
      >
        {rows[1]}
      </Text>
      <Text
        x={textX}
        y={rowYs[2]}
        fontSize={String(fontSize)}
        fontFamily={theme.typography.fontFamily}
        fill={theme.textColor}
        opacity={0.85}
        textAnchor="start"
      >
        {rows[2]}
      </Text>
    </Tooltip>
  );
};

export default CombinedBgBolusTooltip;
