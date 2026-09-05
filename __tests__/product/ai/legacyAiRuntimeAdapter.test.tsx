import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Text} from 'react-native';
import type {ProductUserId, WorkspaceId} from 'app/modules/journal';
import {useActiveAiWorkspaceScope} from 'app/services/aiMemory/useActiveAiWorkspaceScope';
import {
  type AiAnalystModuleRuntime,
} from 'app/product/ai';
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

const mockedEngine = jest.requireMock(
  'app/containers/MainTabsNavigator/Containers/AiAnalyst/hooks/useAiAnalystEngine',
).useAiAnalystEngine as jest.MockedFunction<() => LegacyAiAnalystEnginePort>;
const mockedScope = useActiveAiWorkspaceScope as jest.MockedFunction<
  typeof useActiveAiWorkspaceScope
>;

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

  it('sends general-chat focus as the exact visible user context', async () => {
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
    expect(captured?.snapshot.visibleContext).toBe(
      'General chat · Focused Loop setting change: change-42.',
    );
    expect(current.startOpenChatWithContext).toHaveBeenCalledWith(
      captured?.snapshot.visibleContext,
    );
    act(() => tree!.unmount());
  });

  it('keeps focused Loop advice on its guarded workflow and prefills visible context', async () => {
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
    expect(current.startLoopSettingsAdvisor).toHaveBeenCalledTimes(1);
    expect(current.startOpenChatWithContext).not.toHaveBeenCalled();
    expect(current.setInput).toHaveBeenCalledWith(
      'Loop advice · Focused Loop setting change: change-42.',
    );
    act(() => tree!.unmount());
  });

  it('launches Meal Analysis as its own typed mission', async () => {
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
    expect(current.startMealAnalysis).toHaveBeenCalledWith(
      'Meal analysis · Discuss repeated glucose observations around meals.',
    );
    expect(current.startOpenChatWithContext).not.toHaveBeenCalled();
    expect(captured?.snapshot.activeSpecialist).toBe('meal-analysis');
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
