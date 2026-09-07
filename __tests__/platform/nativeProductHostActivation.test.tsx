import React from 'react';
import renderer, {act} from 'react-test-renderer';
import ProductExperienceScreen from 'app/containers/ProductExperienceScreen';

const mockLoadTherapyContext = jest.fn(async () => ({
  quality: {sourceReliability: 'reliable', coveragePercent: 100},
}));
let mockProfile: {id: string; baseUrl: string; apiSecretSha1: string} | null = {
  id: 'synthetic-source',
  baseUrl: 'https://synthetic.invalid',
  apiSecretSha1: 'synthetic-credential',
};
const mockEmptyOutbox = [] as const;
let mockJournal: {status: string; workspace?: object} = {status: 'loading'};
let mockProductProps: {
  trendsRuntime?: {therapyContext?: {dataSource: unknown}};
} = {};

jest.mock('@react-native-firebase/app', () => ({getApp: () => ({})}));
jest.mock('@react-native-firebase/auth', () => ({
  getAuth: () => ({currentUser: {uid: 'synthetic-user'}}),
}));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {},
}));
jest.mock('app/contexts/AppLanguageContext', () => ({
  useAppLanguage: () => ({language: 'en', setLanguage: jest.fn()}),
}));
jest.mock('app/contexts/NightscoutConfigContext', () => ({
  useNightscoutConfig: () => ({
    activeProfile: mockProfile,
    isLoaded: true,
    testProfileConnection: jest.fn(),
    pendingLegacyProfileCount: 0,
    recoverLegacyProfiles: jest.fn(),
  }),
}));
jest.mock('app/contexts/GlucoseSettingsContext', () => ({
  useGlucoseSettings: () => ({
    settings: {
      severeHypo: 54,
      hypo: 70,
      hyper: 180,
      severeHyper: 250,
    },
  }),
}));
jest.mock('app/contexts/AiSettingsContext', () => ({
  useAiSettings: () => ({
    settings: {enabled: false, apiKey: ''},
    credentialSyncStatus: {state: 'idle', pending: false},
    retryCredentialSync: jest.fn(),
    setSetting: jest.fn(),
  }),
}));
jest.mock('app/contexts/ProactiveCareSettingsContext', () => ({
  useProactiveCareSettings: () => ({
    settings: {
      enabled: false,
      preMealAssistance: {},
    },
    setSetting: jest.fn(),
  }),
}));
jest.mock('app/product/app', () => ({
  ProductExperience: (props: typeof mockProductProps) => {
    mockProductProps = props;
    return null;
  },
}));
jest.mock('app/platform/native/journal', () => ({
  useNativeJournalWorkspace: () => mockJournal,
}));
jest.mock('app/platform/native/mealMedia', () => ({
  nativeMealImagesRuntime: {},
}));
jest.mock('app/platform/native/alerts/nativeOfflineAlertRepositories', () => ({
  createNativeAlertRulesRepository: () => ({}),
  createNativeUpdateCenterRepository: () => ({}),
  activateNativeAlertSynchronization: () => () => undefined,
}));
jest.mock('app/platform/native/product', () => {
  const source = () => ({});
  return {
    createCurrentSnapshotViewModel: source,
    createNativeDayGraphDataSource: source,
    createNativeDayGraphTimelineLoader: source,
    createNativeDailyInsulinSummaryLoader: source,
    createNativeDailyOverviewDataSource: source,
    createNativePreviousDaySummaryDataSource: source,
    createNativeLoopChangesDataSource: source,
    createNativePreMealAssistanceDataSource: source,
    createNativePreMealIntentStore: () => ({load: async () => undefined}),
    decodeNativeProductNavigationIntent: () => undefined,
    createNativeTherapyContextDataSource: () => ({
      loadTherapyContext: mockLoadTherapyContext,
    }),
    createNativeTrendsDataSource: source,
    useLatestNightscoutSnapshotState: () => ({
      snapshot: null,
      isLoading: false,
      error: null,
    }),
  };
});
jest.mock('app/product/time', () => ({
  useRefreshingNow: () => 100 * 86_400_000,
}));
jest.mock('app/platform/native/personalization', () => ({
  useNativeProductPersonalization: () => ({status: 'ready', preferences: {}}),
}));
jest.mock('app/platform/native/settings', () => ({
  createNativeSettingsDataSource: () => ({}),
  createNativeNightscoutSettingsConnection: () => ({}),
}));
jest.mock('app/product/settings', () => ({SettingsDetailView: () => null}));
jest.mock('app/platform/native/ai', () => ({
  useLegacyAiAnalystModuleRuntime: () => ({}),
}));
jest.mock('app/hooks/useGlucoseRuleNotifications', () => ({
  useGlucoseRuleNotifications: () => undefined,
}));
jest.mock('app/hooks/usePreMealNotifications', () => ({
  usePreMealNotifications: () => undefined,
}));
jest.mock('app/hooks/useProactiveCareUpdateCenter', () => ({
  useProactiveCareUpdateCenter: () => undefined,
}));
jest.mock('app/services/rebaseService', () => ({}));

it('does no historical Trends fetch when the native host or Journal starts', async () => {
  const props = {
    navigation: {} as React.ComponentProps<
      typeof ProductExperienceScreen
    >['navigation'],
    route: {},
  };
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProductExperienceScreen {...props} />);
  });
  expect(mockLoadTherapyContext).not.toHaveBeenCalled();
  mockJournal = {
    status: 'ready',
    workspace: {
      scope: {
        workspaceId: 'synthetic-workspace',
        nightscoutSourceId: 'synthetic-source',
      },
      outbox: {
        subscribe: () => () => undefined,
        getSnapshot: () => mockEmptyOutbox,
      },
    },
  };
  await act(async () => tree!.update(<ProductExperienceScreen {...props} />));
  expect(mockLoadTherapyContext).not.toHaveBeenCalled();
  const previousSource =
    mockProductProps.trendsRuntime?.therapyContext?.dataSource;
  expect(previousSource).toBeDefined();
  mockProfile = {...mockProfile!, apiSecretSha1: 'corrected-credential'};
  await act(async () => tree!.update(<ProductExperienceScreen {...props} />));
  expect(mockProductProps.trendsRuntime?.therapyContext?.dataSource).not.toBe(
    previousSource,
  );
  expect(mockLoadTherapyContext).not.toHaveBeenCalled();
  mockProfile = null;
  await act(async () => tree!.update(<ProductExperienceScreen {...props} />));
  expect(mockProductProps.trendsRuntime?.therapyContext).toBeUndefined();
  act(() => tree!.unmount());
});
