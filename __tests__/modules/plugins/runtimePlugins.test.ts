import {
  Es256RuntimePluginSignatureVerifier,
  InMemoryRuntimePluginRepository,
  KeyValueRuntimePluginRepository,
  RuntimePluginCapabilityBroker,
  RuntimePluginCapabilityError,
  RuntimePluginHostPort,
  RuntimePluginHostRequest,
  RuntimePluginHostResponse,
  RuntimePluginImplementation,
  RuntimePluginManager,
  RuntimePluginManifest,
  RuntimePluginManifestVerifier,
  RuntimePluginPersistenceSnapshot,
  RuntimePluginRepository,
  RuntimePluginScope,
  RuntimePluginSignatureVerifier,
  TrustedRuntimePluginSigningKey,
  VerifiedRuntimePluginManifest,
  canonicalJson,
  emptyRuntimePluginSnapshot,
  parseRuntimePluginManifest,
  sha256Hex,
} from '../../../src/modules/plugins';
import {
  BUILT_IN_RUNTIME_PLUGIN_IMPLEMENTATIONS,
  createRuntimeProductRegistries,
} from '../../../src/product/plugins';
import {
  createStoredDestinationTarget,
  resolveDestinationTarget,
} from '../../../src/product/destinations';

const SCOPE: RuntimePluginScope = {
  productUserId: 'user-1',
  workspaceId: 'workspace-1',
};
const NOW = Date.parse('2026-09-02T00:00:00.000Z');

const SIGNED_MANIFEST: RuntimePluginManifest = {
  schemaVersion: 1,
  kind: 'activation',
  payload: {
    extensionId: 'plugin.agp-guide',
    publisherId: 'shani.first-party',
    version: '1.0.0',
    hostApi: {minInclusive: 1, maxExclusive: 2},
    minAppVersion: {ios: '1.0.0', android: '1.0.0', web: '1.0.0'},
    implementationId: 'shani.first-party.agp-guide',
    extensionPointId: 'core.trends.learning-extensions',
    platforms: ['ios', 'android', 'web'],
    requestedCapabilities: [],
    healthRisk: 'informational',
    issuedAt: '2026-09-01T00:00:00.000Z',
    expiresAt: '2027-08-31T00:00:00.000Z',
    enabled: true,
    rollout: {percentage: 100, salt: 'agp-guide-v1'},
    destination: {
      id: 'plugin.agp-guide',
      order: 40,
      copy: {
        en: {
          title: 'AGP guide',
          description: 'Learn how to read AGP and daily patterns.',
        },
        he: {
          title: 'מדריך AGP',
          description: 'איך לקרוא AGP ודפוסים יומיים.',
        },
      },
      targetPolicy: {favorite: true, start: false, shortcut: true},
    },
  },
  payloadSha256:
    '8ac4bc2270b136329c5bc0e13fe4094d81fd17c4a1dd904b23be154c61505a0e',
  signingKeyId: 'shani.keys.extensions-2026-01',
  signatureAlgorithm: 'ES256',
  signature:
    'aiW7PUnW8zg1YF1hD6_IB74I4hnmgS7CEdhAYOVlqYdaINJjzSu1p3hAqcgeoyavM6CxcFFDSDqeIoQb96psaw',
};

const TRUSTED_KEY: TrustedRuntimePluginSigningKey = {
  keyId: 'shani.keys.extensions-2026-01',
  publisherId: 'shani.first-party',
  publicKey:
    'BF8wseeXahVaHXbWmsJyKvMzQGSFdYyfvgSdqNp2s1KtoflR8M2PrCSmBv9oeHiElKZRORZf5Wmx4epYsHQFdFc',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2028-01-01T00:00:00.000Z',
};

const permissiveSignatureVerifier: RuntimePluginSignatureVerifier = {
  verify: async () => true,
};

const manifestFor = (input?: {
  readonly version?: string;
  readonly enabled?: boolean;
  readonly capabilities?: RuntimePluginManifest['payload']['requestedCapabilities'];
}): RuntimePluginManifest => {
  const payload = {
    ...SIGNED_MANIFEST.payload,
    version: input?.version ?? SIGNED_MANIFEST.payload.version,
    enabled: input?.enabled ?? true,
    requestedCapabilities:
      input?.capabilities ?? SIGNED_MANIFEST.payload.requestedCapabilities,
  };
  return {
    ...SIGNED_MANIFEST,
    payload,
    payloadSha256: sha256Hex(canonicalJson(payload)),
    signature: 'c2lnbmVk',
  };
};

const environment = {
  platform: 'web' as const,
  appVersion: '1.2.0',
  hostApiVersion: 1,
  nowMs: NOW,
};

