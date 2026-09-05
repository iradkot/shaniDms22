import {
  CORE_DESTINATION_IDS,
  createStoredDestinationTarget,
} from 'app/product/destinations';
import {
  MAX_PERSISTED_RECENT_MODULES,
  ProductPersonalizationValidationError,
  beginPersonalizationQuestionnaire,
  buildPersonalizationQuestionnairePreset,
  clearRecentModules,
  completePersonalizationQuestionnaire,
  createDefaultProductPersonalization,
  customizeProductPersonalization,
  moveFavoriteDestination,
  parsePersonalizationQuestionnaireAnswers,
  parseStoredProductPersonalization,
  recordRecentModule,
  replaceFavoriteDestinations,
  replaceHiddenModules,
  resolveProductPersonalizationChange,
  safeParseStoredProductPersonalization,
  selectLayoutProfile,
  skipPersonalizationQuestionnaire,
  updateLayoutProfile,
} from 'app/product/personalization';

const target = (id: string) => createStoredDestinationTarget(id);
const ids = (targets: readonly {readonly destinationId: string}[]) =>
  targets.map(item => item.destinationId);

describe('Personalisation presets', () => {
  it('creates separate account, Workspace, Layout, and device scopes', () => {
    const state = createDefaultProductPersonalization();

    expect(ids(state.account.favorites)).toEqual([
      CORE_DESTINATION_IDS.dayGraph,
      CORE_DESTINATION_IDS.dailyOverview,
      CORE_DESTINATION_IDS.trends,
      CORE_DESTINATION_IDS.meals,
      CORE_DESTINATION_IDS.aiAnalyst,
    ]);
    expect(state.account.hiddenModules).toEqual([]);
    expect(state.workspace).toEqual({
      schemaVersion: 1,
      questionnaire: {schemaVersion: 1, status: 'not-started'},
    });
    expect(state.layout.profiles.map(profile => profile.layout)).toEqual([
      'phone',
      'tablet',
      'desktop',
    ]);
    expect(
      state.layout.profiles.every(
        profile =>
          !profile.showCurrentSnapshot &&
          profile.showRecents &&
          !profile.showGri &&
          profile.shell.startDestination === undefined,
      ),
    ).toBe(true);
    expect(state.device.recentModules).toEqual([]);
  });

  it.each([
    [
      'self' as const,
      [
        CORE_DESTINATION_IDS.dayGraph,
        CORE_DESTINATION_IDS.dailyOverview,
        CORE_DESTINATION_IDS.trends,
      ],
      false,
    ],
    [
      'parent' as const,
      [
        CORE_DESTINATION_IDS.dayGraph,
        CORE_DESTINATION_IDS.hypoInvestigation,
        CORE_DESTINATION_IDS.updateCenter,
      ],
      true,
    ],
    [
      'caregiver' as const,
      [
        CORE_DESTINATION_IDS.dayGraph,
        CORE_DESTINATION_IDS.hypoInvestigation,
        CORE_DESTINATION_IDS.updateCenter,
      ],
      true,
    ],
    [
      'clinician' as const,
      [
        CORE_DESTINATION_IDS.dailyOverview,
        CORE_DESTINATION_IDS.trends,
        CORE_DESTINATION_IDS.loopChangesImpact,
        CORE_DESTINATION_IDS.similarEvents,
      ],
      false,
    ],
    [
      'family-member' as const,
      [
        CORE_DESTINATION_IDS.dayGraph,
        CORE_DESTINATION_IDS.dailyOverview,
        CORE_DESTINATION_IDS.trends,
        CORE_DESTINATION_IDS.meals,
        CORE_DESTINATION_IDS.aiAnalyst,
      ],
      false,
    ],
    [
      'other' as const,
      [
        CORE_DESTINATION_IDS.dayGraph,
        CORE_DESTINATION_IDS.dailyOverview,
        CORE_DESTINATION_IDS.trends,
        CORE_DESTINATION_IDS.meals,
        CORE_DESTINATION_IDS.aiAnalyst,
      ],
      false,
    ],
    [
      'prefer-not-to-answer' as const,
      [
        CORE_DESTINATION_IDS.dayGraph,
        CORE_DESTINATION_IDS.dailyOverview,
        CORE_DESTINATION_IDS.trends,
        CORE_DESTINATION_IDS.meals,
        CORE_DESTINATION_IDS.aiAnalyst,
      ],
      false,
    ],
  ])(
    'builds the editable %s recommendation without a capability allow-list',
    (relationship, expectedFavorites, expectedSnapshot) => {
      const preset = buildPersonalizationQuestionnairePreset(
        relationship,
        'tablet',
      );

      expect(ids(preset.quickAccess.favorites)).toEqual(expectedFavorites);
      expect(preset.presentation).toMatchObject({
        layout: 'tablet',
        showCurrentSnapshot: expectedSnapshot,
        showRecents: true,
        shell: {schemaVersion: 1},
      });
      expect(Object.keys(preset)).toEqual([
        'schemaVersion',
        'relationship',
        'quickAccess',
        'presentation',
      ]);
    },
  );
});

