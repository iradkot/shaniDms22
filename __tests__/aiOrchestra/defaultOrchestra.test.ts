import {
  buildAiOrchestraPlan,
  buildAiOrchestraPromptBlock,
  getAiOrchestraAgentsForMission,
} from '../../src/services/aiOrchestra';

describe('default AI orchestra', () => {
  it('includes the settings specialist only for settings-capable missions', () => {
    const dailyBriefAgentIds = getAiOrchestraAgentsForMission('dailyBrief').map(
      agent => agent.id,
    );
    const loopSettingsAgentIds = getAiOrchestraAgentsForMission(
      'loopSettings',
    ).map(agent => agent.id);

    expect(dailyBriefAgentIds).not.toContain('settings_agent');
    expect(loopSettingsAgentIds).toContain('settings_agent');
  });

  it('builds a serial safety/write phase after specialist review', () => {
    const plan = buildAiOrchestraPlan('openChat');
    const finalPhase = plan.phases[plan.phases.length - 1];

    expect(plan.finalWriterAgentId).toBe('final_writer');
    expect(finalPhase.execution).toBe('serial');
    expect(finalPhase.agentIds).toEqual(['safety_reviewer', 'final_writer']);
  });

  it('allows the memory curator to save explicitly approved memories', () => {
    const memoryAgent = getAiOrchestraAgentsForMission('openChat').find(
      agent => agent.id === 'memory_curator',
    );

    expect(memoryAgent?.allowedTools).toContain('addMemoryEntry');
    expect(memoryAgent?.allowedTools).toContain('proposeMemoryEntry');
    expect(memoryAgent?.allowedTools).toContain('approveMemoryEntry');
  });

  it('renders a compact prompt block without exposing implementation detail as a user instruction', () => {
    const block = buildAiOrchestraPromptBlock('userBehavior');

    expect(block).toContain('mission: userBehavior');
    expect(block).toContain('behavior_agent');
    expect(block).toContain('Do not expose internal agent names');
  });
});