const createVerifier = (
  implementations: readonly RuntimePluginImplementation[] =
    BUILT_IN_RUNTIME_PLUGIN_IMPLEMENTATIONS,
  signatureVerifier: RuntimePluginSignatureVerifier =
    permissiveSignatureVerifier,
) =>
  new RuntimePluginManifestVerifier({
    signatureVerifier,
    trustedKeys: [TRUSTED_KEY],
    implementations,
  });

describe('Runtime Plugin platform', () => {
  it('verifies a real ES256 signature and rejects tampering', async () => {
    const verifier = createVerifier(
      BUILT_IN_RUNTIME_PLUGIN_IMPLEMENTATIONS,
      new Es256RuntimePluginSignatureVerifier(),
    );

    await expect(
      verifier.verify(SIGNED_MANIFEST, {...environment, scope: SCOPE}),
    ).resolves.toMatchObject({
      payload: {extensionId: 'plugin.agp-guide', version: '1.0.0'},
    });

    await expect(
      verifier.verify(
        {
          ...SIGNED_MANIFEST,
          payload: {
            ...SIGNED_MANIFEST.payload,
            destination: {
              ...SIGNED_MANIFEST.payload.destination,
              order: 1,
            },
          },
        },
        {...environment, scope: SCOPE},
      ),
    ).rejects.toMatchObject({code: 'payload-hash-mismatch'});

    await expect(
      verifier.verify(
        {...SIGNED_MANIFEST, signature: `${SIGNED_MANIFEST.signature.slice(0, -1)}b`},
        {...environment, scope: SCOPE},
      ),
    ).rejects.toMatchObject({code: 'invalid-signature'});
  });

  it('strictly rejects unknown manifest fields and unshipped code', async () => {
    expect(() => parseRuntimePluginManifest(undefined)).toThrow(
      'manifest: expected a JSON object',
    );
    expect(() =>
      parseRuntimePluginManifest({...SIGNED_MANIFEST, codeUrl: 'https://bad'}),
    ).toThrow('manifest.codeUrl: unknown field');

    const manifest = manifestFor();
    const payload = {...manifest.payload, implementationId: 'unknown.code'};
    await expect(
      createVerifier().verify(
        {...manifest, payload, payloadSha256: sha256Hex(canonicalJson(payload))},
        {...environment, scope: SCOPE},
      ),
    ).rejects.toMatchObject({code: 'unknown-implementation'});
  });

  it('stages, health-checks, and atomically contributes a safe destination', async () => {
    const repository = new InMemoryRuntimePluginRepository();
    const manager = new RuntimePluginManager({
      repository,
      verifier: createVerifier(),
      implementations: BUILT_IN_RUNTIME_PLUGIN_IMPLEMENTATIONS,
      now: () => NOW,
    });

    await expect(
      manager.activate(SCOPE, manifestFor(), environment),
    ).resolves.toMatchObject({status: 'activated'});
    const snapshot = await manager.snapshot(SCOPE, environment);
    expect(snapshot.active).toHaveLength(1);
    expect(snapshot.audit.map(item => item.event)).toEqual([
      'staged',
      'activated',
    ]);

    const registries = createRuntimeProductRegistries(snapshot.active);
    const target = resolveDestinationTarget(
      registries.destinations,
      createStoredDestinationTarget('plugin.agp-guide'),
      'favorite',
      {platform: 'web'},
    );
    expect(target).toMatchObject({
      status: 'available',
      destination: {
        ownerModuleId: 'core.trends',
        implementationKey: 'PluginAgpGuide',
      },
    });
    if (target.status !== 'available') {
      throw new Error('Expected the verified plugin destination.');
    }
    expect(
      registries.implementations.render({
        destination: target,
        request: {destination: target},
        locale: 'en',
        runtime: {platform: 'web'},
        onOpenDestination: () => undefined,
        onOpenDestinationRequest: () => undefined,
        renderJournalUnavailable: () => null,
      }),
    ).toEqual(expect.anything());

    const trends = resolveDestinationTarget(
      registries.destinations,
      createStoredDestinationTarget('core.trends'),
      undefined,
      {platform: 'ios'},
    );
    if (trends.status !== 'available') {
      throw new Error('Expected Trends to be available.');
    }
    const renderedTrends = registries.implementations.render({
      destination: trends,
      request: {destination: trends},
      locale: 'en',
      registry: registries.destinations,
      runtime: {platform: 'ios'},
      onOpenDestination: () => undefined,
      onOpenDestinationRequest: () => undefined,
      renderJournalUnavailable: () => null,
    });
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        React.createElement(React.Fragment, undefined, renderedTrends),
      );
    });
    expect(
      tree!.root.findByProps({
        testID: 'trends-extension-plugin.agp-guide',
      }),
    ).toBeDefined();
    act(() => tree!.unmount());
  });

  it('keeps the active version and quarantines a failed staged version', async () => {
    let healthyVersion = '1.0.0';
    const implementation: RuntimePluginImplementation = {
      ...BUILT_IN_RUNTIME_PLUGIN_IMPLEMENTATIONS[0],
      healthCheck: async manifest =>
        manifest.payload.version === healthyVersion
          ? {ok: true}
          : {ok: false, reason: 'Self-check failed.'},
    };
    const repository = new InMemoryRuntimePluginRepository();
    const manager = new RuntimePluginManager({
      repository,
      verifier: createVerifier([implementation]),
      implementations: [implementation],
      now: () => NOW,
    });
    await manager.activate(SCOPE, manifestFor(), environment);
    healthyVersion = 'never';

    await expect(
      manager.activate(
        SCOPE,
        manifestFor({version: '1.1.0'}),
        environment,
      ),
    ).resolves.toMatchObject({
      status: 'quarantined',
      version: '1.1.0',
      keptVersion: '1.0.0',
    });
    const snapshot = await manager.snapshot(SCOPE, environment);
    expect(snapshot.active[0]?.manifest.payload.version).toBe('1.0.0');
    expect(snapshot.records[0]?.quarantine).toEqual([
      expect.objectContaining({version: '1.1.0', reason: 'Self-check failed.'}),
    ]);

    await expect(
      manager.activate(
        SCOPE,
        manifestFor({version: '1.1.0'}),
        environment,
      ),
    ).resolves.toMatchObject({status: 'quarantined'});
  });

  it('bounds a hanging health check and quarantines the staged version', async () => {
    const implementation: RuntimePluginImplementation = {
      ...BUILT_IN_RUNTIME_PLUGIN_IMPLEMENTATIONS[0],
      healthCheck: async () => new Promise(() => undefined),
    };
    const manager = new RuntimePluginManager({
      repository: new InMemoryRuntimePluginRepository(),
      verifier: createVerifier([implementation]),
      implementations: [implementation],
      healthTimeoutMs: 5,
      now: () => NOW,
    });

    await expect(
      manager.activate(SCOPE, manifestFor(), environment),
    ).resolves.toMatchObject({
      status: 'quarantined',
      reason: 'Health check timed out.',
    });
  });

  it('recovers interrupted staging and supports an explicit local rollback', async () => {
    const repository = new InMemoryRuntimePluginRepository();
    const manager = new RuntimePluginManager({
      repository,
      verifier: createVerifier(),
      implementations: BUILT_IN_RUNTIME_PLUGIN_IMPLEMENTATIONS,
      now: () => NOW,
    });
    await manager.activate(SCOPE, manifestFor(), environment);
    await manager.activate(
      SCOPE,
      manifestFor({version: '1.1.0'}),
      environment,
    );

    await expect(
      manager.rollback(SCOPE, 'plugin.agp-guide', environment, 'Regression'),
    ).resolves.toMatchObject({
      status: 'rolled-back',
      plugin: {manifest: {payload: {version: '1.0.0'}}},
    });

    const seeded = await repository.load(SCOPE);
    const activeRecord = seeded.records[0];
    if (!activeRecord?.active) {
      throw new Error('Expected an active record.');
    }
    await repository.commit(SCOPE, {
      ...seeded,
      records: [
        {
          ...activeRecord,
          staged: manifestFor({version: '1.2.0'}) as VerifiedRuntimePluginManifest,
        },
      ],
    });
    const recovered = await manager.snapshot(SCOPE, environment);
    expect(recovered.records[0]?.staged).toBeUndefined();
    expect(recovered.records[0]?.quarantine).toEqual(
      expect.arrayContaining([expect.objectContaining({version: '1.2.0'})]),
    );
    expect(recovered.audit[recovered.audit.length - 1]?.event).toBe(
      'recovered-staging',
    );
  });

  it('applies a signed disable manifest and blocks a silent downgrade', async () => {
    const repository = new InMemoryRuntimePluginRepository();
    const manager = new RuntimePluginManager({
      repository,
      verifier: createVerifier(),
      implementations: BUILT_IN_RUNTIME_PLUGIN_IMPLEMENTATIONS,
      now: () => NOW,
    });
    await manager.activate(SCOPE, manifestFor(), environment);

    await expect(
      manager.activate(
        SCOPE,
        manifestFor({version: '1.1.0', enabled: false}),
        environment,
      ),
    ).resolves.toMatchObject({status: 'disabled', version: '1.1.0'});
    await expect(manager.snapshot(SCOPE, environment)).resolves.toMatchObject({
      active: [],
      records: [expect.objectContaining({disabledByVersion: '1.1.0'})],
    });
    await expect(
      manager.activate(SCOPE, manifestFor(), environment),
    ).rejects.toMatchObject({code: 'downgrade-blocked'});
  });

  it('re-verifies cached manifests before exposing their destination', async () => {
    const repository = new InMemoryRuntimePluginRepository();
    const manager = new RuntimePluginManager({
      repository,
      verifier: createVerifier(),
      implementations: BUILT_IN_RUNTIME_PLUGIN_IMPLEMENTATIONS,
      now: () => NOW,
    });
    await manager.activate(SCOPE, manifestFor(), environment);
    const stored = await repository.load(SCOPE);
    const record = stored.records[0];
    if (!record?.active) {
      throw new Error('Expected an active plugin.');
    }
    await repository.commit(SCOPE, {
      ...stored,
      records: [
        {
          ...record,
          active: {
            ...record.active,
            manifest: {
              ...record.active.manifest,
              payload: {
                ...record.active.manifest.payload,
                destination: {
                  ...record.active.manifest.payload.destination,
                  order: 1,
                },
              },
            },
          },
        },
      ],
    });

    const recovered = await manager.snapshot(SCOPE, environment);
    expect(recovered.active).toEqual([]);
    expect(recovered.records[0]?.active).toBeUndefined();
    expect(recovered.records[0]?.quarantine).toEqual([
      expect.objectContaining({
        version: '1.0.0',
        reason: expect.stringContaining('signed digest'),
      }),
    ]);
  });

  it('falls back to the last known good plugin after cached tampering', async () => {
    const repository = new InMemoryRuntimePluginRepository();
    const manager = new RuntimePluginManager({
      repository,
      verifier: createVerifier(),
      implementations: BUILT_IN_RUNTIME_PLUGIN_IMPLEMENTATIONS,
      now: () => NOW,
    });
    await manager.activate(SCOPE, manifestFor(), environment);
    await manager.activate(
      SCOPE,
      manifestFor({version: '1.1.0'}),
      environment,
    );
    const stored = await repository.load(SCOPE);
    const record = stored.records[0];
    if (!record?.active) {
      throw new Error('Expected an active plugin.');
    }
    await repository.commit(SCOPE, {
      ...stored,
      records: [
        {
          ...record,
          active: {
            ...record.active,
            manifest: {
              ...record.active.manifest,
              payloadSha256: '0'.repeat(64),
            },
          },
        },
      ],
    });

    const recovered = await manager.snapshot(SCOPE, environment);
    expect(recovered.active[0]?.manifest.payload.version).toBe('1.0.0');
    expect(recovered.records[0]?.quarantine).toEqual([
      expect.objectContaining({version: '1.1.0'}),
    ]);
    expect(recovered.audit.map(item => item.event).slice(-2)).toEqual([
      'cached-verification-failed',
      'rolled-back',
    ]);
  });

  it('requires a versioned Workspace grant and revokes it immediately', async () => {
    const implementation: RuntimePluginImplementation = {
      ...BUILT_IN_RUNTIME_PLUGIN_IMPLEMENTATIONS[0],
      allowedCapabilities: ['glucose.summary.read'],
    };
    const repository = new InMemoryRuntimePluginRepository();
    const manager = new RuntimePluginManager({
      repository,
      verifier: createVerifier([implementation]),
      implementations: [implementation],
      now: () => NOW,
    });
    const pending = await manager.activate(
      SCOPE,
      manifestFor({capabilities: ['glucose.summary.read']}),
      environment,
    );
    expect(pending).toMatchObject({
      status: 'grant-required',
      missingCapabilities: ['glucose.summary.read'],
    });
    if (pending.status !== 'grant-required') {
      throw new Error('Expected a grant request.');
    }
    await manager.grant(SCOPE, pending.manifest, ['glucose.summary.read']);
    const activated = await manager.activate(
      SCOPE,
      manifestFor({capabilities: ['glucose.summary.read']}),
      environment,
    );
    if (activated.status !== 'activated') {
      throw new Error('Expected activation after consent.');
    }

    let leakExtraField = false;
    const host: RuntimePluginHostPort = {
      execute: async <Request extends RuntimePluginHostRequest>(
        request: Request,
      ): Promise<RuntimePluginHostResponse<Request>> => {
        if (request.capability === 'glucose.summary.read') {
          return {
            unit: 'mg/dL',
            startMs: request.startMs,
            endMs: request.endMs,
            sampleCount: 24,
            meanMgDl: 123,
            timeInRangePercent: 75,
            ...(leakExtraField ? {apiKey: 'must-not-cross-the-seam'} : {}),
          } as RuntimePluginHostResponse<Request>;
        }
        return {opened: true} as RuntimePluginHostResponse<Request>;
      },
    };
    const broker = new RuntimePluginCapabilityBroker(manager, host);
    const session = {scope: SCOPE, manifest: activated.plugin.manifest};
    await expect(
      broker.request(session, {
        capability: 'glucose.summary.read',
        startMs: NOW - 24 * 60 * 60 * 1000,
        endMs: NOW,
      }),
    ).resolves.toMatchObject({sampleCount: 24, meanMgDl: 123});
    expect(
      (await repository.load(SCOPE)).audit.map(item => ({
        event: item.event,
        detail: item.detail,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          event: 'capability-succeeded',
          detail: `rangeMs=${24 * 60 * 60 * 1000};sampleCount=24`,
        },
      ]),
    );
    await expect(
      broker.request(
        session,
        {
          capability: 'glucose.summary.read',
          startMs: NOW - 1,
          endMs: NOW,
          apiKey: 'must-not-cross-the-seam',
        } as Parameters<RuntimePluginCapabilityBroker['request']>[1],
      ),
    ).rejects.toMatchObject({code: 'invalid-request'});
    leakExtraField = true;
    await expect(
      broker.request(session, {
        capability: 'glucose.summary.read',
        startMs: NOW - 1,
        endMs: NOW,
      }),
    ).rejects.toMatchObject({code: 'invalid-host-response'});

    await manager.revoke(SCOPE, {
      extensionId: 'plugin.agp-guide',
      publisherId: 'shani.first-party',
      majorVersion: 1,
    });
    await expect(
      broker.request(session, {
        capability: 'glucose.summary.read',
        startMs: NOW - 1,
        endMs: NOW,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<RuntimePluginCapabilityError>>({
        code: 'permission-denied',
      }),
    );

    await expect(
      manager.activate(
        SCOPE,
        manifestFor({
          version: '2.0.0',
          capabilities: ['glucose.summary.read'],
        }),
        environment,
      ),
    ).resolves.toMatchObject({status: 'grant-required'});
  });

  it('recovers an interrupted key-value commit from its write-ahead record', async () => {
    const values = new Map<string, string>();
    let failSecondWrite = true;
    let writeCount = 0;
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        writeCount += 1;
        if (failSecondWrite && writeCount === 2) {
          throw new Error('Power loss');
        }
        values.set(key, value);
      },
      removeItem: async (key: string) => {
        values.delete(key);
      },
    };
    const repository = new KeyValueRuntimePluginRepository(storage);
    const expected: RuntimePluginPersistenceSnapshot = {
      ...emptyRuntimePluginSnapshot(),
      audit: [
        {
          id: 'audit-1',
          timestampMs: NOW,
          extensionId: 'plugin.agp-guide',
          version: '1.0.0',
          event: 'staged',
        },
      ],
    };
    await expect(repository.commit(SCOPE, expected)).rejects.toThrow(
      'Power loss',
    );
    failSecondWrite = false;
    await expect(repository.load(SCOPE)).resolves.toEqual(expected);
    expect(values.size).toBe(1);
  });

  it('serializes overlapping activations per Workspace', async () => {
    const inner = new InMemoryRuntimePluginRepository();
    let concurrentCommits = 0;
    let maxConcurrentCommits = 0;
    const repository: RuntimePluginRepository = {
      load: scope => inner.load(scope),
      commit: async (scope, snapshot) => {
        concurrentCommits += 1;
        maxConcurrentCommits = Math.max(maxConcurrentCommits, concurrentCommits);
        await Promise.resolve();
        await inner.commit(scope, snapshot);
        concurrentCommits -= 1;
      },
    };
    const manager = new RuntimePluginManager({
      repository,
      verifier: createVerifier(),
      implementations: BUILT_IN_RUNTIME_PLUGIN_IMPLEMENTATIONS,
      now: () => NOW,
    });
    await Promise.all([
      manager.activate(SCOPE, manifestFor(), environment),
      manager.activate(
        SCOPE,
        manifestFor({version: '1.1.0'}),
        environment,
      ),
    ]);
    expect(maxConcurrentCommits).toBe(1);
    const snapshot = await manager.snapshot(SCOPE, environment);
    expect(snapshot.active[0]?.manifest.payload.version).toBe('1.1.0');
  });
});
import React from 'react';
import renderer, {act} from 'react-test-renderer';
