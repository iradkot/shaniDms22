const fs = require('node:fs');
const path = require('node:path');

describe('browser runtime configuration asset', () => {
  const workspace = path.join(__dirname, '../../..');

  it('loads the self-hosted public config before the application module', () => {
    const html = fs.readFileSync(
      path.join(workspace, 'web/index.html'),
      'utf8',
    );
    expect(html.indexOf('./runtime-config.js')).toBeGreaterThan(-1);
    expect(html.indexOf('./runtime-config.js')).toBeLessThan(
      html.indexOf('/main.tsx'),
    );
  });

  it('keeps runtime config replaceable with a public offline fallback', () => {
    const config = fs.readFileSync(
      path.join(workspace, 'web/public/runtime-config.js'),
      'utf8',
    );
    const vite = fs.readFileSync(
      path.join(workspace, 'vite.config.mjs'),
      'utf8',
    );
    expect(config).toContain('globalThis.__SHANI_WEB_CONFIG__');
    expect(config).toContain('Never place Nightscout');
    expect(vite).toContain("fileName !== 'runtime-config.js'");
    expect(vite).toContain('RUNTIME_CONFIG_URL');
    expect(vite).toContain('request.url === RUNTIME_CONFIG_URL');
    expect(vite).toContain('cache.put(request, response.clone())');
  });
});
