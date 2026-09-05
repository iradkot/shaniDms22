import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import type {AiAnalystEngine} from 'app/containers/MainTabsNavigator/Containers/AiAnalyst/types';
import {useAiAnalystEngine} from 'app/containers/MainTabsNavigator/Containers/AiAnalyst/hooks/useAiAnalystEngine';
import {runAiAnalystTool} from 'app/services/aiAnalyst/aiAnalystLocalTools';
import {
  loadAiAnalystHistory,
  upsertAiAnalystConversationSnapshot,
} from 'app/services/aiAnalyst/aiAnalystHistory';
import {runLlmToolLoop} from 'app/containers/MainTabsNavigator/Containers/AiAnalyst/llm';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: jest.fn()}),
}));
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
}));
jest.mock('styled-components/native', () => ({
  useTheme: () => ({
    textColor: '#111111',
    accentColor: '#1769AA',
    borderColor: '#dddddd',
  }),
}));
jest.mock('app/contexts/AiSettingsContext', () => ({
  useAiSettings: () => ({
    settings: {
      enabled: true,
      apiKey: 'test-key',
      openAiModel: 'test-model',
      personality: 'neutral',
    },
  }),
}));
jest.mock('app/contexts/GlucoseSettingsContext', () => ({
  useGlucoseSettings: () => ({
    settings: {severeHypo: 54, hypo: 70, hyper: 180},
  }),
}));
jest.mock('app/contexts/AppLanguageContext', () => ({
  useAppLanguage: () => ({language: 'en'}),
}));
jest.mock('app/services/llm/llmClient', () => ({
  createLlmProvider: () => ({sendChat: jest.fn()}),
  withAppLanguagePolicy: (instruction: string) => instruction,
}));
jest.mock('app/services/aiAnalyst/aiAnalystLocalTools', () => ({
  runAiAnalystTool: jest.fn(),
}));
jest.mock('app/services/aiAnalyst/aiAnalystHistory', () => ({
  clearAiAnalystHistory: jest.fn(async () => undefined),
  deleteAiAnalystConversation: jest.fn(async () => undefined),
  loadAiAnalystHistory: jest.fn(async () => []),
  upsertAiAnalystConversationSnapshot: jest.fn(async () => undefined),
}));
jest.mock('app/services/aiMemory/useActiveAiWorkspaceScope', () => ({
  useActiveAiWorkspaceScope: () => ({
    productUserId: 'product-user-1',
    workspaceId: 'workspace-1',
  }),
}));
jest.mock('app/services/aiAnalyst/useAiWorkspaceIsolationBoundary', () => ({
  useAiWorkspaceIsolationBoundary: () => undefined,
}));
jest.mock('app/hooks/useLatestNightscoutSnapshot', () => ({
  useLatestNightscoutSnapshot: () => ({snapshot: undefined}),
}));
jest.mock(
  'app/containers/MainTabsNavigator/Containers/AiAnalyst/helpers/markdownConfig',
  () => ({
    createMarkdownItInstance: () => ({}),
    createSelectableMarkdownRules: () => ({}),
    createMarkdownStyle: () => ({}),
  }),
);
jest.mock('app/containers/MainTabsNavigator/Containers/AiAnalyst/llm', () => ({
  runLlmToolLoop: jest.fn(),
  withTimeout: (value: Promise<unknown>) => value,
}));

const tool = runAiAnalystTool as jest.MockedFunction<
  typeof runAiAnalystTool
>;
const runLoop = runLlmToolLoop as jest.MockedFunction<typeof runLlmToolLoop>;
const loadHistory = loadAiAnalystHistory as jest.MockedFunction<
  typeof loadAiAnalystHistory
>;
const upsert = upsertAiAnalystConversationSnapshot as jest.MockedFunction<
  typeof upsertAiAnalystConversationSnapshot
>;

let captured: AiAnalystEngine | undefined;
const Harness = () => {
  captured = useAiAnalystEngine();
  return <Text>engine</Text>;
};

describe('legacy AI engine meal mission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tool.mockResolvedValue({ok: true, result: {available: true}});
    runLoop.mockResolvedValue({
      finalText: 'Meal observations are ready to review.',
      llmMessages: [],
    });
  });

  it('persists Meal Analysis as its own typed mission', async () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Harness />);
    });

    await act(async () => {
      await captured?.startMealAnalysis(
        'Meal analysis · Focused meal: meal-1.',
      );
    });

    expect(captured?.errorText).toBeNull();
    expect(upsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({mission: 'mealAnalysis'}),
    );
    expect(captured?.state).toEqual({
      mode: 'mission',
      mission: 'mealAnalysis',
    });
    act(() => tree!.unmount());
  });

  it('resumes a saved Meal Analysis conversation with the same mission', async () => {
    loadHistory.mockResolvedValue([
      {
        id: 'meal-conversation',
        title: 'Dinner',
        mission: 'mealAnalysis',
        createdAt: 1,
        updatedAt: 2,
        messages: [
          {role: 'assistant', content: 'Dinner observations', ts: 2},
        ],
      },
    ]);
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Harness />);
    });

    await act(async () => {
      await captured?.resumeConversation('meal-conversation');
    });

    expect(captured?.state).toEqual({
      mode: 'mission',
      mission: 'mealAnalysis',
    });
    expect(captured?.uiMessages).toEqual([
      {role: 'assistant', content: 'Dinner observations'},
    ]);
    act(() => tree!.unmount());
  });
});
