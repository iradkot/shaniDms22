import React from 'react';
import {Modal, StyleSheet, Text} from 'react-native';
import {glucoseChartColor} from 'app/components/charts/chartPalette';
import renderer, {act} from 'react-test-renderer';
import {ThemeProvider} from 'styled-components/native';
import HomeChartsTooltip from 'app/containers/MainTabsNavigator/Containers/Home/components/HomeChartsTooltip';
import {theme} from 'app/style/theme';

describe('Shared chart inspector presentation', () => {
  it('opens stable selection details outside the chart layout and keeps all recorded carbs', () => {
    const props = {
      compact: true,
      collapsible: true,
      locale: 'he' as const,
      anchorTimeMs: 0,
      bgSample: {date: 0, sgv: 142} as any,
      activeInsulinU: 3.38,
      cobG: 58,
      basalRateUhr: 0.78,
      bolusSummary: {count: 0, totalU: 0},
      carbsSummary: {count: 2, totalG: 58},
      carbEvents: [
        {id: 'meal-a', timestamp: 0, carbs: 40},
        {id: 'meal-b', timestamp: 0, carbs: 18},
      ] as any,
    };
    const render = (next = props) => (
      <ThemeProvider theme={theme}>
        <HomeChartsTooltip {...next} />
      </ThemeProvider>
    );
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(render());
    });
    act(() =>
      tree!.root
        .findByProps({testID: 'chart-inspector-toggle-details'})
        .props.onPress(),
    );
    const modal = tree!.root.findByType(Modal);
    expect(modal.props.visible).toBe(true);
    const selectedValue = (key: string) =>
      modal.findByProps({testID: `chart-inspector-value-${key}`}).props
        .children;
    expect(selectedValue('carbs')).toBe('58 g (2)');
    expect(selectedValue('iob')).toBe('3.38 U');
    act(() =>
      tree!.update(
        render({...props, activeInsulinU: 0.5, cobG: 0, anchorTimeMs: 3600000}),
      ),
    );
    expect(selectedValue('iob')).toBe('3.38 U');
    expect(selectedValue('cob')).toBe('58 g');
    act(() => modal.props.onRequestClose());
    expect(tree!.root.findAllByType(Modal)).toHaveLength(0);
    act(() => tree!.unmount());
  });
  it('uses the glucose marker color in the compact panel', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ThemeProvider theme={theme}>
          <HomeChartsTooltip
            compact
            locale="he"
            anchorTimeMs={0}
            bgSample={{date: 0, sgv: 180} as any}
            activeInsulinU={null}
            cobG={null}
            basalRateUhr={null}
            bolusSummary={{count: 0, totalU: 0}}
            carbsSummary={{count: 0, totalG: 0}}
          />
        </ThemeProvider>,
      );
    });
    const value = tree!.root
      .findAllByType(Text)
      .find(node => node.props.children === '180 mg/dL');
    expect(StyleSheet.flatten(value!.props.style).color).toBe(
      glucoseChartColor(180, theme),
    );
    act(() => tree!.unmount());
  });
  it.each(['en', 'he'] as const)(
    'keeps the total readable and labels a missing IOB component as unknown in %s',
    locale => {
      let tree: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(
          <ThemeProvider theme={theme}>
            <HomeChartsTooltip
              locale={locale}
              anchorTimeMs={0}
              bgSample={null}
              activeInsulinU={2.5}
              activeInsulinBolusU={1}
              activeInsulinBasalU={null}
              cobG={0}
              basalRateUhr={0.7}
              bolusSummary={{count: 0, totalU: 0}}
              carbsSummary={{count: 0, totalG: 0}}
            />
          </ThemeProvider>,
        );
      });
      const labels = tree!.root
        .findAllByType(Text)
        .map(node => node.props.children);
      expect(labels).toContain('2.50 U');
      expect(labels).toContain(
        locale === 'he' ? 'בולוס 1.00 U · בזאל —' : 'Bolus 1.00 U · Basal —',
      );
      expect(labels).not.toContain('Basal 0.00 U');
      act(() => tree!.unmount());
    },
  );
});
