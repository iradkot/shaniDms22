import {hasReadOnlyNightscoutPermissions, normalizeNightscoutAccessToken} from '../src/services/nightscoutTokenPermissions';

describe('Nightscout subject-token permission contract', () => {
  it('accepts the official readable role including an empty denied default role', () => {
    expect(hasReadOnlyNightscoutPermissions({permissionGroups: [['*:*:read'], []]})).toBe(true);
    expect(hasReadOnlyNightscoutPermissions({permissionGroups: [['api:entries,treatments,profile,devicestatus,status:read']]})).toBe(true);
  });

  it.each([
    undefined, {}, {permissionGroups: []}, {permissionGroups: ['readable']},
    {permissionGroups: [['api:entries:read']]},
    {permissionGroups: [['*:*:read'], ['api:treatments:create']]},
    {permissionGroups: [['*:*:read'], ['admin:api:read']]},
    {permissionGroups: [['*']]}, {permissionGroups: [['api:*:*']]},
    {permissionGroups: [['api:*:read,create']]},
    {permissionGroups: [['*:*:read'], [null]]},
  ])('rejects missing permissions and any custom/default write or admin grant', value => {
    expect(hasReadOnlyNightscoutPermissions(value)).toBe(false);
  });

  it('keeps subject tokens raw and rejects API_SECRET and temporary JWT input', () => {
    expect(normalizeNightscoutAccessToken(' token=shani-0123456789abcdef ')).toBe('shani-0123456789abcdef');
    expect(normalizeNightscoutAccessToken('master-secret')).toBeNull();
    expect(normalizeNightscoutAccessToken('a'.repeat(40))).toBeNull();
    expect(normalizeNightscoutAccessToken('ey123.ey456.sig')).toBeNull();
  });
});
