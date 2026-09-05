import {
  decodeShaniDmsRuntimeConfig,
  REQUIRED_FIRESTORE_RULES_SCHEMA_VERSION,
} from 'app/platform/native/runtimeConfig';

describe('native release runtime configuration', () => {
  it('fails closed when values are missing or malformed', () => {
    expect(decodeShaniDmsRuntimeConfig(undefined)).toEqual({
      firestoreRulesSchemaVersion: 0,
    });
    expect(
      decodeShaniDmsRuntimeConfig({
        backendBaseUrl: '   ',
        firestoreRulesSchemaVersion: 'not-a-version',
      }),
    ).toEqual({firestoreRulesSchemaVersion: 0});
  });

  it('normalizes build values without accepting partial numbers', () => {
    expect(
      decodeShaniDmsRuntimeConfig({
        backendBaseUrl: ' https://api.example.test ',
        firestoreRulesSchemaVersion: `${REQUIRED_FIRESTORE_RULES_SCHEMA_VERSION}`,
      }),
    ).toEqual({
      backendBaseUrl: 'https://api.example.test',
      firestoreRulesSchemaVersion: REQUIRED_FIRESTORE_RULES_SCHEMA_VERSION,
    });
    expect(
      decodeShaniDmsRuntimeConfig({firestoreRulesSchemaVersion: 1.5}),
    ).toEqual({firestoreRulesSchemaVersion: 0});
  });
});
