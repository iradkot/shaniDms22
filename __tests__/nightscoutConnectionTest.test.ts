import axios from 'axios';
import {Platform} from 'react-native';
import {
  NightscoutConnectionTestError,
  testNightscoutConnection,
} from '../src/services/nightscoutConnectionTest';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
const secret = 'a'.repeat(40);
const source = {baseUrl: 'https://example.com/monitor/', apiSecretSha1: secret};

describe('Nightscout connection check uses the data request contract', () => {
  const originalOS = Platform.OS;
  beforeEach(() => {
    mockedAxios.get.mockReset();
    Platform.OS = 'android';
  });
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('checks native header authentication and preserves a sub-path installation', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [{date: 1700000000000, sgv: 123}],
    });
    await expect(testNightscoutConnection(source)).resolves.toEqual({
      ok: true,
      entriesCount: 1,
      latestEntryDate: 1700000000000,
      authMethod: 'header',
    });
    expect(mockedAxios.get).toHaveBeenCalledWith('/api/v1/entries/sgv.json', {
      baseURL: 'https://example.com/monitor',
      timeout: 12000,
      params: {count: 1},
      headers: {Accept: 'application/json', 'api-secret': secret},
    });
  });

  it('accepts numeric strings used by supported Nightscout glucose payloads', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [{date: '1700000000000', sgv: '123'}],
    });
    await expect(testNightscoutConnection(source)).resolves.toMatchObject({
      entriesCount: 1,
      latestEntryDate: 1700000000000,
    });
  });

  it('keeps the existing browser query authentication', async () => {
    Platform.OS = 'web';
    mockedAxios.get.mockResolvedValueOnce({data: []});
    await expect(testNightscoutConnection(source)).resolves.toMatchObject({
      entriesCount: 0,
      authMethod: 'query',
    });
    expect(mockedAxios.get.mock.calls[0][1]).toMatchObject({
      params: {count: 1, secret},
      headers: {Accept: 'application/json'},
    });
  });

  it.each([
    [{response: {status: 401}}, 'authentication'],
    [{response: {status: 403}}, 'authentication'],
    [{response: {status: 404}}, 'not-found'],
    [{code: 'ECONNABORTED'}, 'timeout'],
    [{request: {}}, 'network'],
    [new Error('private-url-and-credential'), 'unknown'],
  ])(
    'returns a safe typed failure without a different authentication fallback',
    async (failure, code) => {
      mockedAxios.get.mockRejectedValueOnce(failure);
      let error: unknown;
      try {
        await testNightscoutConnection(source);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(NightscoutConnectionTestError);
      expect(error).toMatchObject({code});
      expect(String(error)).not.toContain('private-url-and-credential');
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    '<html>Login</html>',
    [{}],
    [{date: 1700000000000}],
    [{date: NaN, sgv: 123}],
  ])(
    'does not report a successful glucose connection for an invalid response',
    async data => {
      mockedAxios.get.mockResolvedValueOnce({data});
      await expect(testNightscoutConnection(source)).rejects.toMatchObject({
        code: 'invalid-response',
      });
    },
  );
});
