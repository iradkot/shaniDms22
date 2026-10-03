import {configureExperimentalBuildForTests} from '../../mocks/experimentalBuild';
configureExperimentalBuildForTests();

import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Text} from 'react-native';
import type {ProductUserId, WorkspaceId} from 'app/modules/journal';
import {useActiveAiWorkspaceScope} from 'app/services/aiMemory/useActiveAiWorkspaceScope';
import {
  type AiAnalystModuleRuntime,
} from 'app/product/ai';
import type {RecommendationRuntimePorts} from 'app/product/ai/useRecommendationRuntime';
import {useNativeRecommendationPorts} from 'app/platform/native/ai/useNativeRecommendationPorts';
import {
  type LegacyAiAnalystEnginePort,
  useLegacyAiAnalystModuleRuntime,
} from 'app/platform/native/ai';

jest.mock(
  'app/containers/MainTabsNavigator/Containers/AiAnalyst/hooks/useAiAnalystEngine',
  () => ({useAiAnalystEngine: jest.fn()}),
);
jest.mock('app/services/aiMemory/useActiveAiWorkspaceScope', () => ({
  useActiveAiWorkspaceScope: jest.fn(),
}));
jest.mock('app/platform/native/ai/useNativeRecommendationPorts', () => ({
  useNativeRecommendationPorts: jest.fn(),
}));

const mockedEngine = jest.requireMock(
  'app/containers/MainTabsNavigator/Containers/AiAnalyst/hooks/useAiAnalystEngine',
).useAiAnalystEngine as jest.MockedFunction<() => LegacyAiAnalystEnginePort>;
const mockedScope = useActiveAiWorkspaceScope as jest.MockedFunction<
  typeof useActiveAiWorkspaceScope
>;
const mockedPorts = useNativeRecommendationPorts as jest.MockedFunction<
  typeof useNativeRecommendationPorts
>;
let chat: jest.MockedFunction<RecommendationRuntimePorts['chat']>;
let loadEvidence: jest.MockedFunction<RecommendationRuntimePorts['loadEvidence']>;

const providerPayloads = () => chat.mock.calls.map(([messages]) => {
  const userMessage = messages.find(message => message.role === 'user');
  if (!userMessage) {
    throw new Error('Missing recommendation provider payload');
  }
  return JSON.parse(userMessage.content) as {
    request: string;
    requestedDays: number;
    evidence: string;
  };
});

const expectNoLegacyGeneration = (current: LegacyAiAnalystEnginePort) => {
  [
    current.startOpenChat,
    current.startOpenChatWithContext,
    current.startMealAnalysis,
    current.startHypoDetective,
    current.startUserBehavior,
    current.startLoopSettingsAdvisor,
  ].forEach(start => expect(start).not.toHaveBeenCalled());
};

const engine = (
  overrides: Partial<LegacyAiAnalystEnginePort> = {},
): LegacyAiAnalystEnginePort => ({
  state: {mode: 'dashboard'},
  setState: jest.fn(),
  hasKey: true,
  isEnabled: true,
  uiMessages: [],
  input: '',
  setInput: jest.fn(),
  isBusy: false,
  progressText: '',
  errorText: null,
  historyItems: [],
  historyBusy: false,
  openSettings: jest.fn(),
  openHistory: jest.fn(async () => undefined),
  clearHistory: jest.fn(async () => undefined),
  deleteConversation: jest.fn(async () => undefined),
  resumeConversation: jest.fn(async () => undefined),
  startOpenChat: jest.fn(async () => undefined),
  startOpenChatWithContext: jest.fn(async () => undefined),
  startMealAnalysis: jest.fn(async () => undefined),
  startHypoDetective: jest.fn(async () => undefined),
  startUserBehavior: jest.fn(async () => undefined),
  startLoopSettingsAdvisor: jest.fn(async () => undefined),
  sendFollowUp: jest.fn(async () => undefined),
  onAttachMealImage: jest.fn(async () => undefined),
  cancelActiveRun: jest.fn(),
  goBackToDashboard: jest.fn(),
  ...overrides,
});

