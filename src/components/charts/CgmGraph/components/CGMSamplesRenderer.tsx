import React, {useContext, useMemo} from 'react';
import {Circle, G} from 'react-native-svg';
import {xAccessor, yAccessor} from 'app/components/charts/CgmGraph/utils';
import {glucoseChartColor} from '../../chartPalette';
import {useTheme} from 'styled-components/native';
import type {ThemeType} from 'app/types/theme';
import {GraphStyleContext} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';
const SAMPLE_RADIUS = 2;
const FOCUSED_SAMPLE_RADIUS = 3;

type Props = {
  focusedSampleDateString?: string | undefined;
};

const CGMSamplesRenderer: React.FC<Props> = ({focusedSampleDateString}) => {
  const [{xScale, yScale, bgSamples: data}] = useContext(GraphStyleContext);
  const theme = useTheme() as ThemeType;
  // Data geometry is independent of the finger. Retaining these elements also
  // lets React skip reconciling every native SVG circle on each cursor update.
  const {marks, pointsByDate} = useMemo(() => {
    const points = new Map<string, {x: number; y: number; color: string}>();
    const elements = data.map(d => {
      if (
        !d ||
        !Number.isFinite(d.date) ||
        !Number.isFinite(d.sgv) ||
        d.sgv <= 0
      ) {
        return null;
      }
      const x = xScale(xAccessor(d));
      const y = yScale(yAccessor(d));
      const color = glucoseChartColor(yAccessor(d), theme);

      points.set(d.dateString, {x, y, color});
      return (
        <Circle
          key={d.dateString}
          cx={x}
          cy={y}
          r={SAMPLE_RADIUS}
          stroke={color}
          strokeWidth={1}
          fill={color}
        />
      );
    });
    return {marks: elements, pointsByDate: points};
  }, [data, xScale, yScale, theme]);
  const focused = focusedSampleDateString
    ? pointsByDate.get(focusedSampleDateString)
    : undefined;
  return (
    <>
      {marks}
      {focused ? (
        <G>
          <Circle
            cx={focused.x}
            cy={focused.y}
            r={FOCUSED_SAMPLE_RADIUS}
            stroke={focused.color}
            strokeWidth={1}
            fill="none"
          />
          <Circle
            cx={focused.x}
            cy={focused.y}
            r={5}
            stroke={focused.color}
            strokeWidth={1.5}
            fill="none"
          />
        </G>
      ) : null}
    </>
  );
};

export default React.memo(CGMSamplesRenderer);
