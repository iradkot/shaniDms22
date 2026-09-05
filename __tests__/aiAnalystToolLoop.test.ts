import type {AiWorkspaceScope} from 'app/services/aiMemory/aiWorkspaceScope';
import {
  type AiAnalystToolName,
  runAiAnalystTool,
} from 'app/services/aiAnalyst/aiAnalystLocalTools';
import {
  type LlmProvider,
  runLlmToolLoop,
} from 'app/containers/MainTabsNavigator/Containers/AiAnalyst/llm';

jest.mock('app/services/aiAnalyst/aiAnalystLocalTools', () => ({
  runAiAnalystTool: jest.fn(),
}));

type ToolResult =
  | {readonly ok: true; readonly result: unknown}
  | {readonly ok: false; readonly error: string};

const runToolMock = runAiAnalystTool as jest.MockedFunction<
  (
    scope: AiWorkspaceScope,
    name: AiAnalystToolName,
    args: unknown,
  ) => Promise<ToolResult>
>;

const workspaceScope = {
  productUserId: 'product-user-1',
  workspaceId: 'workspace-1',
} as AiWorkspaceScope;

const envelope = (value: unknown): string => JSON.stringify(value);

const createProvider = (...responses: readonly string[]): LlmProvider => {
  let nextResponse = 0;
  return {
    sendChat: jest.fn(async () => ({
      content:
        responses[nextResponse++] ??
        envelope({type: 'final', content: 'No response was configured.'}),
    })),
  };
};

const runLoop = (provider: LlmProvider, isLoopSettingsMode = true, maxToolCalls = 5) =>
  runLlmToolLoop({
    workspaceScope,
    provider,
    model: 'test-model',
    systemPrompt: 'Test system prompt',
    initialMessages: [{role: 'user', content: 'Review my Loop settings.'}],
    maxToolCalls,
    maxOutputTokens: 800,
    callbacks: {isCancelled: () => false},
    isLoopSettingsMode,
  });

describe('runLlmToolLoop Loop Settings evidence gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runToolMock.mockResolvedValue({ok: true, result: {available: true}});
  });

  it('continues collecting evidence when the model tries to answer before the minimum is met', async () => {
    const provider = createProvider(
      envelope({type: 'final', content: 'Increase your setting now.'}),
      envelope({type: 'tool_call', name: 'getCurrentProfileSettings', args: {}}),
      envelope({type: 'tool_call', name: 'getGlucosePatterns', args: {daysBack: 14}}),
      envelope({type: 'tool_call', name: 'analyzeTimeInRange', args: {daysBack: 14}}),
      envelope({type: 'final', content: 'Evidence-backed advisory recommendation.'}),
    );

    const result = await runLoop(provider);

    expect(result.finalText).toBe('Evidence-backed advisory recommendation.');
  });

  it('returns an advisory answer after three successful relevant tools cover settings and glucose', async () => {
    const provider = createProvider(
      envelope({type: 'tool_call', name: 'getCurrentProfileSettings', args: {}}),
      envelope({type: 'tool_call', name: 'getGlucosePatterns', args: {daysBack: 14}}),
      envelope({type: 'tool_call', name: 'getInsulinDeliveryStats', args: {daysBack: 14}}),
      envelope({type: 'final', content: 'The evidence supports a cautious advisory change.'}),
    );

    const result = await runLoop(provider);

    expect(result.finalText).toBe('The evidence supports a cautious advisory change.');
  });

  it('does not count a failed tool toward the minimum evidence', async () => {
    runToolMock.mockImplementation(async (_scope, name) =>
      name === 'getGlucosePatterns'
        ? {ok: false, error: 'Nightscout unavailable'}
        : {ok: true, result: {available: true}},
    );
    const provider = createProvider(
      envelope({type: 'tool_call', name: 'getCurrentProfileSettings', args: {}}),
      envelope({type: 'tool_call', name: 'getGlucosePatterns', args: {daysBack: 14}}),
      envelope({type: 'tool_call', name: 'analyzeTimeInRange', args: {daysBack: 14}}),
      envelope({type: 'final', content: 'This answer is still too early.'}),
      envelope({type: 'tool_call', name: 'getInsulinDeliveryStats', args: {daysBack: 14}}),
      envelope({type: 'final', content: 'Answer after three successful evidence results.'}),
    );

    const result = await runLoop(provider);

    expect(result.finalText).toBe('Answer after three successful evidence results.');
  });

  it('returns a non-recommendation safety response when the tool budget cannot satisfy the gate', async () => {
    const provider = createProvider(
      envelope({type: 'tool_call', name: 'getCurrentProfileSettings', args: {}}),
      envelope({type: 'tool_call', name: 'getGlucosePatterns', args: {daysBack: 14}}),
      envelope({type: 'tool_call', name: 'getInsulinDeliveryStats', args: {daysBack: 14}}),
    );

    const result = await runLoop(provider, true, 2);

    expect(result.finalText).toBe(
      'I cannot safely provide a dosing or Loop-setting recommendation because I could not collect enough successful profile and glucose evidence. No settings were changed.',
    );
  });

  it('does not apply the evidence gate outside Loop Settings mode', async () => {
    const provider = createProvider(
      envelope({type: 'final', content: 'General chat answer.'}),
    );

    const result = await runLoop(provider, false);

    expect(result.finalText).toBe('General chat answer.');
  });

  it('never executes a mutation-like tool requested in Loop Settings mode', async () => {
    const provider = createProvider(
      envelope({type: 'tool_call', name: 'updateLoopSettings', args: {isf: 42}}),
      envelope({type: 'tool_call', name: 'updateLoopSettings', args: {isf: 42}}),
    );

    const result = await runLoop(provider, true, 1);

    expect(runToolMock).not.toHaveBeenCalled();
    expect(result.finalText).toContain('No settings were changed.');
  });
});
