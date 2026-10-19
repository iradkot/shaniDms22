import {normalizeNightscoutAccessToken} from '../src/services/nightscoutTokenPermissions';

describe('Nightscout credential classification', () => {
  it.each(['reader', 'writer', 'admin'])('keeps a %s subject token raw regardless of its role', name => {
    const token = `${name}-0123456789abcdef`;
    expect(normalizeNightscoutAccessToken(` token=${token} `)).toBe(token);
  });

  it('leaves API_SECRET input to the secret hashing path', () => {
    expect(normalizeNightscoutAccessToken('example-master-secret')).toBeNull();
    expect(normalizeNightscoutAccessToken('a'.repeat(40))).toBeNull();
    expect(normalizeNightscoutAccessToken('')).toBeNull();
  });
});
