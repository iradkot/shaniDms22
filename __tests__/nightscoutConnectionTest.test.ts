import axios from 'axios';

import {testNightscoutConnection} from '../src/services/nightscoutConnectionTest';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('nightscoutConnectionTest', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
  });

  it('tests the connection with api_secret query auth first', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [{date: 1700000000000}],
    });

    const result = await testNightscoutConnection({
      baseUrl: 'https://example.com/',
      apiSecretSha1: '55a342b44e4c1d0d3c293f90042af4251e150e32',
    });

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(mockedAxios.get.mock.calls[0][0]).toBe(
      'https://example.com/api/v1/entries.json?count=1&api_secret=55a342b44e4c1d0d3c293f90042af4251e150e32',
    );
    expect(mockedAxios.get.mock.calls[0][1]).toMatchObject({
      timeout: 12000,
      headers: {Accept: 'application/json'},
    });
    expect(result).toEqual({
      ok: true,
      entriesCount: 1,
      latestEntryDate: 1700000000000,
      authMethod: 'query',
    });
  });

  it('falls back to api-secret header auth if query auth fails', async () => {
    mockedAxios.get
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({data: []});

    const result = await testNightscoutConnection({
      baseUrl: 'https://example.com',
      apiSecretSha1: '55a342b44e4c1d0d3c293f90042af4251e150e32',
    });

    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(mockedAxios.get.mock.calls[1]).toEqual([
      '/api/v1/entries.json?count=1',
      {
        baseURL: 'https://example.com',
        timeout: 12000,
        headers: {
          Accept: 'application/json',
          'api-secret': '55a342b44e4c1d0d3c293f90042af4251e150e32',
        },
      },
    ]);
    expect(result).toEqual({
      ok: true,
      entriesCount: 0,
      latestEntryDate: undefined,
      authMethod: 'header',
    });
  });
});
