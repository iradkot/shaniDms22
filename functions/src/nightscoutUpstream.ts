import {lookup} from 'node:dns/promises';
import {request as httpsRequest} from 'node:https';
import {isIP} from 'node:net';

import type {
  NightscoutRangeKind,
  NightscoutRangeRequest,
} from './contracts';
import type {NightscoutCredential} from './nightscoutVault';

export class NightscoutUpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'NightscoutUpstreamError';
  }
}

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export type NightscoutDnsResolver = (
  hostname: string,
) => Promise<readonly ResolvedAddress[]>;

export type NightscoutHttpTransport = (
  url: URL,
  apiSecretSha1: string,
  resolved: ResolvedAddress,
  timeoutMs: number,
) => Promise<unknown>;

const MAX_RESPONSE_BYTES = 6_000_000;

const ipv4Number = (address: string): number | null => {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return null;
  }
  return (
    (((octets[0] ?? 0) << 24) >>> 0) +
    ((octets[1] ?? 0) << 16) +
    ((octets[2] ?? 0) << 8) +
    (octets[3] ?? 0)
  ) >>> 0;
};

const inIpv4Cidr = (address: number, base: number, prefix: number): boolean => {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) >>> 0 === (base & mask) >>> 0;
};

const PRIVATE_IPV4_RANGES: readonly [number, number][] = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0000200, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xc6336400, 24],
  [0xcb007100, 24],
  [0xe0000000, 4],
  [0xf0000000, 4],
];

type Ipv6Words = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

const isPublicIpv4Number = (address: number): boolean =>
  !PRIVATE_IPV4_RANGES.some(([base, prefix]) =>
    inIpv4Cidr(address, base, prefix),
  );

