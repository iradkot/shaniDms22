import React from 'react';
import {ThemeProvider} from 'styled-components/native';
import {getThemeById} from 'app/style/theme';
import type {ThemeType} from 'app/types/theme';

export const withTheme = (
  children: React.ReactNode,
  theme: ThemeType = getThemeById('calmBlue'),
): React.ReactElement => (
  <ThemeProvider theme={theme}>{children}</ThemeProvider>
);
