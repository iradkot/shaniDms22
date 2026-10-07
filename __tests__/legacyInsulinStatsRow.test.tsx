import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {ThemeProvider} from 'styled-components/native';
import {InsulinStatsRow} from 'app/containers/MainTabsNavigator/Containers/Home/components/InsulinStatsRow/InsulinStatsRow';
import {GradientColumnComponent} from 'app/containers/MainTabsNavigator/Containers/Home/components/InsulinStatsRow/GradientColumnComponent';
import {theme} from 'app/style/theme';
import {recordedInsulinBridgeStats} from 'app/containers/MainTabsNavigator/Containers/Home/components/InsulinStatsRow/InsulinDataCalculations';

jest.mock(
  'app/containers/MainTabsNavigator/Containers/Home/components/InsulinStatsRow/GradientColumnComponent',
  () => ({
    GradientColumnComponent: () => null,
  }),
);

describe('legacy day insulin facts', () => {
  const cards = async (summary: unknown) => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider theme={theme}>
          <InsulinStatsRow summary={summary as never} locale="en" />
        </ThemeProvider>,
      );
    });
    const result = tree!.root
      .findAllByType(GradientColumnComponent)
      .map(node => node.props);
    act(() => tree!.unmount());
    return result;
  };

  it('shows partial delivered evidence as a subtotal, with coverage and no ratio', async () => {
    const result = await cards({
      quality: 'partial',
      basalUnits: 6.8,
      bolusUnits: 33.85,
      basalCoveredMs: 1,
      basalCoveragePercent: 30,
    });
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({label: 'Recorded subtotal', value: '40.65 U'}),
        expect.objectContaining({
          label: 'Basal',
          value: '6.8 U',
          time: '30% of the time covered by basal records',
        }),
        expect.objectContaining({
          label: 'Basal / bolus',
          value: '—',
          progress: undefined,
        }),
      ]),
    );
  });

  it('keeps unknown insulin unknown instead of showing zero', async () => {
    const result = await cards({quality: 'unavailable'});
    expect(result.map(card => card.value)).toEqual(['—', '—', '—', '—']);
  });

  it('uses a separately labeled validated estimate and retains recorded basal', async () => {
    const result = await cards({
      quality: 'partial',
      basalUnits: 6.8,
      bolusUnits: 33.85,
      basalCoveredMs: 1,
      basalCoveragePercent: 30,
      estimatedBasalUnits: 27.15,
      estimatedTotalUnits: 61,
    });
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({label: 'Estimated total', value: '61 U'}),
        expect.objectContaining({
          label: 'Estimated basal',
          value: '27.15 U',
          time: expect.stringContaining('Recorded basal: 6.8 U'),
        }),
      ]),
    );
  });

  it('does not publish partial or estimated doses to a native bridge without quality labels', () => {
    expect(
      recordedInsulinBridgeStats({
        quality: 'partial',
        basalUnits: 6.8,
        bolusUnits: 33.85,
        basalCoveredMs: 1,
        basalCoveragePercent: 30,
        estimatedBasalUnits: 27.15,
        estimatedTotalUnits: 61,
      }),
    ).toBeUndefined();
    expect(
      recordedInsulinBridgeStats({
        quality: 'available',
        basalUnits: 27.15,
        bolusUnits: 33.85,
      }),
    ).toMatchObject({totalInsulin: 61, totalBasal: 27.15, totalBolus: 33.85});
  });
});
