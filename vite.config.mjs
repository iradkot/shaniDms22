import {createHash} from 'node:crypto';
import {fileURLToPath, URL} from 'node:url';
import react from '@vitejs/plugin-react';
import {defineConfig, transformWithEsbuild} from 'vite';
import {assertBrowserSafeAreaBoundary} from './scripts/web-platform-boundary.mjs';

const projectPath = path => fileURLToPath(new URL(path, import.meta.url));

const reactNativeDependencyJsxPlugin = () => ({
  name: 'react-native-dependency-jsx',
  enforce: 'pre',
  async transform(source, id) {
    if (id.includes('/react-native-markdown-display/') && id.endsWith('.js')) {
      return transformWithEsbuild(source, id, {
        loader: 'jsx',
        jsx: 'automatic',
      });
    }
    return null;
  },
});

const styledComponentsNativeWebPlugin = () => ({
  name: 'styled-components-native-web',
  enforce: 'pre',
  async transform(source, id) {
    if (!id.endsWith('styled-components.native.esm.js')) {
      return null;
    }
    const browserSource = source.replace(
      "var reactNative = require('react-native');",
      "import * as reactNative from 'react-native';",
    );
    return transformWithEsbuild(browserSource, id, {
      loader: 'js',
      sourcemap: true,
    });
  },
});

const offlineBundlePlugin = () => ({
  name: 'shani-offline-bundle',
  apply: 'build',
  generateBundle(_options, bundle) {
    const files = Object.values(bundle)
      .map(item => item.fileName)
      .filter(
        fileName =>
          fileName !== 'service-worker.js' &&
          fileName !== 'runtime-config.js' &&
          !fileName.endsWith('.map'),
      )
      .sort();
    const digest = createHash('sha256')
      .update(files.join('|'))
      .digest('hex')
      .slice(0, 12);
    const source = `const CACHE_NAME = 'shani-web-${digest}';
const PRECACHE_PATHS = ${JSON.stringify(['./', ...files])};
const precacheUrls = () => PRECACHE_PATHS.map(path => new URL(path, self.registration.scope).href);
const PRECACHE_URL_SET = new Set(precacheUrls());
const RUNTIME_CONFIG_URL = new URL('./runtime-config.js', self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([...PRECACHE_URL_SET, RUNTIME_CONFIG_URL])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('shani-web-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.url === RUNTIME_CONFIG_URL) {
    event.respondWith(fetch(request).then(response => {
      if (!response.ok) return response;
      return caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()).then(() => response));
    }).catch(() => caches.match(request)));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(new URL('./', self.registration.scope).href)));
    return;
  }
  if (!PRECACHE_URL_SET.has(request.url)) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});`;
    this.emitFile({type: 'asset', fileName: 'service-worker.js', source});
  },
});

export default defineConfig({
  root: projectPath('./web'),
  base: './',
  plugins: [
    {
      name: 'browser-platform-boundary',
      apply: 'build',
      generateBundle(_options, bundle) {
        assertBrowserSafeAreaBoundary(
          Object.values(bundle).flatMap(item =>
            item.type === 'chunk' ? Object.keys(item.modules) : [],
          ),
        );
      },
    },
    reactNativeDependencyJsxPlugin(),
    styledComponentsNativeWebPlugin(),
    react(),
    offlineBundlePlugin(),
  ],
  // The prebuilt native entry cannot emit browser safe-area measurements.
  // Resolve its source through Vite's .web extensions instead of prebundling it.
  optimizeDeps: {exclude: ['react-native-safe-area-context']},
  resolve: {
    alias: [
      {
        find: /^react-native-safe-area-context$/,
        replacement: projectPath(
          './node_modules/react-native-safe-area-context/src/index.tsx',
        ),
      },
      {
        find: /^styled-components\/native$/,
        replacement: projectPath(
          './node_modules/styled-components/native/dist/styled-components.native.esm.js',
        ),
      },
      {
        find: 'react-native-vector-icons/MaterialCommunityIcons',
        replacement: projectPath(
          './src/platform/web/shims/MaterialCommunityIcons.tsx',
        ),
      },
      {
        find: 'react-native-vector-icons/MaterialIcons',
        replacement: projectPath('./src/platform/web/shims/MaterialIcons.tsx'),
      },
      {
        find: 'react-native-svg',
        replacement: projectPath(
          './node_modules/react-native-svg/lib/module/elements.web.js',
        ),
      },
      {
        find: 'react-native/Libraries/Utilities/codegenNativeComponent',
        replacement: projectPath(
          './src/platform/web/shims/codegenNativeComponent.tsx',
        ),
      },
      {find: 'react-native', replacement: 'react-native-web'},
      {find: /^app\/(.*)$/, replacement: projectPath('./src/$1')},
    ],
    extensions: [
      '.web.tsx',
      '.web.ts',
      '.tsx',
      '.ts',
      '.web.jsx',
      '.web.js',
      '.jsx',
      '.js',
      '.json',
    ],
  },
  build: {
    outDir: projectPath('./releases/web'),
    emptyOutDir: true,
    sourcemap: true,
  },
  define: {
    global: 'globalThis',
  },
});
