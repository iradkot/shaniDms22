import React from 'react';
import {withTheme} from '../mocks/withTheme';
import renderer, {act} from 'react-test-renderer';
import {Pressable, Text} from 'react-native';
import {
  AppOwnedUriJournalMediaStore,
  InMemoryJournalLocalStore,
  createJournalEngine,
  parseNightscoutSourceId,
  parseProductUserId,
  parseWorkspaceId,
} from '../../src/modules/journal';
import type {
  JournalEntityKind,
  JournalIdGenerator,
  JournalWorkspaceScope,
  ParseResult,
} from '../../src/modules/journal';
import {
  ProductExperience,
  ProductImplementationRegistry,
} from '../../src/product/app';
import {ActivitiesView} from '../../src/product/activities';
import {
  CORE_DESTINATION_IDS,
  CORE_IMPLEMENTATION_KEYS,
  coreDestinationRegistry,
  createStoredDestinationTarget,
  resolveDestinationTarget,
} from '../../src/product/destinations';
import {createDestinationRequest} from '../../src/product/shell';

function valueOf<T>(result: ParseResult<T>): T {
  if (!result.ok) {
    throw new Error('Invalid test value.');
  }
  return result.value;
}

const scope: JournalWorkspaceScope = {
  productUserId: valueOf(parseProductUserId('user-1')),
  workspaceId: valueOf(parseWorkspaceId('workspace-1')),
  nightscoutSourceId: valueOf(parseNightscoutSourceId('nightscout-1')),
};

class TestIds implements JournalIdGenerator {
  private entry = 0;
  private operation = 0;

  nextEntryId(kind: JournalEntityKind): string {
    this.entry += 1;
    return `${kind}-test-${this.entry}`;
  }

  nextOperationId(): string {
    this.operation += 1;
    return `operation-test-${this.operation}`;
  }
}