describe('Personalisation persistence boundary', () => {
  it('round-trips a valid composite through strict nested parsers', () => {
    const state = createDefaultProductPersonalization();
    expect(parseStoredProductPersonalization(state)).toEqual(state);
  });

  it('rejects unknown, medical, and transient context at nested levels', () => {
    const state = createDefaultProductPersonalization();
    const result = safeParseStoredProductPersonalization({
      ...state,
      glucose: 61,
      account: {...state.account, workspaceId: 'private'},
      layout: {
        ...state.layout,
        profiles: state.layout.profiles.map((profile, index) =>
          index === 0
            ? {
                ...profile,
                dateRange: {from: 1, to: 2},
                shell: {
                  ...profile.shell,
                  shortcuts: [
                    {
                      ...target(CORE_DESTINATION_IDS.dayGraph),
                      filter: 'today',
                    },
                  ],
                },
              }
            : profile,
        ),
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map(issue => issue.path)).toEqual(
        expect.arrayContaining([
          'personalization.glucose',
          'personalization.account.workspaceId',
          'personalization.layout.profiles[0].dateRange',
          'personalization.layout.profiles[0].shell.shortcuts[0].filter',
        ]),
      );
    }
  });

  it('rejects invalid relationships, layouts, and questionnaire states', () => {
    const state = createDefaultProductPersonalization();
    const result = safeParseStoredProductPersonalization({
      ...state,
      workspace: {
        ...state.workspace,
        relationship: 'owner',
        questionnaire: {
          schemaVersion: 1,
          status: 'in-progress',
          currentStage: 'medical-history',
        },
      },
      layout: {
        ...state.layout,
        profiles: state.layout.profiles.map((profile, index) =>
          index === 0 ? {...profile, layout: 'watch'} : profile,
        ),
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map(issue => issue.path)).toEqual(
        expect.arrayContaining([
          'personalization.workspace.relationship',
          'personalization.workspace.questionnaire.currentStage',
          'personalization.layout.profiles[0].layout',
        ]),
      );
    }
  });

  it('requires a relationship only after questionnaire completion', () => {
    const state = createDefaultProductPersonalization();
    expect(() =>
      parseStoredProductPersonalization({
        ...state,
        workspace: {
          schemaVersion: 1,
          questionnaire: {schemaVersion: 1, status: 'completed'},
        },
      }),
    ).toThrow(ProductPersonalizationValidationError);

    expect(
      parseStoredProductPersonalization({
        ...state,
        workspace: {
          schemaVersion: 1,
          questionnaire: {schemaVersion: 1, status: 'skipped'},
        },
      }).workspace.relationship,
    ).toBeUndefined();
  });

  it('requires exactly one profile per supported form factor', () => {
    const state = createDefaultProductPersonalization();
    expect(() =>
      parseStoredProductPersonalization({
        ...state,
        layout: {
          ...state.layout,
          profiles: [state.layout.profiles[0], state.layout.profiles[0]],
        },
      }),
    ).toThrow(ProductPersonalizationValidationError);
  });

  it('delegates shortcut limits, duplicates, and target validation to Shell', () => {
    const state = createDefaultProductPersonalization();
    const profile = state.layout.profiles[0];
    if (!profile) {
      throw new Error('Expected a phone profile');
    }
    expect(() =>
      updateLayoutProfile(state, {
        ...profile,
        shell: {
          schemaVersion: 1,
          shortcuts: [
            target(CORE_DESTINATION_IDS.dayGraph),
            target(CORE_DESTINATION_IDS.trends),
            target(CORE_DESTINATION_IDS.meals),
          ],
        },
      }),
    ).toThrow(ProductPersonalizationValidationError);
    expect(() =>
      updateLayoutProfile(state, {
        ...profile,
        shell: {
          schemaVersion: 1,
          shortcuts: [
            target(CORE_DESTINATION_IDS.dayGraph),
            target(CORE_DESTINATION_IDS.dayGraph),
          ],
        },
      }),
    ).toThrow(ProductPersonalizationValidationError);
  });

  it('has no hard favorite limit but rejects duplicate or malformed targets', () => {
    const state = createDefaultProductPersonalization();
    const many = Array.from({length: 35}, (_, index) =>
      target(`test.favorite-${index}`),
    );
    expect(
      replaceFavoriteDestinations(state, many).account.favorites,
    ).toHaveLength(35);
    expect(() =>
      replaceFavoriteDestinations(state, [many[0]!, many[0]!]),
    ).toThrow(ProductPersonalizationValidationError);
    expect(() =>
      parseStoredProductPersonalization({
        ...state,
        account: {
          schemaVersion: 1,
          favorites: [{schemaVersion: 1, destinationId: 'not valid'}],
        },
      }),
    ).toThrow(ProductPersonalizationValidationError);
  });

  it('reorders Favorites without changing their stable identities', () => {
    const favorites = [
      target(CORE_DESTINATION_IDS.dayGraph),
      target(CORE_DESTINATION_IDS.dailyOverview),
      target(CORE_DESTINATION_IDS.trends),
    ];

    expect(
      ids(
        moveFavoriteDestination(
          favorites,
          CORE_DESTINATION_IDS.dayGraph,
          'later',
        ),
      ),
    ).toEqual([
      CORE_DESTINATION_IDS.dailyOverview,
      CORE_DESTINATION_IDS.dayGraph,
      CORE_DESTINATION_IDS.trends,
    ]);
    expect(
      moveFavoriteDestination(
        favorites,
        CORE_DESTINATION_IDS.dayGraph,
        'earlier',
      ),
    ).toBe(favorites);
    expect(
      moveFavoriteDestination(favorites, 'core.missing', 'later'),
    ).toBe(favorites);
  });

  it('stores hidden Modules as strict stable targets independently of favorites', () => {
    const state = createDefaultProductPersonalization();
    const meals = target(CORE_DESTINATION_IDS.meals);
    const hidden = replaceHiddenModules(state, [meals]);

    expect(hidden.account.hiddenModules).toEqual([meals]);
    expect(hidden.account.favorites).toEqual(state.account.favorites);
    expect(() => replaceHiddenModules(state, [meals, meals])).toThrow(
      ProductPersonalizationValidationError,
    );
    expect(() =>
      parseStoredProductPersonalization({
        ...state,
        account: {...state.account, hiddenModules: ['meals']},
      }),
    ).toThrow(ProductPersonalizationValidationError);
  });

  it('caps valid device recents at 20 while still rejecting duplicates', () => {
    const state = createDefaultProductPersonalization();
    const recentModules = Array.from({length: 30}, (_, index) => ({
      schemaVersion: 1,
      target: target(`test.recent-${index}`),
      visitedAt: 1000 - index,
    }));
    const parsed = parseStoredProductPersonalization({
      ...state,
      device: {schemaVersion: 1, recentModules},
    });
    expect(parsed.device.recentModules).toHaveLength(
      MAX_PERSISTED_RECENT_MODULES,
    );
    expect(() =>
      parseStoredProductPersonalization({
        ...state,
        device: {
          schemaVersion: 1,
          recentModules: [recentModules[0], recentModules[0]],
        },
      }),
    ).toThrow(ProductPersonalizationValidationError);
  });
});

describe('Three-stage questionnaire', () => {
  it('strictly validates all three stages with Shell target rules', () => {
    const answers = buildPersonalizationQuestionnairePreset('self', 'phone');
    expect(parsePersonalizationQuestionnaireAnswers(answers)).toEqual(answers);
    expect(() =>
      parsePersonalizationQuestionnaireAnswers({
        ...answers,
        presentation: {
          ...answers.presentation,
          medicalContext: {glucose: 61},
        },
      }),
    ).toThrow(ProductPersonalizationValidationError);
    expect(() =>
      parsePersonalizationQuestionnaireAnswers({
        ...answers,
        quickAccess: {
          ...answers.quickAccess,
          favorites: [
            target(CORE_DESTINATION_IDS.trends),
            target(CORE_DESTINATION_IDS.trends),
          ],
        },
      }),
    ).toThrow(ProductPersonalizationValidationError);
  });

  it('moves through a stage without mutating the input', () => {
    const initial = createDefaultProductPersonalization();
    const begun = beginPersonalizationQuestionnaire(initial, 'quick-access');

    expect(initial.workspace.questionnaire.status).toBe('not-started');
    expect(begun.workspace.questionnaire).toEqual({
      schemaVersion: 1,
      status: 'in-progress',
      currentStage: 'quick-access',
    });
    expect(begun).not.toBe(initial);
  });

  it('completes into the correct scopes and explicit choices beat presets', () => {
    const initial = createDefaultProductPersonalization();
    const preset = buildPersonalizationQuestionnairePreset(
      'clinician',
      'tablet',
    );
    const completed = completePersonalizationQuestionnaire(initial, {
      ...preset,
      quickAccess: {...preset.quickAccess, favorites: []},
      presentation: {
        ...preset.presentation,
        showRecents: false,
        shell: {
          schemaVersion: 1,
          startDestination: target(CORE_DESTINATION_IDS.trends),
          shortcuts: [],
        },
      },
    });

    expect(completed.account.favorites).toEqual([]);
    expect(completed.workspace).toEqual({
      schemaVersion: 1,
      questionnaire: {schemaVersion: 1, status: 'completed'},
      relationship: 'clinician',
    });
    expect(selectLayoutProfile(completed, 'tablet')).toMatchObject({
      showRecents: false,
      shell: {
        startDestination: {destinationId: CORE_DESTINATION_IDS.trends},
        shortcuts: [],
      },
    });
    expect(selectLayoutProfile(completed, 'phone')).toEqual(
      selectLayoutProfile(initial, 'phone'),
    );
  });

  it('skips without inventing a relationship or changing other scopes', () => {
    const initial = completePersonalizationQuestionnaire(
      createDefaultProductPersonalization(),
      buildPersonalizationQuestionnairePreset('parent', 'phone'),
    );
    const skipped = skipPersonalizationQuestionnaire(initial);

    expect(skipped.workspace).toEqual({
      schemaVersion: 1,
      questionnaire: {schemaVersion: 1, status: 'skipped'},
    });
    expect(skipped.account).toEqual(initial.account);
    expect(skipped.layout).toEqual(initial.layout);
  });

  it('customizes a skipped questionnaire without forcing a relationship', () => {
    const skipped = skipPersonalizationQuestionnaire(
      createDefaultProductPersonalization(),
    );
    const preset = buildPersonalizationQuestionnairePreset('self', 'tablet');
    const customized = customizeProductPersonalization(skipped, {
      favorites: [target(CORE_DESTINATION_IDS.trends)],
      presentation: {
        ...preset.presentation,
        showCurrentSnapshot: true,
        showRecents: false,
      },
    });

    expect(customized.workspace).toEqual({
      schemaVersion: 1,
      questionnaire: {schemaVersion: 1, status: 'skipped'},
    });
    expect(ids(customized.account.favorites)).toEqual([
      CORE_DESTINATION_IDS.trends,
    ]);
    expect(selectLayoutProfile(customized, 'tablet')).toMatchObject({
      showCurrentSnapshot: true,
      showRecents: false,
    });
  });
});

describe('Immutable personalization updates', () => {
  it('updates exactly one Layout Profile', () => {
    const initial = createDefaultProductPersonalization();
    const tablet = selectLayoutProfile(initial, 'tablet');
    const updated = updateLayoutProfile(initial, {
      ...tablet,
      showCurrentSnapshot: true,
      showRecents: false,
      shell: {schemaVersion: 1, shortcuts: []},
    });

    expect(selectLayoutProfile(initial, 'tablet').showCurrentSnapshot).toBe(
      false,
    );
    expect(selectLayoutProfile(updated, 'tablet')).toMatchObject({
      showCurrentSnapshot: true,
      showRecents: false,
    });
    expect(selectLayoutProfile(updated, 'desktop')).toEqual(
      selectLayoutProfile(initial, 'desktop'),
    );
  });

  it('records, deduplicates, reorders, caps, and clears device-local recents', () => {
    let state = createDefaultProductPersonalization();
    for (let index = 0; index < 25; index += 1) {
      state = recordRecentModule(state, target(`test.module-${index}`), index);
    }
    const beforeRepeat = state;
    state = recordRecentModule(state, target('test.module-10'), 100);

    expect(beforeRepeat.device.recentModules[0]?.target.destinationId).toBe(
      'test.module-24',
    );
    expect(state.device.recentModules).toHaveLength(20);
    expect(state.device.recentModules[0]).toMatchObject({
      target: {destinationId: 'test.module-10'},
      visitedAt: 100,
    });
    expect(
      state.device.recentModules.filter(
        recent => recent.target.destinationId === 'test.module-10',
      ),
    ).toHaveLength(1);
    expect(clearRecentModules(state).device.recentModules).toEqual([]);
    expect(state.device.recentModules).toHaveLength(20);
  });

  it('rejects invalid Recent Module timestamps', () => {
    expect(() =>
      recordRecentModule(
        createDefaultProductPersonalization(),
        target(CORE_DESTINATION_IDS.trends),
        -1,
      ),
    ).toThrow(ProductPersonalizationValidationError);
  });

  it('resolves functional changes against the latest optimistic value', () => {
    const first = resolveProductPersonalizationChange(
      createDefaultProductPersonalization(),
      current =>
        recordRecentModule(current, target(CORE_DESTINATION_IDS.dayGraph), 1),
    );
    const second = resolveProductPersonalizationChange(first, current =>
      recordRecentModule(current, target(CORE_DESTINATION_IDS.trends), 2),
    );

    expect(
      second.device.recentModules.map(recent => recent.target.destinationId),
    ).toEqual([CORE_DESTINATION_IDS.trends, CORE_DESTINATION_IDS.dayGraph]);
  });
});
