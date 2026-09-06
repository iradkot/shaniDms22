import {fileURLToPath} from 'node:url';
import appConfig from './vite.config.mjs';

// Build the existing synthetic fixture with the application's production
// transforms and aliases. Keep profiling outputs separate from release files.
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
      input: fileURLToPath(
        new URL('./web/day-graph-preview.html', import.meta.url),
      ),
    },
  },
};
