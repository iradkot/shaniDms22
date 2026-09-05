import {
  CORE_DESTINATIONS,
  CORE_DESTINATION_IDS,
  CORE_IMPLEMENTATION_KEY_LIST,
  CORE_IMPLEMENTATION_KEYS,
  DESTINATION_GROUPS,
  DestinationDefinition,
  DestinationRegistry,
  DestinationValidationError,
  coreDestinationRegistry,
  createStoredDestinationTarget,
  destinationId,
  isCoreImplementationKey,
  resolveDestinationTarget,
  safeParseStoredDestinationTarget,
  assertCoreImplementationKeyCoverage,
} from 'app/product/destinations';

const iosRuntime = {platform: 'ios' as const};

describe('Product Destination Registry', () => {
  it('contains the fixed V1 module catalogue with stable namespaced IDs', () => {
    expect(coreDestinationRegistry.destinations).toHaveLength(22);
    expect(coreDestinationRegistry.destinations.map(item => item.id)).toEqual([
      CORE_DESTINATION_IDS.dayGraph,
      CORE_DESTINATION_IDS.dailyOverview,
      CORE_DESTINATION_IDS.previousDaySummary,
      CORE_DESTINATION_IDS.trends,
      CORE_DESTINATION_IDS.trendsOverview,
      CORE_DESTINATION_IDS.trendsAgpDailyPatterns,
      CORE_DESTINATION_IDS.trendsComparePeriods,
      CORE_DESTINATION_IDS.trendsTherapyContext,
      CORE_DESTINATION_IDS.hypoInvestigation,
      CORE_DESTINATION_IDS.similarEvents,
      CORE_DESTINATION_IDS.loopChangesImpact,
      CORE_DESTINATION_IDS.aiAnalyst,
      CORE_DESTINATION_IDS.aiGeneralChat,
      CORE_DESTINATION_IDS.aiHypoSpecialist,
      CORE_DESTINATION_IDS.aiBehaviorSpecialist,
      CORE_DESTINATION_IDS.aiLoopSpecialist,
      CORE_DESTINATION_IDS.aiMealSpecialist,
      CORE_DESTINATION_IDS.meals,
      CORE_DESTINATION_IDS.activity,
      CORE_DESTINATION_IDS.updateCenter,
      CORE_DESTINATION_IDS.alertRules,
      CORE_DESTINATION_IDS.settings,
    ]);

    coreDestinationRegistry.destinations.forEach(destination => {
      expect(destination.id).toMatch(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/);
      if (destination.kind === 'module') {
        expect(destination.ownerModuleId).toBe(destination.id);
      } else {
        expect([
          CORE_DESTINATION_IDS.trends,
          CORE_DESTINATION_IDS.aiAnalyst,
        ]).toContain(destination.ownerModuleId);
      }
      expect(destination.copy.en.title).not.toHaveLength(0);
      expect(destination.copy.en.description).not.toHaveLength(0);
      expect(destination.copy.he.title).not.toHaveLength(0);
      expect(destination.copy.he.description).not.toHaveLength(0);
      expect(destination.availability.platforms).toEqual([
        'ios',
        'android',
        'web',
      ]);
    });

    expect(CORE_DESTINATIONS.map(item => item.implementationKey)).toEqual(
      CORE_IMPLEMENTATION_KEY_LIST,
    );
    expect(new Set(CORE_IMPLEMENTATION_KEY_LIST).size).toBe(
      CORE_IMPLEMENTATION_KEY_LIST.length,
    );
    expect(isCoreImplementationKey(CORE_IMPLEMENTATION_KEYS.trends)).toBe(true);
    expect(isCoreImplementationKey('TrendTypo')).toBe(false);
  });

  it('advertises destinations with a real browser adapter on web', () => {
    const target = createStoredDestinationTarget(CORE_DESTINATION_IDS.dayGraph);

    expect(
      resolveDestinationTarget(coreDestinationRegistry, target, 'favorite', {
        platform: 'web',
      }),
    ).toMatchObject({status: 'available'});
  });

  it('fails fast when a core key is missing, duplicated, or unknown', () => {
    expect(() =>
      assertCoreImplementationKeyCoverage([
        ...CORE_IMPLEMENTATION_KEY_LIST.slice(1),
        CORE_IMPLEMENTATION_KEYS.settings,
        'TrendsTypo',
      ]),
    ).toThrow(/Missing: DayGraph.*Duplicate: Settings.*Unknown: TrendsTypo/);
  });

  it('uses the fixed group order and deterministic module ordering', () => {
    expect(DESTINATION_GROUPS).toEqual([
      'today',
      'understand',
      'ask',
      'record',
      'updates',
      'manage',
    ]);
    expect(
      coreDestinationRegistry.modules('today').map(module => module.id),
    ).toEqual([
      CORE_DESTINATION_IDS.dayGraph,
      CORE_DESTINATION_IDS.dailyOverview,
      CORE_DESTINATION_IDS.previousDaySummary,
    ]);
  });

  it('rejects an invalid contribution atomically', () => {
    const invalidContribution = [
      ...CORE_DESTINATIONS,
      {
        ...CORE_DESTINATIONS[0],
        copy: {
          en: {title: '', description: 'Description'},
          he: {title: 'כותרת', description: 'תיאור'},
        },
      },
    ];

    let error: unknown;
    const createInvalidRegistry = () =>
      new DestinationRegistry(invalidContribution);
    try {
      createInvalidRegistry();
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(DestinationValidationError);
    expect((error as DestinationValidationError).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({path: 'destinations[22].copy.en.title'}),
        expect.objectContaining({path: 'destinations[22].id'}),
      ]),
    );
  });

  it('rejects aliases that collide with a later canonical ID', () => {
    const first = {
      ...CORE_DESTINATIONS[0],
      aliases: [CORE_DESTINATION_IDS.dailyOverview],
    };
    expect(
      () => new DestinationRegistry([first, ...CORE_DESTINATIONS.slice(1)]),
    ).toThrow(DestinationValidationError);
  });

  it('rejects stored targets with context or medical payloads', () => {
    const result = safeParseStoredDestinationTarget({
      schemaVersion: 1,
      destinationId: CORE_DESTINATION_IDS.dayGraph,
      glucose: 62,
      dateRange: {from: 1, to: 2},
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map(issue => issue.path)).toEqual(
        expect.arrayContaining(['target.glucose', 'target.dateRange']),
      );
    }
  });

  it('retains an unknown saved destination with a clear reason', () => {
    const target = createStoredDestinationTarget('removed.old-module');
    const result = resolveDestinationTarget(
      coreDestinationRegistry,
      target,
      'favorite',
      iosRuntime,
    );

    expect(result).toMatchObject({
      status: 'unavailable',
      target,
      reason: {
        code: 'unknown-destination',
      },
    });
    if (result.status === 'unavailable') {
      expect(result.reason.message.length).toBeGreaterThan(0);
    }
  });

  it('enforces each target purpose policy', () => {
    const settings = createStoredDestinationTarget(
      CORE_DESTINATION_IDS.settings,
    );

    expect(
      resolveDestinationTarget(
        coreDestinationRegistry,
        settings,
        'favorite',
        iosRuntime,
      ).status,
    ).toBe('available');
    expect(
      resolveDestinationTarget(
        coreDestinationRegistry,
        settings,
        'shortcut',
        iosRuntime,
      ).status,
    ).toBe('available');
    expect(
      resolveDestinationTarget(
        coreDestinationRegistry,
        settings,
        'start',
        iosRuntime,
      ),
    ).toMatchObject({
      status: 'unavailable',
      reason: {code: 'target-not-allowed'},
    });
  });

  it('reports platform, capability, and host kill-switch availability', () => {
    const restrictedId = destinationId('example.restricted');
    const restricted: DestinationDefinition = {
      id: restrictedId,
      kind: 'module',
      ownerModuleId: restrictedId,
      implementationKey: 'Restricted',
      group: 'manage',
      order: 1,
      copy: {
        en: {title: 'Restricted', description: 'Restricted module'},
        he: {title: 'מוגבל', description: 'מודול מוגבל'},
      },
      targetPolicy: {favorite: true, start: true, shortcut: true},
      availability: {
        platforms: ['ios'],
        requiredCapabilities: ['nightscout.read'],
      },
    };
    const registry = new DestinationRegistry([restricted]);
    const target = createStoredDestinationTarget(restrictedId);

    expect(
      resolveDestinationTarget(registry, target, 'favorite', {
        platform: 'android',
      }),
    ).toMatchObject({
      status: 'unavailable',
      reason: {code: 'unsupported-platform'},
    });
    expect(
      resolveDestinationTarget(registry, target, 'favorite', iosRuntime),
    ).toMatchObject({
      status: 'unavailable',
      reason: {code: 'missing-capability'},
    });
    expect(
      resolveDestinationTarget(registry, target, 'favorite', {
        platform: 'ios',
        capabilities: new Set(['nightscout.read']),
        disabledDestinations: new Map([[restrictedId, 'Paused safely']]),
      }),
    ).toMatchObject({
      status: 'unavailable',
      reason: {code: 'disabled', message: 'Paused safely'},
    });
  });
});
