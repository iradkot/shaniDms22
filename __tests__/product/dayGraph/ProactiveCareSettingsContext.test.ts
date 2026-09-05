import {normalizeProactiveCareSettings} from 'app/contexts/ProactiveCareSettingsContext';

describe('pre-meal assistance settings', () => {
  it('requires separate, explicit card and notification opt-ins', () => {
    expect(normalizeProactiveCareSettings(undefined).preMealAssistance).toEqual({
      enabled: false,
      notificationsEnabled: false,
    });
    expect(
      normalizeProactiveCareSettings({
        preMealAssistance: {enabled: true},
      }).preMealAssistance,
    ).toEqual({enabled: true, notificationsEnabled: false});
    expect(
      normalizeProactiveCareSettings({
        preMealAssistance: {enabled: true, notificationsEnabled: true},
      }).preMealAssistance,
    ).toEqual({enabled: true, notificationsEnabled: true});
  });
});

