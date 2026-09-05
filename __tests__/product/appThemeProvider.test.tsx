import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, {act} from 'react-test-renderer';
import {useTheme} from 'styled-components/native';
import {
  ThemeSettingsProvider,
  useThemeSettings,
} from 'app/contexts/ThemeSettingsContext';
import {AppThemeProvider} from 'app/style/AppThemeProvider';
import {applyThemeToSingleton, getThemeById} from 'app/style/theme';

describe('application theme host', () => {
  it('supplies the saved theme and follows the existing settings action', async () => {
    await AsyncStorage.setItem('theme.settings.v1', 'darkFocus');
    const observed = jest.fn();
    const Probe = () => {
      const settings = useThemeSettings();
      observed({theme: useTheme(), settings});
      return null;
    };
    let tree: renderer.ReactTestRenderer | undefined;
    try {
      await act(async () => {
        tree = renderer.create(
          <ThemeSettingsProvider>
            <AppThemeProvider>
              <Probe />
            </AppThemeProvider>
          </ThemeSettingsProvider>,
        );
      });
      const latest = () =>
        observed.mock.calls[observed.mock.calls.length - 1]![0];
      expect(latest().settings.isLoaded).toBe(true);
      expect(latest().theme).toMatchObject({
        dark: true,
        backgroundColor: getThemeById('darkFocus').backgroundColor,
        chart: getThemeById('darkFocus').chart,
      });
      await act(async () => {
        latest().settings.setThemeId('sunsetGlow');
      });
      expect(latest().theme).toMatchObject({
        dark: false,
        backgroundColor: getThemeById('sunsetGlow').backgroundColor,
        chart: getThemeById('sunsetGlow').chart,
      });
      expect(await AsyncStorage.getItem('theme.settings.v1')).toBe(
        'sunsetGlow',
      );
    } finally {
      act(() => tree?.unmount());
      await AsyncStorage.removeItem('theme.settings.v1');
      applyThemeToSingleton('calmBlue');
    }
  });
});
