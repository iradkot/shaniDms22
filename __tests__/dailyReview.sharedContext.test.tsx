import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import DailyReviewScreen from 'app/containers/MainTabsNavigator/Containers/Home/DailyReviewScreen';
import {
  fetchBgDataForDateRangeUncached,
  fetchTreatmentsForDateRangeUncached,
} from 'app/api/apiRequests';
import {
  loadInsulinContext,
  type InsulinContext,
} from 'app/services/insulin/insulinDataSource';
import {getLatestDailyBrief} from 'app/services/proactiveCare/dailyBrief';

jest.mock('app/api/apiRequests', () => ({
  fetchBgDataForDateRangeUncached: jest.fn(async () => []),
  fetchTreatmentsForDateRangeUncached: jest.fn(async () => []),
  getUserProfileFromNightscout: jest.fn(async () => []),
}));
jest.mock('app/services/insulin/insulinDataSource', () => ({
  loadInsulinContext: jest.fn(),
}));
jest.mock('app/api/shaniNightscoutInstances', () => ({
  getNightscoutConfigurationRevision: () => 1,
  subscribeNightscoutConfiguration: () => () => {},
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: jest.fn()}),
}));
jest.mock('app/contexts/AiSettingsContext', () => {
  const settings = {
    enabled: false,
    apiKey: '',
    openAiModel: 'test',
    personality: 'neutral',
  };
  return {useAiSettings: () => ({settings})};
});
jest.mock('app/contexts/GlucoseSettingsContext', () => {
  const settings = {hypo: 70, hyper: 180};
  return {useGlucoseSettings: () => ({settings})};
});
jest.mock('app/contexts/AppLanguageContext', () => ({
  useAppLanguage: () => ({language: 'en'}),
}));
jest.mock('app/services/aiMemory/useActiveAiWorkspaceScope', () => ({
  useActiveAiWorkspaceScope: () => null,
}));
jest.mock('app/services/proactiveCare/dailyBrief', () => ({
  getLatestDailyBrief: jest.fn(async () => null),
}));
jest.mock('app/services/aiMemory/aiMemoryStore', () => ({
  addMemoryEntry: jest.fn(),
}));
jest.mock('app/services/loopAssist/loopAdjustmentAssist', () => ({
  detectLoopAdjustmentTrend: jest.fn(async () => ({detected: false})),
}));
jest.mock('app/utils/stackedChartsData.utils', () => ({
  fetchStackedChartsDataForRange: jest.fn(),
  buildFullScreenStackedChartsParams: jest.fn(),
}));
jest.mock('app/utils/fullscreenNavigation.utils', () => ({
  pushFullScreenStackedCharts: jest.fn(),
}));
jest.mock(
  'app/containers/MainTabsNavigator/Containers/Home/components/TimeInRangeRow',
  () => 'TimeInRangeRow',
);
jest.mock('app/components/common-ui/ScoreBadge/ScoreBadge', () => 'ScoreBadge');
jest.mock('@notifee/react-native', () => ({TriggerType: {TIMESTAMP: 0}}));

const context = (): InsulinContext => ({
  treatments: [],
  deviceStatus: [],
  profileData: null,
  insulinData: [],
  basalProfileData: [],
  carbTreatments: [],
  loadSamples: [],
  availability: {
    treatments: 'available',
    deviceStatus: 'available',
    profile: 'available',
  },
  freshness: {kind: 'fresh', fetchedAtMs: Date.now()},
});

describe('DailyReview shared insulin context', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(loadInsulinContext).mockReset().mockResolvedValue(context());
    jest.mocked(fetchBgDataForDateRangeUncached).mockResolvedValue([]);
    jest.mocked(getLatestDailyBrief).mockResolvedValue(null);
  });
  afterEach(() => {
    act(() => tree?.unmount());
  });

  it('loads selected-day and baseline insulin through the shared decoder without discarded extra total requests', async () => {
    await act(async () => {
      tree = renderer.create(<DailyReviewScreen />);
    });
    expect(loadInsulinContext).toHaveBeenCalledTimes(2);
    expect(fetchTreatmentsForDateRangeUncached).not.toHaveBeenCalled();
    const [dayRequest, baselineRequest] = jest
      .mocked(loadInsulinContext)
      .mock.calls.map(([request]) => request);
    expect(dayRequest!.endMs - dayRequest!.startMs).toBe(24 * 60 * 60_000);
    expect(baselineRequest!.endMs).toBe(dayRequest!.startMs);
  });

  it('keeps glucose rendered while shared insulin fails and displays a missing-data explanation', async () => {
    jest
      .mocked(fetchBgDataForDateRangeUncached)
      .mockResolvedValue([
        {sgv: 128, date: Date.now(), dateString: new Date().toISOString()},
      ] as any);
    jest
      .mocked(loadInsulinContext)
      .mockRejectedValue(new Error('private transport detail'));
    await act(async () => {
      tree = renderer.create(<DailyReviewScreen />);
    });
    expect(
      tree.root.findAllByType('TimeInRangeRow' as any).length,
    ).toBeGreaterThan(0);
    const text = tree.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .flat()
      .join(' ');
    expect(text).toContain('Some glucose, insulin, or meal data is unavailable or out of date.');
    expect(text).not.toContain('private transport detail');
  });

  it('catches a later review failure and retains glucose instead of leaving loading or an unhandled rejection', async () => {
    jest.mocked(fetchBgDataForDateRangeUncached).mockResolvedValue([
      {sgv: 128, date: Date.now(), dateString: new Date().toISOString()},
    ] as any);
    jest.mocked(getLatestDailyBrief).mockRejectedValueOnce(new Error('private briefing detail'));
    await act(async () => {tree = renderer.create(<DailyReviewScreen />);});
    expect(tree.root.findAllByType('TimeInRangeRow' as any).length).toBeGreaterThan(0);
    const text = tree.root.findAllByType(Text).map(node => node.props.children).flat().join(' ');
    expect(text).toContain('The review could not be fully loaded. Available data is shown below.');
    expect(text).not.toContain('private briefing detail');
  });
});
