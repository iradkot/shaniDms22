import {aiSpecialistForImplementationKey} from 'app/product/ai';
import {
  CORE_DESTINATION_IDS,
  CORE_IMPLEMENTATION_KEYS,
  coreDestinationRegistry,
  createStoredDestinationTarget,
  resolveDestinationTarget,
} from 'app/product/destinations';
import {
  selectAllModuleGroups,
  selectFavoriteItems,
  selectRecentItems,
} from 'app/product/hub/selectors';
import {
  createInitialProductShellState,
  resolveCurrentProductShellRoute,
  resolveProductShellConfiguration,
} from 'app/product/shell';
import {createRuntimeProductRegistries} from 'app/product/plugins/runtimeRegistry';

const oldAiIds = [
  CORE_DESTINATION_IDS.aiGeneralChat,
  CORE_DESTINATION_IDS.aiHypoSpecialist,
  CORE_DESTINATION_IDS.aiBehaviorSpecialist,
  CORE_DESTINATION_IDS.aiMealSpecialist,
  CORE_DESTINATION_IDS.aiLoopSpecialist,
];

describe('AI Product destination mapping', () => {
  it('maps every curated child implementation to one specialist and keeps the parent as a landing', () => {
    expect(
      [
        CORE_IMPLEMENTATION_KEYS.aiAnalyst,
        CORE_IMPLEMENTATION_KEYS.aiGeneralChat,
        CORE_IMPLEMENTATION_KEYS.aiHypoSpecialist,
        CORE_IMPLEMENTATION_KEYS.aiBehaviorSpecialist,
        CORE_IMPLEMENTATION_KEYS.aiMealSpecialist,
        CORE_IMPLEMENTATION_KEYS.aiLoopSpecialist,
      ].map(aiSpecialistForImplementationKey),
    ).toEqual([
      undefined,
      'general-chat',
      'hypo-investigation',
      'behavior-analysis',
      'meal-analysis',
      'loop-advice',
    ]);
  });

  it('offers one recommendation entry while keeping old AI links resolvable', () => {
    const groups = selectAllModuleGroups(coreDestinationRegistry, {
      locale: 'en',
      runtime: {platform: 'android'},
      preferences: {favorites: []},
    });
    expect(groups.find(group => group.id === 'ask')?.items.map(item => item.key))
      .toEqual([CORE_DESTINATION_IDS.aiAnalyst]);

    [
      CORE_DESTINATION_IDS.aiGeneralChat,
      CORE_DESTINATION_IDS.aiHypoSpecialist,
      CORE_DESTINATION_IDS.aiBehaviorSpecialist,
      CORE_DESTINATION_IDS.aiMealSpecialist,
      CORE_DESTINATION_IDS.aiLoopSpecialist,
    ].forEach(id => {
      expect(resolveDestinationTarget(
        coreDestinationRegistry,
        createStoredDestinationTarget(id),
        undefined,
        {platform: 'android'},
      ).status).toBe('available');
      expect(coreDestinationRegistry.get(id)?.targetPolicy).toEqual({
        favorite: false,
        start: false,
        shortcut: false,
      });
    });
  });

  it('shows saved old favorites and recents as one usable recommendation entry', () => {
    const input = {
      locale: 'he' as const,
      runtime: {platform: 'android' as const},
      preferences: {
        favorites: oldAiIds.map(createStoredDestinationTarget),
        recents: oldAiIds.map((id, index) => ({
          target: createStoredDestinationTarget(id),
          visitedAt: index + 1,
        })),
      },
    };
    // The same migration must work when optional plugins are installed.
    for (const registry of [coreDestinationRegistry, createRuntimeProductRegistries([]).destinations]) {
      for (const items of [selectFavoriteItems(registry, input), selectRecentItems(registry, input)]) {
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
          key: CORE_DESTINATION_IDS.aiAnalyst,
          title: 'המלצות AI',
          resolved: {
            status: 'available',
            target: createStoredDestinationTarget(CORE_DESTINATION_IDS.aiAnalyst),
          },
        });
      }
    }
  });

  it('opens old saved starts and shortcuts at the new landing while retaining contextual links', () => {
    const runtime = {platform: 'android' as const};
    for (const id of oldAiIds) {
      const oldTarget = createStoredDestinationTarget(id);
      const configuration = resolveProductShellConfiguration(coreDestinationRegistry, {
        schemaVersion: 1,
        startDestination: oldTarget,
        shortcuts: [oldTarget],
      }, runtime);
      expect(configuration.shortcuts[0]).toMatchObject({
        status: 'available',
        target: createStoredDestinationTarget(CORE_DESTINATION_IDS.aiAnalyst),
        migratedFrom: id,
      });
      const state = createInitialProductShellState(configuration);
      expect(resolveCurrentProductShellRoute(state, coreDestinationRegistry, runtime))
        .toMatchObject({
          kind: 'destination',
          resolved: {destination: {id: CORE_DESTINATION_IDS.aiAnalyst}},
        });

      const focus = {kind: 'ai-conversation' as const, conversationId: 'saved-conversation'};
      expect(resolveCurrentProductShellRoute({
        stack: [{kind: 'hub'}, {kind: 'destination', target: oldTarget, focus}],
        forward: [],
      }, coreDestinationRegistry, runtime)).toMatchObject({
        kind: 'destination',
        resolved: {destination: {id}},
        request: {focus},
      });
    }
  });

  it('does not show duplicate shortcut buttons after two old modes converge', () => {
    const configuration = resolveProductShellConfiguration(coreDestinationRegistry, {
      schemaVersion: 1,
      shortcuts: [
        createStoredDestinationTarget(CORE_DESTINATION_IDS.aiGeneralChat),
        createStoredDestinationTarget(CORE_DESTINATION_IDS.aiLoopSpecialist),
      ],
    }, {platform: 'android'});
    expect(configuration.shortcuts).toHaveLength(1);
    expect(configuration.shortcuts[0]?.target.destinationId).toBe(CORE_DESTINATION_IDS.aiAnalyst);
  });
});
