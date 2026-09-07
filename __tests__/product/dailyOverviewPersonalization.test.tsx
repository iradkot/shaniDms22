import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {withTheme} from '../mocks/withTheme';
import {ProductExperience} from 'app/product/app';
import {DailyOverviewModuleView} from 'app/product/dailyOverview';
import {
  CORE_DESTINATION_IDS,
  createStoredDestinationTarget,
} from 'app/product/destinations';
import {
  DEFAULT_DAILY_OVERVIEW_PREFERENCES,
  PersonalizationQuestionnaireView,
  createDefaultProductPersonalization,
  recordRecentModule,
  resolveProductPersonalizationChange,
  selectLayoutProfile,
  skipPersonalizationQuestionnaire,
  updateDailyOverviewPreferences,
  type ProductPersonalizationChange,
  type ProductPersonalizationSaveOptions,
  type StoredProductPersonalization,
} from 'app/product/personalization';

const saved = {
  schemaVersion: 1,
  rangeStyle: 'list',
  cardOrder: ['mean', 'ranges', 'glucose', 'coverage', 'insulin'],
} as const;

const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
};
const runtime = {
  thresholds,
  dataSource: {
    loadDailyOverview: async () => ({
      glucoseSamples: [],
      insulinSummary: {quality: 'unavailable' as const},
    }),
  },
};

describe('Daily Overview personalization host', () => {
  it('keeps the daily design when the user edits and saves Hub presentation settings', async () => {
    const value = skipPersonalizationQuestionnaire(
      updateDailyOverviewPreferences(
        createDefaultProductPersonalization(),
        'phone',
        saved,
      ),
    );
    const results: StoredProductPersonalization[] = [];
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        withTheme(
          <PersonalizationQuestionnaireView
            initialStage="presentation"
            layout="phone"
            locale="he"
            mode="customize"
            value={value}
            onSave={async next => {
              results.push(next);
            }}
          />,
        ),
      );
    });
    act(() => {
      tree!.root
        .findByProps({testID: 'personalization-current-snapshot'})
        .props.onPress();
    });
    await act(async () => {
      await tree!.root
        .findByProps({testID: 'personalization-primary-action'})
        .props.onPress();
    });
    expect(selectLayoutProfile(results[0]!, 'phone').dailyOverview).toEqual(
      saved,
    );
    act(() => tree!.unmount());
  });

  it('connects the active form factor to an atomic durable save and preserves later visits', async () => {
    const value = skipPersonalizationQuestionnaire(
      updateDailyOverviewPreferences(
        createDefaultProductPersonalization(),
        'tablet',
        saved,
      ),
    );
    const changes: ProductPersonalizationChange[] = [];
    const saveOptions: (ProductPersonalizationSaveOptions | undefined)[] = [];
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        withTheme(
          <ProductExperience
            locale="en"
            runtime={{platform: 'ios'}}
            personalizationLayout="tablet"
            personalization={value}
            shellPreferences={{
              schemaVersion: 1,
              shortcuts: [],
              startDestination: createStoredDestinationTarget(
                CORE_DESTINATION_IDS.dailyOverview,
              ),
            }}
            dailyOverviewRuntime={runtime}
            onPersonalizationChange={async (change, options) => {
              changes.push(change);
              saveOptions.push(options);
            }}
          />,
        ),
      );
    });
    const preferences = tree!.root.findByType(DailyOverviewModuleView).props
      .layoutPreferences;
    expect(preferences).toMatchObject({
      layout: 'tablet',
      hydrated: true,
      value: saved,
    });
    const next = {...saved, rangeStyle: 'bar'} as const;
    await preferences.onSave(next);
    expect(saveOptions[saveOptions.length - 1]).toEqual({optimistic: false});
    const latest = recordRecentModule(
      value,
      createStoredDestinationTarget(CORE_DESTINATION_IDS.trends),
      123,
    );
    const change = changes[changes.length - 1];
    expect(typeof change).toBe('function');
    if (!change) {
      throw new Error('Expected overview design change');
    }
    const result = resolveProductPersonalizationChange(latest, change);
    expect(selectLayoutProfile(result, 'tablet').dailyOverview).toEqual(next);
    expect(selectLayoutProfile(result, 'phone').dailyOverview).toBeUndefined();
    expect(result.device).toEqual(latest.device);
    act(() => tree!.unmount());
  });

  it('marks loading defaults unhydrated and forwards persistence errors', async () => {
    const save = jest.fn(async () => {
      throw new Error('Local storage is full');
    });
    const content = (personalization?: StoredProductPersonalization) =>
      withTheme(
        <ProductExperience
          locale="en"
          runtime={{platform: 'ios'}}
          personalizationLayout="phone"
          {...(personalization === undefined ? {} : {personalization})}
          shellPreferences={{
            schemaVersion: 1,
            shortcuts: [],
            startDestination: createStoredDestinationTarget(
              CORE_DESTINATION_IDS.dailyOverview,
            ),
          }}
          dailyOverviewRuntime={runtime}
          onPersonalizationChange={save}
        />,
      );
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(content());
    });
    expect(
      tree!.root.findByType(DailyOverviewModuleView).props.layoutPreferences,
    ).toMatchObject({
      hydrated: false,
      value: DEFAULT_DAILY_OVERVIEW_PREFERENCES,
    });
    await act(async () => {
      tree!.update(
        content(
          skipPersonalizationQuestionnaire(
            updateDailyOverviewPreferences(
              createDefaultProductPersonalization(),
              'phone',
              saved,
            ),
          ),
        ),
      );
    });
    const preferences = tree!.root.findByType(DailyOverviewModuleView).props
      .layoutPreferences;
    expect(preferences).toMatchObject({hydrated: true, value: saved});
    await expect(preferences.onSave(saved)).rejects.toThrow(
      'Local storage is full',
    );
    act(() => tree!.unmount());
  });
});
