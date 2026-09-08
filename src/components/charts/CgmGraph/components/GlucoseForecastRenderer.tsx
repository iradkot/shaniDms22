import React, {useContext} from 'react';
import {G, Line, Path} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import type {GlucoseForecastSnapshot} from '../../../../modules/glucoseForecast';
import {forecastAppearance} from '../../glucoseForecastPresentation';
import {GraphStyleContext} from '../contextStores/GraphStyleContext';

/** Predictions have their own layer and never become observed CGM samples. */
export const GlucoseForecastRenderer = ({
  forecast,
}: {
  readonly forecast: GlucoseForecastSnapshot;
}) => {
  const [{xScale, yScale, graphHeight}] = useContext(GraphStyleContext);
  const theme = useTheme();
  const anchor = forecast.history.find(
    point => point.ts === forecast.glucoseTimestampMs,
  );
  return (
    <G testID="glucose-forecast-layer">
      <Line
        x1={xScale(new Date(forecast.glucoseTimestampMs))}
        x2={xScale(new Date(forecast.glucoseTimestampMs))}
        y1={0}
        y2={graphHeight}
        stroke={forecastAppearance('ensemble', theme.dark).color}
        strokeOpacity={0.45}
        strokeDasharray="3 5"
      />
      {[...forecast.series]
        .sort((left, right) => Number(left.id === 'ensemble') - Number(right.id === 'ensemble'))
        .map(series => {
          const appearance = forecastAppearance(series.id, theme.dark);
          const points = series.points.filter(
            point => Number.isFinite(point.ts) && Number.isFinite(point.sgv),
          );
          if (points.length === 0) {
            return null;
          }
          const path = (anchor ? [anchor, ...points] : points)
            .map((point, index) =>
              `${index === 0 ? 'M' : 'L'}${xScale(new Date(point.ts))},${yScale(point.sgv)}`,
            )
            .join(' ');
          const bounded = points.filter(
            point => point.lower !== undefined && point.upper !== undefined &&
              Number.isFinite(point.lower) && Number.isFinite(point.upper),
          );
          const band = bounded.length < 2 ? undefined : [
            ...bounded.map((point, index) =>
              `${index === 0 ? 'M' : 'L'}${xScale(new Date(point.ts))},${yScale(point.upper!)}`),
            ...[...bounded].reverse().map(point =>
              `L${xScale(new Date(point.ts))},${yScale(point.lower!)}`),
            'Z',
          ].join(' ');
          return (
            <G key={series.id}>
              {band ? (
                <Path
                  testID={`glucose-forecast-band-${series.id}`}
                  d={band}
                  fill={appearance.color}
                  fillOpacity={series.id === 'ensemble' ? 0.15 : 0.06}
                  stroke="none"
                />
              ) : null}
              <Path
                testID={`glucose-forecast-line-${series.id}`}
                d={path}
                fill="none"
                stroke={appearance.color}
                strokeWidth={series.id === 'ensemble' ? 3 : 1.7}
                strokeDasharray={appearance.dash}
              />
            </G>
          );
        })}
    </G>
  );
};
