import {Platform} from 'react-native';

import {
  clearNightscoutInstance,
  configureNightscoutInstance,
  getNightscoutConfigurationRevision,
  nightscoutInstance,
  subscribeNightscoutConfiguration,
} from '../src/api/shaniNightscoutInstances';

describe('shaniNightscoutInstances', () => {
  beforeEach(() => {
    clearNightscoutInstance();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(['android', 'ios'] as const)(
    'uses standard native header authentication on %s',
    platform => {
      jest.replaceProperty(Platform, 'OS', platform);
      configureNightscoutInstance({
        baseUrl: 'https://example.com',
        apiSecretSha1: 'a'.repeat(40),
      });
      expect(nightscoutInstance.defaults.headers.common['api-secret']).toBe(
        'a'.repeat(40),
      );
      expect(nightscoutInstance.defaults.params?.api_secret).toBeUndefined();
      expect(nightscoutInstance.defaults.params?.secret).toBeUndefined();
    },
  );

  it('uses Nightscout API v1 secret query authentication in a browser', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    configureNightscoutInstance({
      baseUrl: 'https://example.com',
      apiSecretSha1: '55a342b44e4c1d0d3c293f90042af4251e150e32',
    });

    expect(nightscoutInstance.defaults.baseURL).toBe('https://example.com');
    expect(nightscoutInstance.defaults.params).toMatchObject({
      secret: '55a342b44e4c1d0d3c293f90042af4251e150e32',
    });
    expect(nightscoutInstance.defaults.params?.api_secret).toBeUndefined();
    expect(
      nightscoutInstance.defaults.headers.common['api-secret'],
    ).toBeUndefined();
  });

  it('removes credentials when the next source is public', () => {
    configureNightscoutInstance({
      baseUrl: 'https://example.com',
      apiSecretSha1: 'a'.repeat(40),
    });
    configureNightscoutInstance({baseUrl: 'https://public.example'});
    expect(
      nightscoutInstance.defaults.headers.common['api-secret'],
    ).toBeUndefined();
    expect(nightscoutInstance.defaults.params?.api_secret).toBeUndefined();
    expect(nightscoutInstance.defaults.params?.secret).toBeUndefined();
  });

  it('clears obsolete query credentials before native configuration and reset', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    nightscoutInstance.defaults.params = {
      api_secret: 'obsolete',
      secret: 'previous',
      count: 24,
    };
    configureNightscoutInstance({
      baseUrl: 'https://example.com',
      apiSecretSha1: 'a'.repeat(40),
    });
    expect(nightscoutInstance.defaults.params).toEqual({count: 24});
    nightscoutInstance.defaults.params = {
      api_secret: 'obsolete',
      secret: 'previous',
      count: 24,
    };
    clearNightscoutInstance();
    expect(nightscoutInstance.defaults.params).toEqual({count: 24});
  });

  it('notifies subscribers when only the credential changes', () => {
    const profile = {
      baseUrl: 'https://example.com',
      apiSecretSha1: 'a'.repeat(40),
    };
    configureNightscoutInstance(profile);
    const onChange = jest.fn();
    const unsubscribe = subscribeNightscoutConfiguration(onChange);
    try {
      configureNightscoutInstance(profile);
      expect(onChange).not.toHaveBeenCalled();
      configureNightscoutInstance({...profile, apiSecretSha1: 'b'.repeat(40)});
      expect(onChange).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it('advances the opaque revision only when source, account or credential changes', () => {
    const revision = getNightscoutConfigurationRevision();
    const profile = {
      baseUrl: 'https://example.com',
      ownerUserId: 'account-a',
      apiSecretSha1: 'a'.repeat(40),
    };
    configureNightscoutInstance(profile);
    expect(getNightscoutConfigurationRevision()).toBe(revision + 1);
    configureNightscoutInstance({...profile, ownerUserId: ' account-a '});
    expect(getNightscoutConfigurationRevision()).toBe(revision + 1);
    configureNightscoutInstance({...profile, ownerUserId: 'account-b'});
    expect(getNightscoutConfigurationRevision()).toBe(revision + 2);
    configureNightscoutInstance({
      ...profile,
      ownerUserId: 'account-b',
      baseUrl: 'https://second.example',
    });
    expect(getNightscoutConfigurationRevision()).toBe(revision + 3);
    clearNightscoutInstance();
    expect(getNightscoutConfigurationRevision()).toBe(revision + 4);
    clearNightscoutInstance();
    expect(getNightscoutConfigurationRevision()).toBe(revision + 4);
  });

  it('clears Nightscout auth params', () => {
    configureNightscoutInstance({
      baseUrl: 'https://example.com',
      apiSecretSha1: '55a342b44e4c1d0d3c293f90042af4251e150e32',
    });

    clearNightscoutInstance();

    expect(nightscoutInstance.defaults.baseURL).toBeUndefined();
    expect(nightscoutInstance.defaults.params?.api_secret).toBeUndefined();
    expect(nightscoutInstance.defaults.params?.secret).toBeUndefined();
    expect(
      nightscoutInstance.defaults.headers.common['api-secret'],
    ).toBeUndefined();
  });
});
