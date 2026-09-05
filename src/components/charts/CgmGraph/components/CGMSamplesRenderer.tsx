import React, {useContext} from 'react';
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

  return data?.length ? (
    <>
      {data.map(d => {
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

        const isFocused = d.dateString === focusedSampleDateString;
        return (
          <G key={d.dateString}>
            <Circle
              cx={x}
              cy={y}
              r={isFocused ? FOCUSED_SAMPLE_RADIUS : SAMPLE_RADIUS}
              stroke={color}
              strokeWidth={1}
              fill={color}
            />
            {isFocused ? (
              <Circle
                cx={x}
                cy={y}
                r={5}
                stroke={color}
                strokeWidth={1.5}
                fill="none"
              />
            ) : null}
          </G>
        );
      })}
    </>
  ) : (
    <></>
  );
};

export default CGMSamplesRenderer;