describe('Product Experience activity slice', () => {
  it('rejects contextual navigation created for a different Workspace', async () => {
    const engine = createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: {now: () => 1_700_000_000_000},
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
    });
    const opened = await engine.open(scope);
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    const meals = resolveDestinationTarget(
      coreDestinationRegistry,
      createStoredDestinationTarget(CORE_DESTINATION_IDS.meals),
      undefined,
      {platform: 'ios'},
    );
    if (meals.status !== 'available') {
      throw new Error('Meals must be available.');
    }
    const implementations = new ProductImplementationRegistry([
      {
        implementationKey: CORE_IMPLEMENTATION_KEYS.trends,
        render: host => (
          <>
            <Text testID="context-source">Trends probe</Text>
            <Pressable
              onPress={() =>
                host.onOpenDestinationRequest(
                  createDestinationRequest(meals, {
                    workspaceId: 'workspace-other',
                    focus: {
                      kind: 'journal-entry',
                      entryKind: 'meal',
                      entryId: 'meal-stale',
                    },
                  }),
                )
              }
              testID="open-stale-context"
            />
            <Pressable
              onPress={() =>
                host.onOpenDestinationRequest(
                  createDestinationRequest(meals, {
                    workspaceId: scope.workspaceId,
                    focus: {
                      kind: 'journal-entry',
                      entryKind: 'meal',
                      entryId: 'meal-active',
                    },
                  }),
                )
              }
              testID="open-active-context"
            />
          </>
        ),
      },
      {
        implementationKey: CORE_IMPLEMENTATION_KEYS.meals,
        render: host => (
          <Text testID="context-entry">
            {host.request.focus?.kind === 'journal-entry'
              ? host.request.focus.entryId
              : 'missing'}
          </Text>
        ),
      },
    ]);

    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        withTheme(
          <ProductExperience
            implementationRegistry={implementations}
            journalWorkspace={opened.value}
            locale="en"
            personalizationLayout="phone"
            runtime={{platform: 'ios'}}
          />,
        ),
      );
    });
    act(() =>
      tree!.root
        .findByProps({testID: 'hub-category-understand'})
        .props.onPress(),
    );
    const trendsTile = tree!.root
      .findAllByProps({testID: 'hub-grid-understand-tile-core.trends'})
      .find(node => node.type === Pressable);
    act(() => trendsTile?.props.onPress());

    act(() =>
      tree!.root.findByProps({testID: 'open-stale-context'}).props.onPress(),
    );
    expect(tree!.root.findAllByProps({testID: 'context-entry'})).toHaveLength(
      0,
    );
    expect(tree!.root.findByProps({testID: 'context-source'})).toBeTruthy();

    act(() =>
      tree!.root.findByProps({testID: 'open-active-context'}).props.onPress(),
    );
    expect(
      tree!.root.findByProps({testID: 'context-entry'}).props.children,
    ).toBe('meal-active');
    const shellControl = (testID: string): renderer.ReactTestInstance => {
      const control = tree!.root
        .findAllByProps({testID})
        .find(node => node.type === Pressable);
      if (!control) {
        throw new Error(`Missing shell control ${testID}.`);
      }
      return control;
    };
    act(() => shellControl('shell-control-back').props.onPress());
    expect(tree!.root.findByProps({testID: 'context-source'})).toBeTruthy();
    expect(
      shellControl('shell-control-forward').props.accessibilityState,
    ).toMatchObject({disabled: false});
    act(() => shellControl('shell-control-forward').props.onPress());
    expect(
      tree!.root.findByProps({testID: 'context-entry'}).props.children,
    ).toBe('meal-active');
    act(() => tree!.unmount());
  });

  it('opens Activity from the Hub and persists start/finish locally', async () => {
    const clock = {now: () => 1_700_000_000_000};
    const engine = createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock,
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
    });
    const opened = await engine.open(scope);
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        withTheme(
          <ProductExperience
            journalWorkspace={opened.value}
            locale="en"
            personalizationLayout="phone"
            runtime={{platform: 'ios'}}
          />,
        ),
      );
    });

    act(() =>
      tree!.root.findByProps({testID: 'hub-category-record'}).props.onPress(),
    );

    const activityTiles = tree!.root
      .findAllByProps({testID: 'hub-grid-record-tile-core.activity'})
      .filter(node => node.type === Pressable);
    expect(activityTiles.length).toBeGreaterThan(0);
    act(() => {
      activityTiles[0]!.props.onPress();
    });

    expect(tree!.root.findByProps({testID: 'activities-view'})).toBeTruthy();

    act(() => {
      tree!.root.findByProps({testID: 'activities-add-toggle'}).props.onPress();
    });
    await act(async () => {
      await tree!.root
        .findByProps({testID: 'activity-create-save'})
        .props.onPress();
    });

    const started = opened.value.activities.getListSnapshot().items[0];
    if (started === undefined) {
      throw new Error('Expected the Activity capture to be locally visible.');
    }
    expect(started).toMatchObject({
      category: 'walking',
      syncState: {kind: 'pending'},
    });
    expect(Number.isSafeInteger(started.startedAt)).toBe(true);
    expect(started.endedAt).toBeUndefined();
    expect(
      tree!.root.findByProps({testID: `activity-card-${started.id}`}),
    ).toBeTruthy();

    await act(async () => {
      await tree!.root
        .findByProps({testID: `activity-finish-card-${started.id}`})
        .props.onPress();
    });

    const finished = opened.value.activities.getListSnapshot().items[0];
    expect(finished?.endedAt).toBeGreaterThanOrEqual(started.startedAt);
    expect(opened.value.outbox.getSnapshot()).toHaveLength(2);

    act(() => {
      tree!.unmount();
    });
  });

  it('refreshes elapsed time while an Activity remains ongoing', async () => {
    jest.useFakeTimers();
    try {
      const startedAt = 1_700_000_000_000;
      let displayNow = startedAt;
      const engine = createJournalEngine({
        localStore: new InMemoryJournalLocalStore(),
        clock: {now: () => startedAt},
        ids: new TestIds(),
        mediaStore: new AppOwnedUriJournalMediaStore(),
      });
      const opened = await engine.open(scope);
      if (!opened.ok) {
        throw new Error(opened.error.message);
      }
      const captured = await opened.value.activities.capture({
        category: 'walking',
        startedAt,
      });
      if (!captured.ok) {
        throw new Error(captured.error.message);
      }

      let tree: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(
          withTheme(
            <ActivitiesView
              formatTime={() => '09:00'}
              locale="en"
              now={() => displayNow}
              workspace={opened.value.activities}
            />,
          ),
        );
      });

      displayNow += 2 * 60_000;
      act(() => {
        jest.advanceTimersByTime(60_000);
      });

      expect(
        tree!.root
          .findAllByType(Text)
          .filter(node => node.props.children === '2 min'),
      ).toHaveLength(1);
      act(() => tree!.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps Activity intensity selection explicit and stable', async () => {
    const engine = createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: {now: () => 1_700_000_000_000},
      ids: new TestIds(),
      mediaStore: new AppOwnedUriJournalMediaStore(),
    });
    const opened = await engine.open(scope);
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }

    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        withTheme(
          <ActivitiesView locale="en" workspace={opened.value.activities} />,
        ),
      );
    });
    act(() => {
      tree!.root.findByProps({testID: 'activities-add-toggle'}).props.onPress();
    });

    const radio = (testID: string): renderer.ReactTestInstance => {
      const match = tree!.root
        .findAllByProps({testID})
        .find(node => node.props.accessibilityRole === 'radio');
      if (match === undefined) {
        throw new Error(`Expected radio ${testID}.`);
      }
      return match;
    };
    const none = () => radio('activity-create-intensity-none');
    const high = () => radio('activity-create-intensity-high');
    expect(none().props.accessibilityState).toEqual({selected: true});
    expect(high().props.accessibilityState).toEqual({selected: false});

    act(() => high().props.onPress());
    expect(none().props.accessibilityState).toEqual({selected: false});
    expect(high().props.accessibilityState).toEqual({selected: true});

    act(() => high().props.onPress());
    expect(high().props.accessibilityState).toEqual({selected: true});

    act(() => none().props.onPress());
    expect(none().props.accessibilityState).toEqual({selected: true});
    expect(high().props.accessibilityState).toEqual({selected: false});
    act(() => tree!.unmount());
  });
});
