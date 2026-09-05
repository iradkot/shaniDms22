import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserApp} from './BrowserApp';
import {ThemeSettingsProvider} from '../src/contexts/ThemeSettingsContext';
import {AppThemeProvider} from '../src/style/AppThemeProvider';
import './styles.css';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('The web application root is missing.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeSettingsProvider>
      <AppThemeProvider>
        <BrowserApp />
      </AppThemeProvider>
    </ThemeSettingsProvider>
  </React.StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('./service-worker.js', document.baseURI), {scope: './'})
      .catch(() => {
        // Offline installation is best effort; local data remains durable.
      });
  });
}
