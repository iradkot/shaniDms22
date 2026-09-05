import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const serviceWorkerPath = path.resolve(
  scriptsDirectory,
  '..',
  'releases',
  'web',
  'service-worker.js',
);
const source = await readFile(serviceWorkerPath, 'utf8');

if (!source.includes('PRECACHE_URL_SET.has(request.url)')) {
  throw new Error('Web service worker does not enforce its immutable asset allow-list.');
}
if (
  !source.includes('request.url === RUNTIME_CONFIG_URL') ||
  !source.includes('cache.put(request, response.clone())') ||
  (source.match(/\bcache\.put\s*\(/g) ?? []).length !== 1
) {
  throw new Error(
    'Web service worker may runtime-cache only the exact public runtime config URL.',
  );
}

console.log('Web service-worker cache policy verified.');