const parseIpv6Words = (address: string): Ipv6Words | null => {
  if (isIP(address) !== 6) return null;

  let normalized = (address.split('%', 1)[0] ?? '').toLowerCase();
  if (normalized.includes('.')) {
    const separator = normalized.lastIndexOf(':');
    const ipv4 = ipv4Number(normalized.slice(separator + 1));
    if (separator < 0 || ipv4 === null) return null;
    normalized = `${normalized.slice(0, separator + 1)}${(
      ipv4 >>> 16
    ).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] === '' ? [] : (halves[0]?.split(':') ?? []);
  const right =
    halves.length === 1 || halves[1] === ''
      ? []
      : (halves[1]?.split(':') ?? []);
  const omitted = 8 - left.length - right.length;
  const groups =
    halves.length === 2
      ? [...left, ...Array<string>(omitted).fill('0'), ...right]
      : left;
  if (
    groups.length !== 8 ||
    omitted < (halves.length === 2 ? 1 : 0) ||
    groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))
  ) {
    return null;
  }
  return groups.map(group => Number.parseInt(group, 16)) as unknown as Ipv6Words;
};

/** Rejects loopback, private, link-local, documentation and reserved ranges. */
export const isPublicIpAddress = (address: string): boolean => {
  const family = isIP(address);
  if (family === 4) {
    const numeric = ipv4Number(address);
    return numeric !== null && isPublicIpv4Number(numeric);
  }
  if (family !== 6) return false;

  const words = parseIpv6Words(address);
  if (words === null) return false;
  const isMappedIpv4 =
    words[0] === 0 &&
    words[1] === 0 &&
    words[2] === 0 &&
    words[3] === 0 &&
    words[4] === 0 &&
    words[5] === 0xffff;
  if (isMappedIpv4) {
    const mapped = ((words[6] << 16) | words[7]) >>> 0;
    return isPublicIpv4Number(mapped);
  }

  const isUnspecified = words.every(word => word === 0);
  const isLoopback =
    words.slice(0, 7).every(word => word === 0) && words[7] === 1;
  return !(
    isUnspecified ||
    isLoopback ||
    (words[0] & 0xfe00) === 0xfc00 ||
    (words[0] & 0xffc0) === 0xfe80 ||
    (words[0] & 0xff00) === 0xff00 ||
    (words[0] === 0x2001 && words[1] === 0x0db8)
  );
};

export const normalizeNightscoutBaseUrl = (raw: string): string => {
  let value: URL;
  try {
    value = new URL(raw.trim());
  } catch {
    throw new NightscoutUpstreamError(
      400,
      'invalid_nightscout_url',
      'Invalid Nightscout URL',
    );
  }
  if (
    value.protocol !== 'https:' ||
    value.username !== '' ||
    value.password !== '' ||
    (value.port !== '' && value.port !== '443') ||
    value.search !== '' ||
    value.hash !== '' ||
    value.hostname.length === 0
  ) {
    throw new NightscoutUpstreamError(
      400,
      'invalid_nightscout_url',
      'Nightscout must use a clean HTTPS URL',
    );
  }
  const segments = value.pathname
    .split('/')
    .filter(Boolean)
    .map(segment => {
      try {
        return decodeURIComponent(segment);
      } catch {
        throw new NightscoutUpstreamError(
          400,
          'invalid_nightscout_url',
          'Invalid Nightscout URL path',
        );
      }
    });
  if (
    segments.some(
      segment =>
        segment === '.' ||
        segment === '..' ||
        !/^[A-Za-z0-9._~-]{1,128}$/.test(segment),
    )
  ) {
    throw new NightscoutUpstreamError(
      400,
      'invalid_nightscout_url',
      'Invalid Nightscout URL path',
    );
  }
  value.pathname = `${segments.length > 0 ? `/${segments.join('/')}` : ''}/`;
  return value.toString();
};

const defaultResolver: NightscoutDnsResolver = async hostname => {
  if (isIP(hostname) !== 0) {
    return [{address: hostname, family: isIP(hostname) as 4 | 6}];
  }
  const addresses = await lookup(hostname, {all: true, verbatim: true});
  return addresses.flatMap(value =>
    value.family === 4 || value.family === 6
      ? [{address: value.address, family: value.family}]
      : [],
  );
};

const defaultTransport: NightscoutHttpTransport = (
  url,
  apiSecretSha1,
  resolved,
  timeoutMs,
) =>
  new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'api-secret': apiSecretSha1,
          'User-Agent': 'ShaniDMS-Nightscout-Proxy/1',
        },
        lookup: (_hostname, _options, callback) => {
          callback(null, resolved.address, resolved.family);
        },
      },
      response => {
        const status = response.statusCode ?? 502;
        if (status >= 300 && status < 400) {
          response.resume();
          reject(
            new NightscoutUpstreamError(
              502,
              'nightscout_redirect_denied',
              'Nightscout redirects are not allowed',
            ),
          );
          return;
        }
        const contentLength = Number(response.headers['content-length'] ?? 0);
        if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
          response.destroy();
          reject(
            new NightscoutUpstreamError(
              502,
              'nightscout_response_too_large',
              'Nightscout response is too large',
            ),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.length;
          if (bytes > MAX_RESPONSE_BYTES) {
            response.destroy();
            reject(
              new NightscoutUpstreamError(
                502,
                'nightscout_response_too_large',
                'Nightscout response is too large',
              ),
            );
            return;
          }
          chunks.push(buffer);
        });
        response.on('end', () => {
          if (status < 200 || status >= 300) {
            reject(
              new NightscoutUpstreamError(
                status === 401 || status === 403 ? 401 : 502,
                status === 401 || status === 403
                  ? 'nightscout_credential_rejected'
                  : 'nightscout_upstream_error',
                status === 401 || status === 403
                  ? 'Nightscout rejected the credential'
                  : 'Nightscout request failed',
              ),
            );
            return;
          }
          try {
            const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (typeof parsed !== 'object' || parsed === null) {
              throw new Error('JSON value must be an object or array');
            }
            resolve(parsed);
          } catch {
            reject(
              new NightscoutUpstreamError(
                502,
                'invalid_nightscout_response',
                'Nightscout returned invalid JSON',
              ),
            );
          }
        });
      },
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy(
        new NightscoutUpstreamError(
          504,
          'nightscout_timeout',
          'Nightscout timed out',
        ),
      );
    });
    request.on('error', error => {
      reject(
        error instanceof NightscoutUpstreamError
          ? error
          : new NightscoutUpstreamError(
              502,
              'nightscout_unavailable',
              'Nightscout is unavailable',
            ),
      );
    });
    request.end();
  });

const apiUrl = (baseUrl: string, relativePath: string): URL =>
  new URL(relativePath, baseUrl);

const rangeUrl = (
  credential: NightscoutCredential,
  range: NightscoutRangeRequest,
): URL => {
  const routeFor: Record<NightscoutRangeKind, string> = {
    entries: 'api/v1/entries/sgv.json',
    treatments: 'api/v1/treatments.json',
    profile: 'api/v1/profile.json',
    devicestatus: 'api/v1/devicestatus.json',
  };
  const url = apiUrl(credential.url, routeFor[range.kind]);
  if (range.kind === 'entries') {
    url.searchParams.set('find[date][$gte]', String(range.startMs));
    url.searchParams.set('find[date][$lte]', String(range.endMs));
    url.searchParams.set('count', '15000');
  } else if (
    range.kind === 'treatments' ||
    range.kind === 'devicestatus'
  ) {
    url.searchParams.set(
      'find[created_at][$gte]',
      new Date(range.startMs).toISOString(),
    );
    url.searchParams.set(
      'find[created_at][$lte]',
      new Date(range.endMs).toISOString(),
    );
    url.searchParams.set('count', range.kind === 'devicestatus' ? '500' : '5000');
  } else {
    url.searchParams.set('count', '1');
  }
  return url;
};

export class NightscoutUpstream {
  constructor(
    private readonly resolver: NightscoutDnsResolver = defaultResolver,
    private readonly transport: NightscoutHttpTransport = defaultTransport,
    private readonly timeoutMs = 30_000,
  ) {}

  private async request(
    credential: NightscoutCredential,
    url: URL,
  ): Promise<unknown> {
    const addresses = await this.resolver(url.hostname);
    if (
      addresses.length === 0 ||
      addresses.some(address => !isPublicIpAddress(address.address))
    ) {
      throw new NightscoutUpstreamError(
        400,
        'nightscout_host_denied',
        'Nightscout host is not publicly routable',
      );
    }
    const selected = addresses[0];
    if (selected === undefined) {
      throw new NightscoutUpstreamError(
        502,
        'nightscout_unavailable',
        'Nightscout host could not be resolved',
      );
    }
    return this.transport(
      url,
      credential.apiSecretSha1,
      selected,
      this.timeoutMs,
    );
  }

  async validateCredential(credential: NightscoutCredential): Promise<void> {
    await this.request(credential, apiUrl(credential.url, 'api/v1/status.json'));
  }

  range(
    credential: NightscoutCredential,
    range: NightscoutRangeRequest,
  ): Promise<unknown> {
    return this.request(credential, rangeUrl(credential, range));
  }
}
