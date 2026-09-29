import {buildSettingsOverview} from 'app/modules/settings';

describe('buildSettingsOverview', () => {
  it('returns useful connection status without retaining credentials or account IDs', () => {
    const input = {
      appInfo: {
        versionName: '1.0.529-preview',
        buildNumber: '53568000',
        builtAt: 'invalid',
        ignoredSecret: 'build-secret',
      },
      language: 'en' as const,
      layout: 'tablet' as const,
      personalization: {
        questionnaireStatus: 'completed' as const,
        favoritesCount: 7,
        showCurrentSnapshot: true,
        showRecents: false,
        showGri: true,
        chatShortcut: true,
        updatesShortcut: false,
      },
      account: {
        status: 'signed-in' as const,
        displayLabel: 'Irad',
        ignoredFirebaseUserId: 'firebase-user-secret',
      },
      nightscout: {
        status: 'connected' as const,
        displayLabel: 'My Nightscout',
        credentialConfigured: true,
        ignoredApiSecret: 'do-not-retain-this-secret',
      },
      ai: {
        enabled: true,
        credentialConfigured: true,
        ignoredApiKey: 'sk-do-not-retain-this-secret',
      },
      preMealAssistance: {
        enabled: true,
        notificationsEnabled: false,
      },
      offline: {status: 'ready' as const, pendingWrites: 3},
    };

    const result = buildSettingsOverview(input);
    const serialized = JSON.stringify(result);

    expect(result.layout.columns).toBe(3);
    expect(result.appInfo).toEqual({versionName: '1.0.529-preview', buildNumber: '53568000'});
    expect(serialized).not.toContain('build-secret');
    expect(result.nightscout).toEqual({
      status: 'connected',
      displayLabel: 'My Nightscout',
      credentialConfigured: true,
    });
    expect(result.ai).toEqual({
      enabled: true,
      credentialConfigured: true,
      advisoryOnly: true,
    });
    expect(result.preMealAssistance).toEqual({
      enabled: true,
      notificationsEnabled: false,
    });
    expect(serialized).not.toContain('firebase-user-secret');
    expect(serialized).not.toContain('do-not-retain-this-secret');
  });
});
