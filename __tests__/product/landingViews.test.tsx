import React from 'react';
import {Pressable, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {AiAnalystLandingView} from '../../src/product/ai';
import {CORE_DESTINATION_IDS} from '../../src/product/destinations';
import {TrendsLandingView} from '../../src/product/trends';

const runtime = {platform: 'ios'} as const;

const pressByTestID = (
  tree: renderer.ReactTestRenderer,
  testID: string,
): void => {
  const pressable = tree.root
    .findAllByType(Pressable)
    .find(node => node.props.testID === testID);
  if (!pressable) {
    throw new Error(`Expected Pressable with testID ${testID}.`);
  }

  act(() => pressable.props.onPress());
};

const headerCopy = (tree: renderer.ReactTestRenderer): readonly unknown[] =>
  tree.root
    .findAllByType(Text)
    .filter(node => node.props.accessibilityRole === 'header')
    .map(node => node.props.children);

const pressableTestIDs = (
  tree: renderer.ReactTestRenderer,
): readonly unknown[] =>
  tree.root
    .findAllByType(Pressable)
    .map(node => node.props.testID)
    .filter(Boolean);

describe('Product landing views', () => {
  it('keeps Trends categories, card IDs, and child Destination identity', () => {
    const onOpenDestination = jest.fn();
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <TrendsLandingView
          locale="en"
          onOpenDestination={onOpenDestination}
          runtime={runtime}
        />,
      );
    });

    expect(headerCopy(tree!)).toEqual([
      'Trends',
      'Explore trends',
      'Focused investigations',
    ]);
    expect(pressableTestIDs(tree!)).toEqual([
      `trends-destination-${CORE_DESTINATION_IDS.trendsOverview}`,
      `trends-destination-${CORE_DESTINATION_IDS.trendsAgpDailyPatterns}`,
      `trends-destination-${CORE_DESTINATION_IDS.trendsComparePeriods}`,
      `trends-destination-${CORE_DESTINATION_IDS.hypoInvestigation}`,
      `trends-destination-${CORE_DESTINATION_IDS.loopChangesImpact}`,
    ]);

    pressByTestID(
      tree!,
      `trends-destination-${CORE_DESTINATION_IDS.trendsComparePeriods}`,
    );

    expect(onOpenDestination).toHaveBeenCalledTimes(1);
    expect(onOpenDestination).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'available',
        target: expect.objectContaining({
          destinationId: CORE_DESTINATION_IDS.trendsComparePeriods,
        }),
        destination: expect.objectContaining({
          id: CORE_DESTINATION_IDS.trendsComparePeriods,
          kind: 'module-child',
          ownerModuleId: CORE_DESTINATION_IDS.trends,
        }),
      }),
    );

    act(() => tree!.unmount());
  });

  it('shows Therapy Context only after its explicit source-quality gate passes', () => {
    const onOpenDestination = jest.fn();
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <TrendsLandingView
          locale="en"
          onOpenDestination={onOpenDestination}
          runtime={runtime}
          therapyContextQuality={{
            sourceReliability: 'unverified',
            coveragePercent: 100,
          }}
        />,
      );
    });
    expect(pressableTestIDs(tree!)).not.toContain(
      `trends-destination-${CORE_DESTINATION_IDS.trendsTherapyContext}`,
    );

    act(() => {
      tree!.update(
        <TrendsLandingView
          locale="he"
          onOpenDestination={onOpenDestination}
          runtime={runtime}
          therapyContextQuality={{
            sourceReliability: 'reliable',
            coveragePercent: 70,
          }}
        />,
      );
    });
    expect(headerCopy(tree!)).toContain('הקשר טיפולי');
    expect(pressableTestIDs(tree!)).toContain(
      `trends-destination-${CORE_DESTINATION_IDS.trendsTherapyContext}`,
    );
    act(() => tree!.unmount());
  });

  it('keeps AI chat primary and gives onLaunchCurrent handler precedence', () => {
    const onOpenDestination = jest.fn();
    const onLaunchCurrent = jest.fn();
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <AiAnalystLandingView
          locale="en"
          onLaunchCurrent={onLaunchCurrent}
          onOpenDestination={onOpenDestination}
          runtime={runtime}
        />,
      );
    });

    expect(headerCopy(tree!)).toEqual([
      'AI analyst',
      'Investigations',
      'Improvements',
    ]);
    expect(pressableTestIDs(tree!)).toEqual([
      'ai-general-chat',
      `ai-specialist-${CORE_DESTINATION_IDS.aiHypoSpecialist}`,
      `ai-specialist-${CORE_DESTINATION_IDS.aiBehaviorSpecialist}`,
      `ai-specialist-${CORE_DESTINATION_IDS.aiMealSpecialist}`,
      `ai-specialist-${CORE_DESTINATION_IDS.aiLoopSpecialist}`,
    ]);

    pressByTestID(tree!, 'ai-general-chat');
    pressByTestID(
      tree!,
      `ai-specialist-${CORE_DESTINATION_IDS.aiLoopSpecialist}`,
    );

    expect(onOpenDestination).not.toHaveBeenCalled();
    expect(
      onLaunchCurrent.mock.calls.map(([destination]) => ({
        id: destination.target.destinationId,
        kind: destination.destination.kind,
        ownerModuleId: destination.destination.ownerModuleId,
      })),
    ).toEqual([
      {
        id: CORE_DESTINATION_IDS.aiGeneralChat,
        kind: 'module-child',
        ownerModuleId: CORE_DESTINATION_IDS.aiAnalyst,
      },
      {
        id: CORE_DESTINATION_IDS.aiLoopSpecialist,
        kind: 'module-child',
        ownerModuleId: CORE_DESTINATION_IDS.aiAnalyst,
      },
    ]);

    act(() => tree!.unmount());
  });

  it('falls back to onOpenDestination when AI has no current launcher', () => {
    const onOpenDestination = jest.fn();
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <AiAnalystLandingView
          locale="en"
          onOpenDestination={onOpenDestination}
          runtime={runtime}
        />,
      );
    });

    pressByTestID(tree!, 'ai-general-chat');
    pressByTestID(
      tree!,
      `ai-specialist-${CORE_DESTINATION_IDS.aiMealSpecialist}`,
    );

    expect(
      onOpenDestination.mock.calls.map(
        ([destination]) => destination.target.destinationId,
      ),
    ).toEqual([
      CORE_DESTINATION_IDS.aiGeneralChat,
      CORE_DESTINATION_IDS.aiMealSpecialist,
    ]);

    act(() => tree!.unmount());
  });
});
