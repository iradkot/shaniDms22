import React from 'react';
import {ThemeProvider} from 'styled-components/native';
import {useThemeSettings} from '../contexts/ThemeSettingsContext';

/** Supplies the selected application theme to shared native and web views. */
export const AppThemeProvider = ({children}: {children: React.ReactNode}) => {
  const {activeTheme} = useThemeSettings();
  return <ThemeProvider theme={activeTheme}>{children}</ThemeProvider>;
};
