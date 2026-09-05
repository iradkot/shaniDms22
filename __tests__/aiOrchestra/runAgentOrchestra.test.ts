import type {AiWorkspaceScope} from '../../src/services/aiMemory/aiWorkspaceScope';
import {runAiAnalystAgentOrchestra} from '../../src/containers/MainTabsNavigator/Containers/AiAnalyst/llm/runAgentOrchestra';

describe('runAiAnalystAgentOrchestra', () => {
  it('runs review and revision loops before the safety pass', async () => {
    const systemPrompts: string[] = [];
    let reviewCalls = 0;
    let revisionCalls = 0;

    const provider = {
      sendChat: jest.fn(async ({messages}: any) => {
        const systemPrompt = String(messages?.[0]?.content ?? '');
        systemPrompts.push(systemPrompt);

        if (
          systemPrompt.includes('strict diabetes-tech recommendation reviewer')
        ) {
          reviewCalls += 1;
          return {
            content:
              reviewCalls === 1
                ? 'Fix: include overnight low risk and the 75-80 target limitation.'
                : 'APPROVED',
          };
        }

        if (systemPrompt.includes('Revise the patient-facing answer')) {
          revisionCalls += 1;
          return {content: 'Revised draft with safer overnight reasoning.'};
        }

        if (systemPrompt.includes('Agent objective: Check for medical-risk')) {
          return {content: 'Final safe answer'};
        }

        if (systemPrompt.includes('You are the final writer')) {
          return {content: 'Initial shallow draft'};
        }

        return {
          content: JSON.stringify({
            type: 'final',
            content: 'specialist finding',
          }),
        };
      }),
    };

    const result = await runAiAnalystAgentOrchestra({
      workspaceScope: {
        productUserId: 'test-user',
        workspaceId: 'test-workspace',
      } as AiWorkspaceScope,
      provider,
      model: 'gpt-test',
      mission: 'openChat',
      baseSystemPrompt: 'Base prompt',
      initialMessages: [{role: 'user', content: 'Why not 75-80 overnight?'}],
      maxToolCalls: 4,
      maxOutputTokens: 1200,
      temperature: 0.1,
      callbacks: {isCancelled: () => false},
    });

    expect(result.finalText).toBe('Final safe answer');
    expect(reviewCalls).toBe(2);
    expect(revisionCalls).toBe(1);
    expect(
      systemPrompts.some(prompt =>
        prompt.includes('ADA Standards of Care in Diabetes 2026'),
      ),
    ).toBe(true);
  });
});
