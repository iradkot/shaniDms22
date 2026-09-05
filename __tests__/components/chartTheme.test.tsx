import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Line, Path, Rect} from 'react-native-svg';
import renderer, {act} from 'react-test-renderer';
import {ThemeProvider} from 'styled-components/native';
import {APP_THEME_OPTIONS, getThemeById} from 'app/style/theme';
import type {ThemeType} from 'app/types/theme';
import type {BgSample} from 'app/types/day_bgs.types';
import type {InsulinDataEntry} from 'app/types/insulin.types';
import {getChartPalette} from 'app/components/charts/chartPalette';
import BasalMiniGraph from 'app/components/charts/BasalMiniGraph/BasalMiniGraph';
import BolusMiniGraph from 'app/components/charts/BolusMiniGraph/BolusMiniGraph';
import ActiveInsulinMiniGraph from 'app/components/charts/ActiveInsulinMiniGraph/ActiveInsulinMiniGraph';
import CobMiniGraph from 'app/components/charts/CobMiniGraph/CobMiniGraph';

const SERIES = ['basal', 'bolus', 'iob', 'cob'] as const;
const TITLES = [
  'Basal · U/hr',
  'Bolus · U',
  'Active insulin · U',
  'Active carbs · g',
];
const EMPTY_LABELS = [
  'No basal data',
  'No bolus records in this range',
  'No active insulin data',
  'No active carbs data',
];
const SAMPLE_DATA: BgSample[] = [0, 300_000].map(date => ({
  date,
  sgv: 110,
  dateString: new Date(date).toISOString(),
  trend: 0,
  direction: 'Flat',
  device: 'fixture',
  type: 'sgv',
  iob: 1,
  cob: 10,
}));
const INSULIN_DATA: InsulinDataEntry[] = [
  {
    type: 'tempBasal',
    rate: 0.8,
    duration: 30,
    timestamp: new Date(0).toISOString(),
  },
  {type: 'bolus', amount: 2, timestamp: new Date(300_000).toISOString()},
];
const EMPTY_SAMPLES: BgSample[] = [];
const DOMAIN: [Date, Date] = [new Date(0), new Date(3_600_000)];

const Lanes = ({empty = false}: {empty?: boolean}) => {
  const props = {
    width: 320,
    height: 140,
    bgSamples: empty ? EMPTY_SAMPLES : SAMPLE_DATA,
    xDomain: DOMAIN,
  };
  return (
    <>
      <BasalMiniGraph
        {...props}
        insulinData={empty ? undefined : INSULIN_DATA}
        testID="basal"
      />
      <BolusMiniGraph
        {...props}
        insulinData={empty ? undefined : INSULIN_DATA}
        testID="bolus"
      />
      <ActiveInsulinMiniGraph {...props} testID="iob" />
      <CobMiniGraph {...props} testID="cob" />
    </>
  );
};

const rgba = (color: string) => {
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (hex) {
    return {
      r: parseInt(hex[1]!, 16),
      g: parseInt(hex[2]!, 16),
      b: parseInt(hex[3]!, 16),
      opacity: 1,
    };
  }
  const channels = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(color);
  if (!channels) {
    throw new Error(`Unsupported contrast fixture color: ${color}`);
  }
  return {
    r: Number(channels[1]),
    g: Number(channels[2]),
    b: Number(channels[3]),
    opacity: Number(channels[4]),
  };
};

