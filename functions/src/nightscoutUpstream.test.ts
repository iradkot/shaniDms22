import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isPublicIpAddress,
  NightscoutUpstream,
  NightscoutUpstreamError,
  normalizeNightscoutBaseUrl,
} from './nightscoutUpstream';

const credential = {
  url: 'https://nightscout.example/',
  apiSecretSha1: 'a'.repeat(40),
};

test('reads complete effective profile history instead of latest-only singular profile', async () => {
  const startMs = Date.parse('2026-10-07T00:00:00Z');
  const rows = [-1, 1, 2].map(hour => ({
    startDate: new Date(startMs + hour * 3_600_000).toISOString(),
    defaultProfile: 'Default',
    store: {Default: {basal: [{time: '00:00', value: hour === 2 ? 2 : 1}]}},
  }));
  const urls: URL[] = [];
  const upstream = new NightscoutUpstream(
    async () => [{address: '8.8.8.8', family: 4}],
    async url => {
      urls.push(url);
      const through = Date.parse(
        url.searchParams.get('find[startDate][$lte]')!,
      );
      const after = url.searchParams.has('find[startDate][$gt]')
        ? Date.parse(url.searchParams.get('find[startDate][$gt]')!)
        : -Infinity;
      return rows
        .filter(
          row =>
            +new Date(row.startDate) <= through &&
            +new Date(row.startDate) > after,
        )
        .reverse()
        .slice(0, Number(url.searchParams.get('count')));
    },
  );
  assert.deepEqual(
    await upstream.range(credential, {
      version: 1,
      kind: 'profile',
      profileHistory: true,
      startMs,
      endMs: startMs + 3 * 3_600_000,
    }),
    [rows[0], rows[2], rows[1]],
  );
  assert.equal(urls.length, 3);
  assert.ok(urls.every(url => url.pathname === '/api/v1/profiles.json'));
  assert.equal(
    urls[2]?.searchParams.get('find[startDate][$gt]'),
    new Date(startMs).toISOString(),
  );
  assert.equal(
    urls[2]?.searchParams.get('find[startDate][$lte]'),
    new Date(startMs + 3 * 3_600_000 - 1).toISOString(),
  );
});

test('profile history fails closed on a saturated bounded history', async () => {
  const startMs = Date.parse('2026-10-07T00:00:00Z');
  const upstream = new NightscoutUpstream(
    async () => [{address: '8.8.8.8', family: 4}],
    async url =>
      Array.from({length: Number(url.searchParams.get('count'))}, () => ({
        startDate: new Date(
          url.searchParams.has('find[startDate][$gt]')
            ? startMs + 3_600_000
            : Date.parse(url.searchParams.get('find[startDate][$lte]')!),
        ).toISOString(),
      })),
  );
  await assert.rejects(
    upstream.range(credential, {
      version: 1,
      kind: 'profile',
      profileHistory: true,
      startMs,
      endMs: startMs + 3 * 3_600_000,
    }),
    error =>
      error instanceof NightscoutUpstreamError &&
      error.code === 'incomplete_nightscout_profile_history',
  );
});

