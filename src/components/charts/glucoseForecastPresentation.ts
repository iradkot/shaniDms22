import type {GlucoseForecastSeries} from '../../modules/glucoseForecast';

export type ForecastSeriesId = GlucoseForecastSeries['id'];

/** Color and stroke pattern identify each source in both the plot and legend. */
export const FORECAST_APPEARANCE = {
  loop: {color: '#b47bea', dash: '8 4', symbol: '┄'},
  nightscout: {color: '#e9a342', dash: '2 4', symbol: '┈'},
  personalized: {color: '#41afb9', dash: '10 3 2 3', symbol: '┅'},
  ensemble: {color: '#5399ed', dash: '6 3', symbol: '━'},
} as const;

export const forecastAppearance = (id: ForecastSeriesId, dark: boolean) => ({
  ...FORECAST_APPEARANCE[id],
  color: dark ? FORECAST_APPEARANCE[id].color : {
    loop: '#8250bb', nightscout: '#a86608', personalized: '#167d87', ensemble: '#286bc5',
  }[id],
});

export const forecastSourceLabel = (id: ForecastSeriesId, locale: 'en' | 'he') =>
  ({
    loop: 'Loop',
    nightscout: 'Nightscout',
    personalized: locale === 'he' ? 'אישי' : 'Personal',
    ensemble: locale === 'he' ? 'משולב' : 'Combined',
  })[id];