// Composite translucent text onto its real surface before calculating contrast.
const contrast = (foreground: string, background: string): number => {
  const fg = rgba(foreground);
  const bg = rgba(background);
  const luminance = (channels: number[]) => {
    const linear = channels.map(channel => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  };
  const foregroundLuminance = luminance([
    fg.r * fg.opacity + bg.r * (1 - fg.opacity),
    fg.g * fg.opacity + bg.g * (1 - fg.opacity),
    fg.b * fg.opacity + bg.b * (1 - fg.opacity),
  ]);
  const backgroundLuminance = luminance([bg.r, bg.g, bg.b]);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
};

const textStyle = (tree: renderer.ReactTestRenderer, text: string) => {
  const node = tree.root
    .findAllByType(Text)
    .find(item => item.props.children === text);
  expect(node).toBeDefined();
  return StyleSheet.flatten(node!.props.style);
};

describe('App theme chart contract', () => {
  let tree: renderer.ReactTestRenderer | undefined;
  afterEach(() => {
    if (tree) {
      act(() => tree!.unmount());
      tree = undefined;
    }
  });

  it.each(APP_THEME_OPTIONS)(
    '$id keeps series and normal-size text readable on its own surface',
    ({id}) => {
      const palette = getChartPalette(getThemeById(id));
      expect(new Set(SERIES.map(key => palette[key])).size).toBe(SERIES.length);
      for (const key of [...SERIES, 'text', 'mutedText'] as const) {
        expect(contrast(palette[key], palette.surface)).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    },
  );

  it.each(APP_THEME_OPTIONS)(
    '$id keeps missing-data lanes on the active app surface',
    ({id}) => {
      const theme = getThemeById(id);
      const palette = getChartPalette(theme);
      act(() => {
        tree = renderer.create(
          <ThemeProvider theme={theme}>
            <Lanes empty />
          </ThemeProvider>,
        );
      });
      expect(tree!.root.findAllByType(Svg)).toHaveLength(0);
      const lanes = tree!.root
        .findAllByType(View)
        .filter(node => SERIES.includes(node.props.testID));
      expect(lanes).toHaveLength(4);
      for (const lane of lanes) {
        expect(StyleSheet.flatten(lane.props.style).backgroundColor).toBe(
          theme.white,
        );
      }
      EMPTY_LABELS.forEach(label => {
        const style = textStyle(tree!, label);
        expect(style.color).toBe(palette.mutedText);
        expect(style.fontFamily).toBe(theme.fontFamily);
      });
    },
  );

  it.each(['calmBlue', 'darkFocus'] as const)(
    'updates memoized %s lanes from provider tokens without a dark-mode change',
    id => {
      const original = getThemeById(id);
      const changed: ThemeType = {
        ...original,
        white: '#FAEBD7',
        textColor: '#241B18',
        fontFamily: 'custom-font',
        chart: {
          basal: '#1C4970',
          bolus: '#732254',
          iob: '#175A39',
          cob: '#703A13',
        },
        typography: {
          ...original.typography,
          size: {...original.typography.size, xs: 13, sm: 15},
        },
      };
      const graph = <Lanes />;
      act(() => {
        tree = renderer.create(
          <ThemeProvider theme={original}>{graph}</ThemeProvider>,
        );
      });
      act(() => {
        tree!.update(<ThemeProvider theme={changed}>{graph}</ThemeProvider>);
      });
      const root = tree!.root;
      expect(
        root
          .findAllByType(Line)
          .find(node => node.props.testID === 'basal-tempBasal-segment')!.props
          .stroke,
      ).toBe(changed.chart.basal);
      expect(
        root
          .findAllByType(Rect)
          .find(node => node.props.testID === 'bolus-dose-bar')!.props.fill,
      ).toBe(changed.chart.bolus);
      for (const key of ['iob', 'cob'] as const) {
        expect(
          root
            .findAllByType(Path)
            .find(node => node.props.testID === `${key}-line-segment`)!.props
            .stroke,
        ).toBe(changed.chart[key]);
      }
      TITLES.forEach((title, index) => {
        const style = textStyle(tree!, title);
        expect(style.color).toBe(changed.chart[SERIES[index]!]);
        expect(style.fontFamily).toBe(changed.fontFamily);
        expect(style.fontSize).toBe(changed.typography.size.sm);
      });
      const laneSurfaces = root
        .findAllByType(View)
        .filter(node => SERIES.includes(node.props.testID));
      expect(
        laneSurfaces.every(
          node =>
            StyleSheet.flatten(node.props.style).backgroundColor ===
            changed.white,
        ),
      ).toBe(true);
    },
  );
});