for (const hasUpdate of [false, true]) {
  test(`same-time carry-in uploads are all preserved (intraday update=${hasUpdate})`, async () => {
    const startMs = Date.parse('2026-10-07T00:00:00Z');
    const effective = new Date(startMs - 3_600_000).toISOString();
    const rows = [
      {
        startDate: effective,
        store: {Default: {basal: [{time: '00:00', value: 1}]}},
      },
      {
        startDate: effective,
        store: {Default: {basal: [{time: '00:00', value: 2}]}},
      },
      ...(hasUpdate
        ? [{startDate: new Date(startMs + 3_600_000).toISOString()}]
        : []),
    ];
    const urls: URL[] = [];
    const upstream = new NightscoutUpstream(
      async () => [{address: '8.8.8.8', family: 4}],
      async url => {
        urls.push(url);
        const through = Date.parse(
          url.searchParams.get('find[startDate][$lte]')!,
        );
        const after = url.searchParams.has('find[startDate][$gt]')
          ? Date.parse(url.searchParams.get('find[startDate][$gt]')!)
          : -Infinity;
        const atOrAfter = url.searchParams.has('find[startDate][$gte]')
          ? Date.parse(url.searchParams.get('find[startDate][$gte]')!)
          : -Infinity;
        return rows
          .filter(row => {
            const effectiveMs = Date.parse(row.startDate);
            return (
              effectiveMs <= through &&
              effectiveMs > after &&
              effectiveMs >= atOrAfter
            );
          })
          .sort(
            (left, right) =>
              Date.parse(right.startDate) - Date.parse(left.startDate),
          )
          .slice(0, Number(url.searchParams.get('count')));
      },
    );
    const result = (await upstream.range(credential, {
      version: 1,
      kind: 'profile',
      profileHistory: true,
      startMs,
      endMs: startMs + 3 * 3_600_000,
    })) as typeof rows;
    assert.equal(result.length, rows.length);
    assert.equal(result.filter(row => row.startDate === effective).length, 2);
    const tiedRead = urls.find(url =>
      url.searchParams.has('find[startDate][$gte]'),
    );
    assert.equal(
      tiedRead?.searchParams.get('find[startDate][$gte]'),
      effective,
    );
    assert.equal(
      tiedRead?.searchParams.get('find[startDate][$lte]'),
      effective,
    );
  });
}

test('same-time history fails closed at the shared 1000-row maximum', async () => {
  const startMs = Date.parse('2026-10-07T00:00:00Z');
  const effective = new Date(startMs - 3_600_000).toISOString();
  const counts: number[] = [];
  const upstream = new NightscoutUpstream(
    async () => [{address: '8.8.8.8', family: 4}],
    async url => {
      const count = Number(url.searchParams.get('count'));
      if (url.searchParams.has('find[startDate][$gte]')) counts.push(count);
      return Array.from({length: count}, () => ({startDate: effective}));
    },
  );
  await assert.rejects(
    upstream.range(credential, {
      version: 1,
      kind: 'profile',
      profileHistory: true,
      startMs,
      endMs: startMs + 3 * 3_600_000,
    }),
    error =>
      error instanceof NightscoutUpstreamError &&
      error.code === 'incomplete_nightscout_profile_history',
  );
  assert.deepEqual(counts, [100, 200, 400, 800, 1000]);
});

test('failed equality read never falls back to the truncated latest probe', async () => {
  const startMs = Date.parse('2026-10-07T00:00:00Z');
  const row = {startDate: new Date(startMs - 3_600_000).toISOString()};
  const upstream = new NightscoutUpstream(
    async () => [{address: '8.8.8.8', family: 4}],
    async url => {
      if (url.searchParams.has('find[startDate][$gte]'))
        throw new Error('equality offline');
      return [row, row];
    },
  );
  await assert.rejects(
    upstream.range(credential, {
      version: 1,
      kind: 'profile',
      profileHistory: true,
      startMs,
      endMs: startMs + 3 * 3_600_000,
    }),
  );
});

test('validates subject permissions and forwards the raw token for actual glucose access', async () => {
  const accessToken = 'shani-0123456789abcdef';
  const calls: URL[] = [];
  const upstream = new NightscoutUpstream(
    async () => [{address: '8.8.8.8', family: 4}],
    async (url, secret) => {
      calls.push(url);
      assert.equal(secret, accessToken);
      return url.pathname.includes('/authorization/')
        ? {permissionGroups: [['*:*:read']]}
        : [{date: 1700000000000, sgv: 120}];
    },
  );
  await upstream.validateCredential({
    ...credential,
    apiSecretSha1: '',
    accessToken,
  });
  assert.equal(
    calls[0]?.pathname,
    `/api/v2/authorization/request/${accessToken}`,
  );
  assert.equal(calls[1]?.pathname, '/api/v1/entries/sgv.json');
  assert.equal(calls[1]?.searchParams.has('token'), false);
});

