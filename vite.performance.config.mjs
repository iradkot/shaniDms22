import {fileURLToPath} from 'node:url';
import appConfig from './vite.config.mjs';

// Build both synthetic fixtures with the application's production transforms
// and aliases. The real-shell fixture also gives viewport QA a stable build
// without development hot reloads interrupting touch or modal assertions.
export default {
  ...appConfig,
  build: {
    ...appConfig.build,
    emptyOutDir: false,
    outDir: fileURLToPath(
      new URL('./artifacts/performance/chart-production', import.meta.url),
    ),
    rollupOptions: {
      ...appConfig.build?.rollupOptions,
      input: {
        chart: fileURLToPath(
          new URL('./web/day-graph-preview.html', import.meta.url),
        ),
        viewport: fileURLToPath(
          new URL('./web/day-graph-viewport-preview.html', import.meta.url),
        ),
      },
    },
  },
};
