import React from 'react';
import renderer, {act} from 'react-test-renderer';
import AiAnalyst from 'app/containers/MainTabsNavigator/Containers/AiAnalyst/AiAnalyst';
import type {ScreenState} from 'app/containers/MainTabsNavigator/Containers/AiAnalyst/types';
import {
  createMarkdownItInstance,
  createMarkdownStyle,
  createSelectableMarkdownRules,
} from 'app/containers/MainTabsNavigator/Containers/AiAnalyst/helpers/markdownConfig';
import {getThemeById} from 'app/style/theme';
import {withTheme} from './mocks/withTheme';

const mockEngine = {
  state: {mode: 'historyDetail', id: 'saved'} as ScreenState,
  isEnabled: true,
  hasKey: true,
  isBusy: false,
  historyItems: [],
  setState: jest.fn(),
};
jest.mock('app/containers/MainTabsNavigator/Containers/AiAnalyst/hooks/useAiAnalystEngine', () => ({
  useAiAnalystEngine: () => mockEngine,
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: jest.fn(), setParams: jest.fn()}),
  useRoute: () => ({params: {}}),
  useFocusEffect: () => undefined,
}));
jest.mock('app/containers/MainTabsNavigator/Containers/AiAnalyst/helpers/markdownConfig', () => ({
  createMarkdownItInstance: jest.fn(() => ({})),
  createSelectableMarkdownRules: jest.fn(() => ({})),
  createMarkdownStyle: jest.fn(theme => ({textColor: theme.textColor})),
}));
jest.mock('app/containers/MainTabsNavigator/Containers/AiAnalyst/screens/DashboardScreen', () => 'DashboardScreen');
jest.mock('app/containers/MainTabsNavigator/Containers/AiAnalyst/screens/HistoryScreen', () => 'HistoryScreen');
jest.mock('app/containers/MainTabsNavigator/Containers/AiAnalyst/screens/HistoryDetailScreen', () => 'HistoryDetailScreen');
jest.mock('app/containers/MainTabsNavigator/Containers/AiAnalyst/screens/MissionChatScreen', () => 'MissionChatScreen');
jest.mock('app/containers/MainTabsNavigator/Containers/AiAnalyst/screens/EvidenceScreen', () => 'EvidenceScreen');

it('keeps legacy chat Markdown reusable and follows the app theme', () => {
  const initialTheme = getThemeById('calmBlue');
  const nextTheme = getThemeById('nightScout');
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(withTheme(<AiAnalyst />, initialTheme));
  });
  const first = tree!.root.findByType('HistoryDetailScreen').props.markdown;
  expect(first.instance).toBeDefined();
  expect(first.rules).toBeDefined();
  expect(first.style.textColor).toBe(initialTheme.textColor);
  act(() => tree!.update(withTheme(<AiAnalyst />, initialTheme)));
  expect(tree!.root.findByType('HistoryDetailScreen').props.markdown).toBe(first);
  act(() => tree!.update(withTheme(<AiAnalyst />, nextTheme)));
  const second = tree!.root.findByType('HistoryDetailScreen').props.markdown;
  expect(second.instance).toBe(first.instance);
  expect(second.rules).toBe(first.rules);
  expect(second.style.textColor).toBe(nextTheme.textColor);
  mockEngine.state = {mode: 'mission', mission: 'openChat'};
  act(() => tree!.update(withTheme(<AiAnalyst />, nextTheme)));
  expect(tree!.root.findByType('MissionChatScreen').props.markdown).toBe(second);
  expect(createMarkdownItInstance).toHaveBeenCalledTimes(1);
  expect(createSelectableMarkdownRules).toHaveBeenCalledTimes(1);
  expect(createMarkdownStyle).toHaveBeenCalledTimes(2);
  act(() => tree!.unmount());
});