test('rejects default/custom write and admin permissions before any data read', async () => {
  for (const grant of [
    '*',
    'api:treatments:create',
    'admin:api:read',
    'api:*:read,update',
  ]) {
    let calls = 0;
    const upstream = new NightscoutUpstream(
      async () => [{address: '8.8.8.8', family: 4}],
      async () => {
        calls += 1;
        return {permissionGroups: [['*:*:read'], [grant]]};
      },
    );
    await assert.rejects(
      upstream.validateCredential({
        ...credential,
        apiSecretSha1: '',
        accessToken: 'shani-0123456789abcdef',
      }),
      (error: unknown) =>
        error instanceof NightscoutUpstreamError &&
        error.code === 'nightscout_read_only_required',
    );
    assert.equal(calls, 1);
  }
});

test('does not fall back to public reads after a subject token has been revoked', async () => {
  let calls = 0;
  const upstream = new NightscoutUpstream(
    async () => [{address: '8.8.8.8', family: 4}],
    async () => {
      calls += 1;
      throw new NightscoutUpstreamError(
        401,
        'nightscout_credential_rejected',
        'Nightscout rejected the credential',
      );
    },
  );
  await assert.rejects(
    upstream.validateCredential({
      ...credential,
      apiSecretSha1: '',
      accessToken: 'revoked-0123456789abcdef',
    }),
    (error: unknown) =>
      error instanceof NightscoutUpstreamError && error.status === 401,
  );
  assert.equal(calls, 1);
});

test('normalizes only clean HTTPS Nightscout base URLs', () => {
  assert.equal(
    normalizeNightscoutBaseUrl('https://nightscout.example/base'),
    'https://nightscout.example/base/',
  );
  for (const invalid of [
    'http://nightscout.example',
    'https://user:secret@nightscout.example',
    'https://nightscout.example:8443',
    'https://nightscout.example/?token=secret',
    'https://nightscout.example/#fragment',
  ]) {
    assert.throws(
      () => normalizeNightscoutBaseUrl(invalid),
      NightscoutUpstreamError,
    );
  }
});

test('classifies local, private and metadata addresses as unsafe', () => {
  for (const unsafe of [
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '0:0:0:0:0:0:0:0',
    '0:0:0:0:0:0:0:1',
    '2001:0db8:0:0:0:0:0:1',
  ]) {
    assert.equal(isPublicIpAddress(unsafe), false, unsafe);
  }
  assert.equal(isPublicIpAddress('8.8.8.8'), true);
  assert.equal(isPublicIpAddress('2606:4700:4700::1111'), true);
});

test('classifies every private IPv4 range in canonical mapped IPv6 form as unsafe', () => {
  for (const unsafe of [
    '::ffff:0:1',
    '::ffff:a00:1',
    '::ffff:6440:1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '::ffff:ac10:1',
    '::ffff:c000:1',
    '::ffff:c000:201',
    '::ffff:c0a8:101',
    '::ffff:c612:1',
    '::ffff:c633:6401',
    '::ffff:cb00:7101',
    '::ffff:e000:1',
    '::ffff:f000:1',
    '0:0:0:0:0:ffff:7f00:1',
    '0:0:0:0:0:ffff:127.0.0.1',
    '::FFFF:A9FE:A9FE',
    '::ffff:7f00:1%lo',
  ]) {
    assert.equal(isPublicIpAddress(unsafe), false, unsafe);
  }

  for (const safe of [
    '::ffff:808:808',
    '::ffff:8.8.8.8',
    '0:0:0:0:0:ffff:101:101',
  ]) {
    assert.equal(isPublicIpAddress(safe), true, safe);
  }
});

test('blocks hexadecimal IPv4-mapped private DNS answers before transport', async () => {
  for (const address of ['::ffff:7f00:1', '::ffff:a9fe:a9fe']) {
    let transportCalls = 0;
    const upstream = new NightscoutUpstream(
      async () => [{address, family: 6}],
      async () => {
        transportCalls += 1;
        return {};
      },
    );

    await assert.rejects(
      upstream.validateCredential(credential),
      (error: unknown) =>
        error instanceof NightscoutUpstreamError &&
        error.code === 'nightscout_host_denied',
      address,
    );
    assert.equal(transportCalls, 0, address);
  }
});

