import {
  parseWebRuntimeConfig,
  tryParseWebRuntimeConfig,
} from '../../../src/platform/web';

describe('web runtime configuration', () => {
  it('accepts production HTTPS configuration', () => {
    expect(
      parseWebRuntimeConfig({
        firebaseApiKey: 'public-firebase-browser-key',
        firebaseProjectId: 'shani-project-123',
        googleClientId: '1234567890-browserclient.apps.googleusercontent.com',
        apiBaseUrl:
          'https://us-central1-shani-project-123.cloudfunctions.net/shaniApi/',
      }),
    ).toEqual({
      firebaseApiKey: 'public-firebase-browser-key',
      firebaseProjectId: 'shani-project-123',
      firebaseStorageBucket: 'shani-project-123.appspot.com',
      googleClientId: '1234567890-browserclient.apps.googleusercontent.com',
      apiBaseUrl:
        'https://us-central1-shani-project-123.cloudfunctions.net/shaniApi',
    });
  });

  it('rejects insecure non-local API origins without throwing from the safe parser', () => {
    expect(
      tryParseWebRuntimeConfig({
        firebaseApiKey: 'key',
        firebaseProjectId: 'shani-project-123',
        googleClientId: '1234567890-browserclient.apps.googleusercontent.com',
        apiBaseUrl: 'http://public.example/api',
      }),
    ).toMatchObject({ok: false});
  });
});