let captured: AiAnalystModuleRuntime | undefined;
const Harness = ({locale}: {readonly locale: 'en' | 'he'}) => {
  captured = useLegacyAiAnalystModuleRuntime(locale);
  return <Text>runtime</Text>;
};

describe('legacy AI runtime adapter', () => {
  beforeEach(() => {
    captured = undefined;
    const values = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
      },
    };
    chat = jest.fn<
      ReturnType<RecommendationRuntimePorts['chat']>,
      Parameters<RecommendationRuntimePorts['chat']>
    >(async () => 'Review the recorded pattern with your care team.');
    loadEvidence = jest.fn<
      ReturnType<RecommendationRuntimePorts['loadEvidence']>,
      Parameters<RecommendationRuntimePorts['loadEvidence']>
    >(async () => 'No current glucose reading is available.');
    mockedPorts.mockImplementation((workspace, locale) => ({
      scopeId: workspace ? `${workspace.productUserId}/${workspace.workspaceId}` : null,
      locale,
      storage,
      chat,
      loadEvidence,
    }));
    mockedScope.mockReturnValue({
      productUserId: 'user-a' as ProductUserId,
      workspaceId: 'workspace-a' as WorkspaceId,
    });
  });

  it('maps missing credentials and keeps the existing settings action', () => {
    const current = engine({hasKey: false, state: {mode: 'locked'}});
    mockedEngine.mockReturnValue(current);
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Harness locale="en" />);
    });
    expect(captured?.snapshot.availability).toBe('missing-credentials');
    act(() => captured?.openSettings());
    expect(current.openSettings).toHaveBeenCalledTimes(1);
    act(() => tree!.unmount());
  });

  it('enforces pilot limits in the native adapter while retaining retrospective analysis', async () => {
    globalThis.__SHANI_RELEASE_CHANNEL__ = 'pilot';
    const current = engine({state: {mode: 'mission', mission: 'openChat'},
      uiMessages: [{role: 'assistant', content: 'Old advice for now.'}]});
    mockedEngine.mockReturnValue(current);
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {tree = renderer.create(<Harness locale="en" />);});
    expect(captured?.snapshot.messages).toEqual([]);
    expect(captured?.snapshot.surface).toEqual({kind: 'landing'});
    await act(async () => captured?.startRecommendation?.({request: {kind: 'now'}, locale: 'en'}));
    await act(async () => captured?.startRecommendation?.({request: {kind: 'meal'}, locale: 'en'}));
    await act(async () => captured?.start({specialist: 'general-chat', locale: 'en'}));
    expect(chat).not.toHaveBeenCalled();
    expect(loadEvidence).not.toHaveBeenCalled();
    expectNoLegacyGeneration(current);
    await act(async () => captured?.startRecommendation?.({request: {kind: 'weekly'}, locale: 'en'}));
    expect(chat).toHaveBeenCalledTimes(3);
    expect(captured?.snapshot.history[0]?.recommendation?.kind).toBe('weekly');
    expectNoLegacyGeneration(current);
    act(() => tree.unmount());
  });

  it('sends a contextual general-chat launch through the shared recommendation workflow', async () => {
    const current = engine();
    mockedEngine.mockReturnValue(current);
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Harness locale="en" />);
    });
    await act(async () => {
      await captured?.start({
        specialist: 'general-chat',
        locale: 'en',
        focus: {kind: 'loop-change', changeId: 'change-42'},
      });
    });
    expect(captured?.snapshot.visibleContext).toContain(
      'General chat · Focused Loop setting change: change-42.',
    );
    expect(loadEvidence).toHaveBeenCalledWith({
      request: {kind: 'now'},
      locale: 'en',
      focus: {kind: 'loop-change', changeId: 'change-42'},
    }, expect.objectContaining({aborted: false}));
    expect(chat).toHaveBeenCalledTimes(2);
    for (const payload of providerPayloads()) {
      expect(payload.evidence).toContain('Focused Loop setting change: change-42.');
      expect(payload.evidence).toContain('No current glucose reading is available.');
    }
    expect(captured?.snapshot.messages[1]?.content)
      .toBe('Review the recorded pattern with your care team.');
    expectNoLegacyGeneration(current);
    act(() => tree!.unmount());
  });

  it('converts focused Loop advice into a shared recommendation for discussion with the care team', async () => {
    const current = engine();
    mockedEngine.mockReturnValue(current);
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Harness locale="en" />);
    });
    await act(async () => {
      await captured?.start({
        specialist: 'loop-advice',
        locale: 'en',
        focus: {kind: 'loop-change', changeId: 'change-42'},
      });
    });
    expect(loadEvidence).toHaveBeenCalledWith({
      request: {
        kind: 'guided',
        horizon: 'weekly',
        focus: 'care-team',
        goal: 'steadier-glucose',
      },
      locale: 'en',
      focus: {kind: 'loop-change', changeId: 'change-42'},
    }, expect.objectContaining({aborted: false}));
    expect(chat).toHaveBeenCalledTimes(3);
    for (const payload of providerPayloads()) {
      expect(payload.request).toContain('a plan to discuss with my care team');
      expect(payload.requestedDays).toBe(7);
      expect(payload.evidence).toContain('Focused Loop setting change: change-42.');
    }
    expectNoLegacyGeneration(current);
    expect(current.setInput).not.toHaveBeenCalled();
    act(() => tree!.unmount());
  });

  it('converts Meal Analysis into the shared food-focused recommendation workflow', async () => {
    const current = engine();
    mockedEngine.mockReturnValue(current);
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Harness locale="en" />);
    });
    await act(async () => {
      await captured?.start({
        specialist: 'meal-analysis',
        locale: 'en',
      });
    });
    expect(loadEvidence).toHaveBeenCalledWith({
      request: {
        kind: 'guided',
        horizon: 'weekly',
        focus: 'food',
        goal: 'steadier-glucose',
      },
      locale: 'en',
    }, expect.objectContaining({aborted: false}));
    expect(chat).toHaveBeenCalledTimes(3);
    for (const payload of providerPayloads()) {
      expect(payload.request).toContain('food and meals');
      expect(payload.requestedDays).toBe(7);
    }
    expect(captured?.snapshot.history[0]?.recommendation).toMatchObject({
      kind: 'guided',
      focus: 'food',
    });
    expectNoLegacyGeneration(current);
    act(() => tree!.unmount());
  });

  it('guards assistant output again at the rebuilt product seam', () => {
    const raw = Array.from({length: 12}, (_, index) => `mgdl: ${index}`).join(
      '\n',
    );
    mockedEngine.mockReturnValue(
      engine({
        state: {mode: 'mission', mission: 'openChat'},
        uiMessages: [{role: 'assistant', content: `Summary\n${raw}`}],
      }),
    );
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Harness locale="en" />);
    });
    expect(captured?.snapshot.messages[0]?.content).toContain('Summary');
    expect(captured?.snapshot.messages[0]?.content).not.toContain('mgdl:');
    expect(captured?.snapshot.messages[0]?.content).toContain(
      'I removed a long RAW data dump',
    );
    act(() => tree!.unmount());
  });

  it('drops adapter-only context when the active Workspace changes', async () => {
    mockedEngine.mockReturnValue(engine());
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Harness locale="en" />);
    });
    await act(async () => {
      await captured?.start({
        specialist: 'general-chat',
        locale: 'en',
        focus: {kind: 'day', dayStartMs: 1_700_000_000_000},
      });
    });
    expect(captured?.snapshot.visibleContext).toBeDefined();

    mockedScope.mockReturnValue({
      productUserId: 'user-a' as ProductUserId,
      workspaceId: 'workspace-b' as WorkspaceId,
    });
    act(() => tree!.update(<Harness locale="en" />));
    expect(captured?.snapshot.visibleContext).toBeUndefined();
    expect(captured?.snapshot.activeSpecialist).toBe('general-chat');
    act(() => tree!.unmount());
  });
});
