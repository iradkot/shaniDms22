import {
  clearNightscoutInstance,
  configureNightscoutInstance,
  nightscoutInstance,
} from '../src/api/shaniNightscoutInstances';

describe('shaniNightscoutInstances', () => {
  beforeEach(() => {
    clearNightscoutInstance();
  });

  it('configures Nightscout auth as query params instead of custom headers', () => {
    configureNightscoutInstance({
      baseUrl: 'https://example.com',
      apiSecretSha1: '55a342b44e4c1d0d3c293f90042af4251e150e32',
    });

    expect(nightscoutInstance.defaults.baseURL).toBe('https://example.com');
    expect(nightscoutInstance.defaults.params).toMatchObject({
      api_secret: '55a342b44e4c1d0d3c293f90042af4251e150e32',
    });
    expect(nightscoutInstance.defaults.headers.common['api-secret']).toBeUndefined();
  });

  it('clears Nightscout auth params', () => {
    configureNightscoutInstance({
      baseUrl: 'https://example.com',
      apiSecretSha1: '55a342b44e4c1d0d3c293f90042af4251e150e32',
    });

    clearNightscoutInstance();

    expect(nightscoutInstance.defaults.baseURL).toBeUndefined();
    expect(nightscoutInstance.defaults.params?.api_secret).toBeUndefined();
    expect(nightscoutInstance.defaults.headers.common['api-secret']).toBeUndefined();
  });
});
