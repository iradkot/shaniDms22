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

  it('verifies effective permissions and sends the raw subject token in native requests', async () => {
    const accessToken = 'shani-0123456789abcdef';
    mockedAxios.get
      .mockResolvedValueOnce({data: {permissionGroups: [['*:*:read']]}})
      .mockResolvedValueOnce({data: [{date: 1700000000000, sgv: 123}]});
    await expect(
      testNightscoutConnection({...source, apiSecretSha1: '', accessToken}),
    ).resolves.toMatchObject({readOnlyVerified: true});
    expect(mockedAxios.get.mock.calls[0][0]).toBe(
      `/api/v2/authorization/request/${accessToken}`,
    );
    expect(mockedAxios.get.mock.calls[1][1]?.headers).toEqual({
      Accept: 'application/json',
      'api-secret': accessToken,
    });
  });

  it('uses token query authentication for the browser compatibility path', async () => {
    Platform.OS = 'web';
    const accessToken = 'shani-0123456789abcdef';
    mockedAxios.get
      .mockResolvedValueOnce({data: {permissionGroups: [['*:*:read']]}})
      .mockResolvedValueOnce({data: []});
    await testNightscoutConnection({baseUrl: source.baseUrl, accessToken});
    expect(mockedAxios.get.mock.calls[1][1]?.params).toEqual({
      count: 1,
      token: accessToken,
    });
  });

  it('rejects a revoked token even when the source allows public reads', async () => {
    mockedAxios.get
      .mockRejectedValueOnce({
        response: {status: 401},
        config: {url: 'private-token'},
      })
      .mockResolvedValueOnce({data: []});
    await expect(
      testNightscoutConnection({
        baseUrl: source.baseUrl,
        accessToken: 'revoked-0123456789abcdef',
      }),
    ).rejects.toMatchObject({code: 'authentication'});
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('rejects a token whose default roles add write access before requesting glucose', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {permissionGroups: [['*:*:read'], ['api:treatments:create']]},
    });
    await expect(
      testNightscoutConnection({
        baseUrl: source.baseUrl,
        accessToken: 'shani-0123456789abcdef',
      }),
    ).rejects.toMatchObject({code: 'permissions'});
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
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
