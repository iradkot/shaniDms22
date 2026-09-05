import type {AiWorkspaceScope} from 'app/services/aiMemory/aiWorkspaceScope';
import {runAiAnalystTool} from 'app/services/aiAnalyst/aiAnalystLocalTools';
import {runAiAnalystAgentOrchestra} from 'app/containers/MainTabsNavigator/Containers/AiAnalyst/llm/runAgentOrchestra';
import type {LlmProvider} from 'app/containers/MainTabsNavigator/Containers/AiAnalyst/llm/types';
import {LOOP_SETTINGS_EVIDENCE_SAFETY_RESPONSE} from 'app/containers/MainTabsNavigator/Containers/AiAnalyst/llm/guardrails/loopSettingsEvidenceGate';

jest.mock('app/services/aiAnalyst/aiAnalystLocalTools', () => ({
  runAiAnalystTool: jest.fn(),
}));

jest.mock(
  'app/containers/MainTabsNavigator/Containers/AiAnalyst/llm/guardrails',
  () => ({
    maybeRewriteLoopSettingsResponse: jest.fn(async (text: string) => text),
    maybeReflectAsEndoExpert: jest.fn(async (text: string) => text),
  }),
);

const workspaceScope = {
  productUserId: 'owner',
  workspaceId: 'workspace',
} as AiWorkspaceScope;

const run = (provider: LlmProvider, isCancelled = () => false) =>
  runAiAnalystAgentOrchestra({
    workspaceScope,
    provider,
    model: 'test',
    mission: 'loopSettings',
    baseSystemPrompt: 'Review settings',
    initialMessages: [{role: 'user', content: 'Review my settings'}],
    maxToolCalls: 4,
    maxOutputTokens: 1000,
    callbacks: {isCancelled},
  });

describe('orchestra scoped evidence and cancellation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(runAiAnalystTool)
      .mockResolvedValue({ok: true, result: {available: true}});
  });

  it('does not start requests after cancellation', async () => {
    const provider = {sendChat: jest.fn(async () => ({content: 'unused'}))};
    expect((await run(provider, () => true)).finalText).toBe('');
    expect(provider.sendChat).not.toHaveBeenCalled();
  });

  it('blocks the final writer when specialists did not gather profile and glucose evidence', async () => {
    const provider = {
      sendChat: jest.fn(
        async (_params: Parameters<LlmProvider['sendChat']>[0]) => ({
          content:
            '{"type":"final","content":"Unsupported setting recommendation"}',
        }),
      ),
    };
    expect((await run(provider)).finalText).toBe(
      LOOP_SETTINGS_EVIDENCE_SAFETY_RESPONSE,
    );
    expect(
      provider.sendChat.mock.calls.every(
        ([params]) =>
          !String(params.messages[0]?.content).includes(
            'You are the final writer',
          ),
      ),
    ).toBe(true);
  });

  it('combines scoped evidence from specialists and denies memory writes in Loop Settings', async () => {
    const provider: LlmProvider = {
      sendChat: jest.fn(async ({messages}) => {
        const prompt = String(messages[0]?.content);
        if (messages.length === 2) {
          const name = prompt.includes('You are the Nightscout data agent.')
            ? 'getCurrentProfileSettings'
            : prompt.includes('You are the Pattern agent.')
            ? 'getGlucosePatterns'
            : prompt.includes('You are the Loop settings agent.')
            ? 'getSettingsChangeHistory'
            : prompt.includes('You are the Memory curator.')
            ? 'approveMemoryEntry'
            : null;
          if (name)
            return {
              content: JSON.stringify({
                type: 'tool_call',
                name,
                args: {id: 'private-memory'},
              }),
            };
        }
        if (prompt.includes('strict diabetes-tech recommendation reviewer')) {
          return {content: 'APPROVED'};
        }
        return {content: '{"type":"final","content":"Evidence based answer"}'};
      }),
    };
    const result = await run(provider);
    expect(result.finalText).toBe('Evidence based answer');
    expect(jest.mocked(runAiAnalystTool).mock.calls).toHaveLength(3);
    for (const [scope, name] of jest.mocked(runAiAnalystTool).mock.calls) {
      expect(scope).toBe(workspaceScope);
      expect(name).not.toBe('approveMemoryEntry');
    }
  });

  it('discards results if the workspace changes during specialist requests', async () => {
    let cancelled = false;
    const provider = {
      sendChat: jest.fn(async () => {
        cancelled = true;
        return {content: '{"type":"final","content":"Previous workspace"}'};
      }),
    };
    expect((await run(provider, () => cancelled)).finalText).toBe('');
    expect(runAiAnalystTool).not.toHaveBeenCalled();
  });
});