test('rejects all DNS answers when one is a mapped private address', async () => {
  let transportCalls = 0;
  const upstream = new NightscoutUpstream(
    async () => [
      {address: '2606:4700:4700::1111', family: 6},
      {address: '0:0:0:0:0:ffff:a9fe:a9fe', family: 6},
    ],
    async () => {
      transportCalls += 1;
      return {};
    },
  );

  await assert.rejects(
    upstream.validateCredential(credential),
    (error: unknown) =>
      error instanceof NightscoutUpstreamError &&
      error.code === 'nightscout_host_denied',
  );
  assert.equal(transportCalls, 0);
});

test('blocks DNS answers containing any private address before transport', async () => {
  let transportCalls = 0;
  const upstream = new NightscoutUpstream(
    async () => [
      {address: '8.8.8.8', family: 4},
      {address: '169.254.169.254', family: 4},
    ],
    async () => {
      transportCalls += 1;
      return {};
    },
  );

  await assert.rejects(
    upstream.validateCredential(credential),
    (error: unknown) =>
      error instanceof NightscoutUpstreamError &&
      error.code === 'nightscout_host_denied',
  );
  assert.equal(transportCalls, 0);
});

test('pins a validated public address and builds bounded API queries', async () => {
  const calls: string[] = [];
  const upstream = new NightscoutUpstream(
    async () => [{address: '8.8.8.8', family: 4}],
    async (url, secret, address) => {
      calls.push(url.toString());
      assert.equal(secret, credential.apiSecretSha1);
      assert.equal(address.address, '8.8.8.8');
      return [];
    },
  );

  await upstream.range(credential, {
    version: 1,
    kind: 'entries',
    startMs: 1_700_000_000_000,
    endMs: 1_700_086_400_000,
  });

  const url = new URL(calls[0] ?? '');
  assert.equal(url.pathname, '/api/v1/entries/sgv.json');
  assert.equal(url.searchParams.get('find[date][$gte]'), '1700000000000');
  assert.equal(url.searchParams.get('find[date][$lte]'), '1700086400000');
});

test('preserves and pins a validated public IPv6 DNS answer', async () => {
  const publicIpv6 = '2606:4700:4700::1111';
  let resolverHostname = '';
  let pinnedAddress: {address: string; family: 4 | 6} | undefined;
  const upstream = new NightscoutUpstream(
    async hostname => {
      resolverHostname = hostname;
      return [{address: publicIpv6, family: 6}];
    },
    async (_url, _secret, address) => {
      pinnedAddress = address;
      return {};
    },
  );

  await upstream.validateCredential(credential);

  assert.equal(resolverHostname, 'nightscout.example');
  assert.deepEqual(pinnedAddress, {address: publicIpv6, family: 6});
});

test('uses a small bounded devicestatus query', async () => {
  const calls: string[] = [];
  const upstream = new NightscoutUpstream(
    async () => [{address: '8.8.8.8', family: 4}],
    async url => {
      calls.push(url.toString());
      return [];
    },
  );
  const startMs = 1_700_000_000_000;
  const endMs = startMs + 2 * 60 * 60 * 1_000;

  await upstream.range(credential, {
    version: 1,
    kind: 'devicestatus',
    startMs,
    endMs,
  });

  const url = new URL(calls[0] ?? '');
  assert.equal(url.pathname, '/api/v1/devicestatus.json');
  assert.equal(
    url.searchParams.get('find[created_at][$gte]'),
    new Date(startMs).toISOString(),
  );
  assert.equal(
    url.searchParams.get('find[created_at][$lte]'),
    new Date(endMs).toISOString(),
  );
  assert.equal(url.searchParams.get('count'), '500');
});
