describe('Android Nightscout token transport compatibility', () => {
  it('passes raw tokens to the existing encrypted background credential bridge', () => {
    const configureBackgroundSync = jest.fn();
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({Platform: {OS: 'android'}, NativeModules: {GlucoseLiveModule: {configureBackgroundSync}}}));
      const {configureNightscoutInstance, getNightscoutConfigurationRevision, clearNightscoutInstance} = require('../src/api/shaniNightscoutInstances');
      const {createNightscoutCacheScope} = require('../src/services/nightscoutCacheScope');
      configureNightscoutInstance({baseUrl: 'https://ns.example', ownerUserId: 'synthetic-owner', accessToken: 'shani-0123456789abcdef'});
      const {configureAndroidWidgetBackgroundSync} = require('../src/services/androidGlucoseLiveSurface');
      configureAndroidWidgetBackgroundSync({baseUrl: 'https://ns.example', accessToken: 'shani-0123456789abcdef', apiSecretSha1: '', enabled: true});
      expect(configureBackgroundSync).toHaveBeenCalledWith('https://ns.example', 'shani-0123456789abcdef', true, getNightscoutConfigurationRevision(), 'synthetic-owner', createNightscoutCacheScope('https://ns.example', 'synthetic-owner').sourceIdentity);
      configureAndroidWidgetBackgroundSync({enabled: false});
      expect(configureBackgroundSync).toHaveBeenLastCalledWith(undefined, undefined, false, getNightscoutConfigurationRevision(), 'synthetic-owner', null);
      clearNightscoutInstance();
    });
    jest.dontMock('react-native');
  });
});
