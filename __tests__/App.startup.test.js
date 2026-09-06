import React from 'react';
import renderer, {act} from 'react-test-renderer';
import * as screens from 'app/constants/SCREEN_NAMES';

const mockEvaluatedScreens = [];
const mockRegisteredRoutes = new Map();
const mockScreenModule = name => {
  mockEvaluatedScreens.push(name);
  const DeferredScreen = function DeferredScreen() {
    return null;
  };
  return {__esModule: true, default: DeferredScreen};
};

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({children}) => children,
    Screen: props => {
      mockRegisteredRoutes.set(props.name, props);
      return null;
    },
  }),
}));
jest.mock('app/utils/e2e', () => ({isE2E: true}));
jest.mock('app/containers/Login', () => 'Login');
jest.mock('app/containers/initScreen', () => 'AppInitScreen');
jest.mock('app/containers/ProductExperienceScreen', () => 'ProductExperience');
jest.mock('app/components/NotificationModal', () => 'NotificationModal');
jest.mock('app/components/ErrorBoundary', () => ({children}) => children);
jest.mock('app/containers/MainTabsNavigator/MainTabsNavigator', () =>
  mockScreenModule('legacy-tabs'),
);
jest.mock('app/components/CameraScreen/CameraScreen', () =>
  mockScreenModule('camera'),
);
jest.mock('app/containers/FullScreen/FullScreenViewScreen', () =>
  mockScreenModule('fullscreen'),
);
jest.mock('app/containers/forms/AddNotificationScreen/AddNotificationScreen', () =>
  mockScreenModule('add-notification'),
);
jest.mock('app/containers/forms/EditNotificationScreen/EditNotificationScreen', () =>
  mockScreenModule('edit-notification'),
);
jest.mock('app/containers/forms/Food/AddFoodItem', () =>
  mockScreenModule('add-food'),
);
jest.mock('app/containers/forms/Food/EditFoodItemScreen', () =>
  mockScreenModule('edit-food'),
);
jest.mock('app/containers/forms/Sport/AddSportItem', () =>
  mockScreenModule('add-sport'),
);
jest.mock('app/containers/forms/Sport/EditSportItem', () =>
  mockScreenModule('edit-sport'),
);
jest.mock('app/containers/MainTabsNavigator/Containers/Home/DailyReviewScreen', () =>
  mockScreenModule('daily-review'),
);
jest.mock('app/containers/MainTabsNavigator/Containers/Home/RanksInfoScreen', () =>
  mockScreenModule('ranks'),
);
jest.mock('app/containers/MainTabsNavigator/Containers/Home/LoopAdjustmentAssistScreen', () =>
  mockScreenModule('loop-assist'),
);
jest.mock('app/containers/MainTabsNavigator/Containers/Trends/HypoInvestigationScreen', () =>
  mockScreenModule('hypo-investigation'),
);
jest.mock('app/contexts/SportItemsContext', () => ({
  SportItemsProvider: ({children}) => children,
}));
jest.mock('app/services/rebaseService', () => ({
  registerDeviceToken: jest.fn(),
  unregisterDeviceToken: jest.fn(),
  syncTokenIfNeeded: jest.fn(),
}));
jest.mock('app/hooks/useLatestNightscoutSnapshot', () => ({
  useLatestNightscoutSnapshot: () => ({
    snapshot: null,
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));
jest.mock('app/hooks/useHypoNowMvp', () => ({useHypoNowMvp: jest.fn()}));
jest.mock('app/hooks/useDailyBriefNotifications', () => ({
  useDailyBriefNotifications: jest.fn(),
}));
jest.mock('app/hooks/useAndroidGlucoseLiveSurface', () => ({
  useAndroidGlucoseLiveSurface: jest.fn(),
}));

it('evaluates secondary screen modules only when navigation requests them', async () => {
  const App = require('../src/App').default;
  let tree;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  expect(mockEvaluatedScreens).toEqual([]);

  const camera = mockRegisteredRoutes.get(screens.CAMERA_SCREEN);
  const firstCamera = camera.getComponent();
  expect(firstCamera).toEqual(expect.any(Function));
  expect(camera.getComponent()).toBe(firstCamera);
  expect(mockEvaluatedScreens).toEqual(['camera']);

  const legacy = mockRegisteredRoutes.get(screens.LEGACY_TAB_NAVIGATOR);
  const LegacyTabs = legacy.component ?? legacy.getComponent();
  let legacyTree;
  act(() => {
    legacyTree = renderer.create(<LegacyTabs />);
  });
  expect(mockEvaluatedScreens).toEqual(['camera', 'legacy-tabs']);
  expect(mockRegisteredRoutes.get(screens.FULL_SCREEN_VIEW_SCREEN).getComponent)
    .toEqual(expect.any(Function));
  for (const route of [
    screens.ADD_NOTIFICATION_SCREEN,
    screens.EDIT_NOTIFICATION_SCREEN,
    screens.ADD_FOOD_ITEM_SCREEN,
    screens.EDIT_FOOD_ITEM_SCREEN,
    screens.ADD_SPORT_ITEM_SCREEN,
    screens.EDIT_SPORT_ITEM_SCREEN,
    screens.FULL_SCREEN_VIEW_SCREEN,
    screens.DAILY_REVIEW_SCREEN,
    screens.RANKS_INFO_SCREEN,
    screens.LOOP_ADJUSTMENT_ASSIST_SCREEN,
    screens.HYPO_INVESTIGATION_SCREEN,
  ]) {
    const before = mockEvaluatedScreens.length;
    const load = mockRegisteredRoutes.get(route).getComponent;
    const component = load();
    expect(component).toEqual(expect.any(Function));
    expect(load()).toBe(component);
    expect(mockEvaluatedScreens).toHaveLength(before + 1);
  }
  act(() => {
    legacyTree.unmount();
    tree.unmount();
  });
});
