import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Pressable, Text, TextInput} from 'react-native';
import {
  AppOwnedUriJournalMediaStore,
  InMemoryJournalLocalStore,
  createJournalEngine,
  decodeExternalRecordPayload,
  journalOk,
  parseNightscoutSourceId,
  parseProductUserId,
  parseWorkspaceId,
  toExternalRecordReference,
} from '../../src/modules/journal';
import type {
  JournalEntityKind,
  JournalExternalRecordReader,
  JournalIdGenerator,
  JournalWorkspace,
  JournalWorkspaceScope,
  MealExternalCandidate,
  ActivityExternalCandidate,
  ParseResult,
} from '../../src/modules/journal';
import {ActivitiesView} from '../../src/product/activities';
import {MealsView} from '../../src/product/meals';
import type {MealImagesRuntime} from '../../src/modules/mealMedia';
import {formatJournalDateTime} from '../../src/product/journal/formValues';

const valueOf = <T,>(result: ParseResult<T>): T => {
  if (!result.ok) {
    throw new Error('Invalid fixture value.');
  }
  return result.value;
};

const scope: JournalWorkspaceScope = {
  productUserId: valueOf(parseProductUserId('journal-view-user')),
  workspaceId: valueOf(parseWorkspaceId('journal-view-workspace')),
  nightscoutSourceId: valueOf(
    parseNightscoutSourceId('journal-view-nightscout'),
  ),
};

class TestIds implements JournalIdGenerator {
  private entry = 0;
  private operation = 0;

  nextEntryId(kind: JournalEntityKind): string {
    this.entry += 1;
    return `${kind}-view-${this.entry}`;
  }

  nextOperationId(): string {
    this.operation += 1;
    return `operation-view-${this.operation}`;
  }
}

const record = (id: string) => {
  const decoded = valueOf(
    decodeExternalRecordPayload({_id: id}, scope.nightscoutSourceId),
  );
  return valueOf(toExternalRecordReference(decoded));
};

const mealCandidates: readonly MealExternalCandidate[] = [
  {
    kind: 'carbohydrate',
    record: record('increment-1'),
    snapshot: {
      kind: 'carbohydrate',
      externalCarbTime: 1_777_777_700_000,
      carbohydratesGrams: 5,
    },
    reason: 'Near the meal start',
  },
  {
    kind: 'carbohydrate',
    record: record('increment-2'),
    snapshot: {
      kind: 'carbohydrate',
      externalCarbTime: 1_777_777_760_000,
      carbohydratesGrams: 5,
    },
    reason: 'Near the meal start',
  },
];

const activityCandidates: readonly ActivityExternalCandidate[] = [
  {
    kind: 'activity',
    record: record('activity-external-1'),
    snapshot: {
      kind: 'activity',
      startedAt: 1_777_777_700_000,
      endedAt: 1_777_779_500_000,
      eventType: 'Exercise',
    },
    reason: 'Overlapping activity record',
  },
];

const openWorkspace = async (): Promise<JournalWorkspace> => {
  let clock = 1_777_780_000_000;
  const externalRecords: JournalExternalRecordReader = {
    findMealCandidates: async () => journalOk(mealCandidates),
    findActivityCandidates: async () => journalOk(activityCandidates),
    readLinkedRecord: async (_scope, input) =>
      journalOk({
        kind: 'available',
        record: input.record,
        snapshot: input.lastKnown,
      }),
  };
  const result = await createJournalEngine({
    localStore: new InMemoryJournalLocalStore(),
    mediaStore: new AppOwnedUriJournalMediaStore(),
    clock: {now: () => ++clock},
    ids: new TestIds(),
    externalRecords,
  }).open(scope);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};

const press = (
  tree: renderer.ReactTestRenderer,
  testID: string,
): renderer.ReactTestInstance => {
  const target = tree.root
    .findAllByProps({testID})
    .find(node => node.type === Pressable);
  if (target === undefined) {
    throw new Error(`Missing press target ${testID}`);
  }
  return target;
};

const change = (
  tree: renderer.ReactTestRenderer,
  testID: string,
  value: string,
): void => {
  tree.root.findByProps({testID}).props.onChangeText(value);
};

describe('Journal management views', () => {
  it('explicitly selects distinct Loop records while creating a meal and links them after capture', async () => {
    const workspace = await openWorkspace();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <MealsView
          locale="en"
          now={() => 1_777_779_900_000}
          workspace={workspace.meals}
        />,
      );
    });

    act(() => press(tree!, 'meals-add-toggle').props.onPress());
    await act(async () =>
      press(tree!, 'meal-create-find-links').props.onPress(),
    );
    act(() =>
      press(tree!, 'meal-create-link-increment-1-meal').props.onPress(),
    );
    expect(
      tree!.root.findByProps({testID: 'meal-create-carbohydrates'}).props.value,
    ).toBe('5');
    expect(tree!.root.findByProps({testID: 'meal-create-start'}).props.value).toBe(
      formatJournalDateTime(1_777_777_700_000),
    );

    act(() =>
      press(tree!, 'meal-create-link-increment-2-meal').props.onPress(),
    );
    expect(
      tree!.root.findByProps({testID: 'meal-create-selected-links'}),
    ).toBeDefined();
    await act(async () => press(tree!, 'meal-create-save').props.onPress());

    const captured = workspace.meals.getListSnapshot().items[0];
    expect(captured?.mealCarbohydrates?.grams).toBe(5);
    expect(captured?.externalLinks).toHaveLength(2);
    expect(captured?.externalLinks.map(link => link.record.identifiers._id)).toEqual([
      'increment-1',
      'increment-2',
    ]);
    expect(captured?.reportedCarbohydrates).toMatchObject({
      totalGrams: 10,
      componentCount: 2,
    });
    act(() => tree!.unmount());
  });

  it('does not replace user-entered meal carbohydrates with reported Loop carbohydrates', async () => {
    const workspace = await openWorkspace();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <MealsView
          locale="en"
          now={() => 1_777_779_900_000}
          workspace={workspace.meals}
        />,
      );
    });

    act(() => press(tree!, 'meals-add-toggle').props.onPress());
    act(() => change(tree!, 'meal-create-carbohydrates', '42'));
    await act(async () =>
      press(tree!, 'meal-create-find-links').props.onPress(),
    );
    act(() =>
      press(tree!, 'meal-create-link-increment-1-meal').props.onPress(),
    );
    expect(
      tree!.root.findByProps({testID: 'meal-create-carbohydrates'}).props.value,
    ).toBe('42');
    await act(async () => press(tree!, 'meal-create-save').props.onPress());

    const captured = workspace.meals.getListSnapshot().items[0];
    expect(captured?.mealCarbohydrates?.grams).toBe(42);
    expect(captured?.reportedCarbohydrates).toMatchObject({
      totalGrams: 5,
      componentCount: 1,
    });
    act(() => tree!.unmount());
  });

  it('confirms a meal-link transfer and offers one-step undo', async () => {
    const workspace = await openWorkspace();
    const source = await workspace.meals.capture({
      mealStart: 1_777_777_700_000,
      name: 'Earlier meal',
    });
    const destination = await workspace.meals.capture({
      mealStart: 1_777_777_760_000,
      name: 'Correct meal',
    });
    if (!source.ok || !destination.ok) {
      throw new Error('Transfer fixtures failed.');
    }
    const transferCandidate = mealCandidates[0]!;
    if (transferCandidate.kind !== 'carbohydrate') {
      throw new Error('Expected a carbohydrate fixture.');
    }
    const linked = await workspace.meals.linkExternalEvent({
      mealId: source.value.id,
      expectedRevision: source.value.revision,
      record: transferCandidate.record,
      snapshot: transferCandidate.snapshot,
      role: {kind: 'reported_carbohydrate', purpose: 'meal'},
    });
    if (!linked.ok) {
      throw new Error(linked.error.message);
    }
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <MealsView
          focusedMealId={destination.value.id}
          locale="en"
          workspace={workspace.meals}
        />,
      );
    });
    await act(async () =>
      press(tree!, `meal-find-links-${destination.value.id}`).props.onPress(),
    );
    act(() => press(tree!, 'meal-link-increment-1-meal').props.onPress());
    expect(
      tree!.root.findByProps({
        testID: 'meal-transfer-confirmation-increment-1',
      }),
    ).toBeDefined();
    expect(workspace.meals.getSnapshot(source.value.id)?.externalLinks).toHaveLength(1);

    await act(async () =>
      press(tree!, 'meal-transfer-confirm-increment-1').props.onPress(),
    );
    expect(workspace.meals.getSnapshot(source.value.id)?.externalLinks).toHaveLength(0);
    expect(
      workspace.meals.getSnapshot(destination.value.id)?.externalLinks,
    ).toHaveLength(1);

    await act(async () => press(tree!, 'meal-undo-transfer').props.onPress());
    expect(workspace.meals.getSnapshot(source.value.id)?.externalLinks).toHaveLength(1);
    expect(
      workspace.meals.getSnapshot(destination.value.id)?.externalLinks,
    ).toHaveLength(0);
    act(() => tree!.unmount());
  });

  it('shows image picker errors in the selected language', async () => {
    const workspace = await openWorkspace();
    const imagesRuntime: MealImagesRuntime = {
      store: new AppOwnedUriJournalMediaStore(),
      pick: jest.fn().mockResolvedValue({
        kind: 'error',
        code: 'too_large',
        message: 'Meal Images must be 10 MB or smaller.',
      }),
      resolve: jest.fn(async () => undefined),
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <MealsView
          imagesRuntime={imagesRuntime}
          locale="he"
          now={() => 1_777_777_700_000}
          workspace={workspace.meals}
        />,
      );
    });

    act(() => press(tree!, 'meals-add-toggle').props.onPress());
    await act(async () =>
      press(tree!, 'meal-create-image-library').props.onPress(),
    );

    expect(
      tree!.root.findByProps({testID: 'meal-create-image-error'}).findByType(Text)
        .props.children,
    ).toBe('תמונת ארוחה יכולה להיות בגודל של עד 10 MB.');
    act(() => tree!.unmount());
  });

  it('captures an image-only meal through the bilingual offline-first editor', async () => {
    const workspace = await openWorkspace();
    const imagesRuntime: MealImagesRuntime = {
      store: new AppOwnedUriJournalMediaStore(),
      pick: jest.fn().mockResolvedValue({
        kind: 'selected',
        image: {
          uri: 'file:///picker/lunch.jpg',
          mimeType: 'image/jpeg',
          byteSize: 250_000,
          widthPx: 1200,
          heightPx: 900,
        },
      }),
      resolve: jest.fn(async image =>
        image.syncState.kind === 'available'
          ? image.syncState.localUri ?? image.syncState.displayUri
          : image.syncState.localUri,
      ),
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <MealsView
          imagesRuntime={imagesRuntime}
          locale="he"
          now={() => 1_777_777_700_000}
          workspace={workspace.meals}
        />,
      );
    });

    act(() => press(tree!, 'meals-add-toggle').props.onPress());
    await act(async () =>
      press(tree!, 'meal-create-image-library').props.onPress(),
    );
    expect(
      tree!.root.findByProps({testID: 'meal-create-image-preview'}),
    ).toBeDefined();
    await act(async () => press(tree!, 'meal-create-save').props.onPress());

    const captured = workspace.meals.getListSnapshot().items[0];
    expect(captured?.image).toMatchObject({
      mimeType: 'image/jpeg',
      byteSize: 250_000,
      syncState: {
        kind: 'local_only',
        localUri: 'file:///picker/lunch.jpg',
      },
    });
    act(() => tree!.unmount());
  });

  it('manages a meal end-to-end and keeps separate incremental Loop records', async () => {
    const workspace = await openWorkspace();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <MealsView
          locale="en"
          now={() => 1_777_777_700_000}
          workspace={workspace.meals}
        />,
      );
    });

    act(() => press(tree!, 'meals-add-toggle').props.onPress());
    act(() => {
      change(tree!, 'meal-create-name', 'Lunch');
      change(tree!, 'meal-create-carbohydrates', '42');
      change(tree!, 'meal-create-notes', 'At school');
      change(tree!, 'meal-create-tags', 'school, lunch');
    });
    await act(async () => press(tree!, 'meal-create-save').props.onPress());

    const captured = workspace.meals.getListSnapshot().items[0];
    expect(captured).toMatchObject({
      name: 'Lunch',
      mealCarbohydrates: {grams: 42},
      notes: 'At school',
      tags: ['school', 'lunch'],
    });
    act(() => press(tree!, `meal-open-${captured?.id}`).props.onPress());
    expect(tree!.root.findByProps({testID: 'meal-detail'})).toBeDefined();

    act(() => press(tree!, `meal-edit-${captured?.id}`).props.onPress());
    act(() => change(tree!, 'meal-edit-carbohydrates', '45'));
    await act(async () => press(tree!, 'meal-edit-save').props.onPress());
    expect(
      workspace.meals.getSnapshot(captured!.id)?.mealCarbohydrates?.grams,
    ).toBe(45);

    await act(async () =>
      press(tree!, `meal-find-links-${captured?.id}`).props.onPress(),
    );
    await act(async () =>
      press(tree!, 'meal-link-increment-1-meal').props.onPress(),
    );
    await act(async () =>
      press(tree!, 'meal-link-increment-2-meal').props.onPress(),
    );
    const linked = workspace.meals.getSnapshot(captured!.id);
    expect(linked?.externalLinks).toHaveLength(2);
    expect(linked?.reportedCarbohydrates).toMatchObject({
      totalGrams: 10,
      componentCount: 2,
    });
    expect(linked?.mealCarbohydrates?.grams).toBe(45);

    await act(async () =>
      press(tree!, 'meal-refresh-increment-1').props.onPress(),
    );
    expect(
      workspace.meals.getSnapshot(captured!.id)?.externalLinks,
    ).toHaveLength(2);

    await act(async () =>
      press(tree!, 'meal-unlink-increment-1').props.onPress(),
    );
    const afterUnlink = workspace.meals.getSnapshot(captured!.id);
    expect(afterUnlink?.externalLinks).toHaveLength(1);
    expect(afterUnlink?.reportedCarbohydrates).toMatchObject({
      totalGrams: 5,
      componentCount: 1,
    });
    expect(afterUnlink?.mealCarbohydrates?.grams).toBe(45);

    await act(async () =>
      press(tree!, `meal-trash-${captured?.id}`).props.onPress(),
    );
    act(() => press(tree!, 'meals-show-trash').props.onPress());
    await act(async () =>
      press(tree!, `meal-restore-${captured?.id}`).props.onPress(),
    );
    expect(workspace.meals.getSnapshot(captured!.id)?.lifecycle.kind).toBe(
      'active',
    );
    act(() => tree!.unmount());
  });

  it('opens a focused activity and supports full ongoing management', async () => {
    const workspace = await openWorkspace();
    const captured = await workspace.activities.capture({
      category: 'walking',
      startedAt: 1_777_777_700_000,
      intensity: 'low',
      notes: 'Park',
      tags: ['outside'],
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ActivitiesView
          focusedActivityId={captured.value.id}
          locale="he"
          now={() => 1_777_779_500_000}
          workspace={workspace.activities}
        />,
      );
    });
    expect(tree!.root.findByProps({testID: 'activity-detail'})).toBeDefined();
    await act(async () =>
      press(tree!, `activity-finish-${captured.value.id}`).props.onPress(),
    );
    expect(workspace.activities.getSnapshot(captured.value.id)?.endedAt).toBe(
      1_777_779_500_000,
    );

    act(() =>
      press(tree!, `activity-edit-${captured.value.id}`).props.onPress(),
    );
    act(() => {
      press(tree!, 'activity-edit-category-strength').props.onPress();
      press(tree!, 'activity-edit-intensity-high').props.onPress();
      change(tree!, 'activity-edit-notes', 'Intervals');
    });
    await act(async () => press(tree!, 'activity-edit-save').props.onPress());
    expect(workspace.activities.getSnapshot(captured.value.id)).toMatchObject({
      category: 'strength',
      intensity: 'high',
      notes: 'Intervals',
    });

    await act(async () =>
      press(tree!, `activity-find-links-${captured.value.id}`).props.onPress(),
    );
    await act(async () =>
      press(tree!, 'activity-link-activity-external-1').props.onPress(),
    );
    expect(
      workspace.activities.getSnapshot(captured.value.id)?.externalLinks,
    ).toHaveLength(1);
    await act(async () =>
      press(tree!, 'activity-refresh-activity-external-1').props.onPress(),
    );
    expect(
      workspace.activities.getSnapshot(captured.value.id)?.externalLinks,
    ).toHaveLength(1);

    await act(async () =>
      press(tree!, `activity-trash-${captured.value.id}`).props.onPress(),
    );
    act(() => press(tree!, 'activities-show-trash').props.onPress());
    await act(async () =>
      press(tree!, `activity-restore-${captured.value.id}`).props.onPress(),
    );
    expect(
      workspace.activities.getSnapshot(captured.value.id)?.lifecycle.kind,
    ).toBe('active');

    const hebrewHeading = tree!.root
      .findAllByType(TextInput)
      .find(node => node.props.testID === 'activity-edit-notes');
    expect(hebrewHeading).toBeUndefined();
    act(() => tree!.unmount());
  });

  it('confirms an activity-link transfer and can undo it', async () => {
    const workspace = await openWorkspace();
    const source = await workspace.activities.capture({
      category: 'walking',
      customName: 'First walk',
      startedAt: 1_777_777_700_000,
      endedAt: 1_777_778_000_000,
    });
    const destination = await workspace.activities.capture({
      category: 'walking',
      customName: 'Correct walk',
      startedAt: 1_777_777_760_000,
      endedAt: 1_777_778_060_000,
    });
    if (!source.ok || !destination.ok) {
      throw new Error('Activity transfer fixtures failed.');
    }
    const transferCandidate = activityCandidates[0]!;
    if (transferCandidate.kind !== 'activity') {
      throw new Error('Expected an activity fixture.');
    }
    const linked = await workspace.activities.linkExternalEvent({
      activityId: source.value.id,
      expectedRevision: source.value.revision,
      record: transferCandidate.record,
      snapshot: transferCandidate.snapshot,
      role: {kind: 'activity'},
    });
    if (!linked.ok) {
      throw new Error(linked.error.message);
    }
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ActivitiesView
          focusedActivityId={destination.value.id}
          locale="en"
          now={() => 1_777_779_500_000}
          workspace={workspace.activities}
        />,
      );
    });
    await act(async () =>
      press(
        tree!,
        `activity-find-links-${destination.value.id}`,
      ).props.onPress(),
    );
    act(() =>
      press(tree!, 'activity-link-activity-external-1').props.onPress(),
    );
    expect(
      tree!.root.findByProps({
        testID: 'activity-transfer-confirmation-activity-external-1',
      }),
    ).toBeDefined();
    expect(
      workspace.activities.getSnapshot(source.value.id)?.externalLinks,
    ).toHaveLength(1);

    await act(async () =>
      press(
        tree!,
        'activity-transfer-confirm-activity-external-1',
      ).props.onPress(),
    );
    expect(
      workspace.activities.getSnapshot(source.value.id)?.externalLinks,
    ).toHaveLength(0);
    expect(
      workspace.activities.getSnapshot(destination.value.id)?.externalLinks,
    ).toHaveLength(1);

    await act(async () =>
      press(tree!, 'activity-undo-transfer').props.onPress(),
    );
    expect(
      workspace.activities.getSnapshot(source.value.id)?.externalLinks,
    ).toHaveLength(1);
    expect(
      workspace.activities.getSnapshot(destination.value.id)?.externalLinks,
    ).toHaveLength(0);
    act(() => tree!.unmount());
  });

  it('surfaces an optimistic edit conflict without replacing either version', async () => {
    const workspace = await openWorkspace();
    const captured = await workspace.meals.capture({
      mealStart: 1_777_777_700_000,
      name: 'Original',
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <MealsView
          focusedMealId={captured.value.id}
          locale="en"
          workspace={workspace.meals}
        />,
      );
    });
    act(() => press(tree!, `meal-edit-${captured.value.id}`).props.onPress());
    act(() => change(tree!, 'meal-edit-name', 'Draft name'));
    await act(async () => {
      await workspace.meals.revise({
        mealId: captured.value.id,
        expectedRevision: captured.value.revision,
        name: {kind: 'set', value: 'Other device'},
      });
    });
    await act(async () => press(tree!, 'meal-edit-save').props.onPress());

    expect(
      tree!.root.findByProps({testID: 'meal-conflict-panel'}),
    ).toBeDefined();
    expect(workspace.meals.getSnapshot(captured.value.id)?.name).toBe(
      'Other device',
    );
    const conflict = await workspace.meals.inspectConflicts(captured.value.id);
    if (!conflict.ok || conflict.value[0] === undefined) {
      throw new Error('Expected a recoverable conflict.');
    }
    await act(async () =>
      press(
        tree!,
        `meal-conflict-${conflict.value[0]?.conflictId}-keep`,
      ).props.onPress(),
    );
    expect(
      await workspace.meals.inspectConflicts(captured.value.id),
    ).toMatchObject({ok: true, value: []});
    expect(workspace.meals.getSnapshot(captured.value.id)?.name).toBe(
      'Other device',
    );
    act(() => tree!.unmount());
  });
});
