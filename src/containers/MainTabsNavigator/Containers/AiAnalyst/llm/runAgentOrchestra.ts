import {LlmChatMessage} from 'app/services/llm/llmTypes';
import {
  AiAgentDefinition,
  AiOrchestraMission,
  buildAiOrchestraPromptBlock,
  getAiOrchestraAgentsForMission,
} from 'app/services/aiOrchestra';

import {runLlmToolLoop} from './runToolLoop';
import {ToolLoopParams, ToolLoopResult} from './types';

type AgentFinding = {
  agentId: string;
  title: string;
  outputKind: string;
  content: string;
};

export type AgentOrchestraParams = Omit<
  ToolLoopParams,
  'systemPrompt' | 'allowedTools'
> & {
  mission: AiOrchestraMission;
  baseSystemPrompt: string;
};

const SPECIALIST_MAX_TOOL_CALLS = 4;
const SPECIALIST_MAX_OUTPUT_TOKENS = 700;
const FINAL_MAX_OUTPUT_TOKENS = 900;

export async function runAiAnalystAgentOrchestra(
  params: AgentOrchestraParams,
): Promise<ToolLoopResult> {
  const agents = getAiOrchestraAgentsForMission(params.mission);
  const specialistAgents = agents.filter(agent =>
    [
      'memory',
      'data_retrieval',
      'pattern_analysis',
      'settings_analysis',
      'behavior_analysis',
    ].includes(agent.role),
  );
  const safetyAgent = agents.find(agent => agent.role === 'safety');

  const findings = await runSpecialists(params, specialistAgents);
  const draft = await runFinalWriter(params, findings);
  const finalText = safetyAgent
    ? await runSafetyReview(params, safetyAgent, findings, draft)
    : draft;

  return {
    finalText: unwrapFinalEnvelope(finalText),
    llmMessages: [
      ...params.initialMessages,
      {
        role: 'assistant',
        content: unwrapFinalEnvelope(finalText),
      },
    ],
  };
}

async function runSpecialists(
  params: AgentOrchestraParams,
  agents: AiAgentDefinition[],
): Promise<AgentFinding[]> {
  const selectedAgents = agents.filter(agent => shouldRunAgent(agent, params.mission));

  const settled = await Promise.all(
    selectedAgents.map(async agent => {
      const content = await runSpecialist(params, agent);
      return {
        agentId: agent.id,
        title: agent.title,
        outputKind: agent.outputKind,
        content,
      };
    }),
  );

  return settled.filter(finding => finding.content.trim().length > 0);
}

function shouldRunAgent(agent: AiAgentDefinition, mission: AiOrchestraMission) {
  if (agent.required) return true;
  if (mission === 'loopSettings') return agent.role !== 'behavior_analysis';
  if (mission === 'userBehavior') return agent.role !== 'settings_analysis';
  if (mission === 'dailyBrief') return agent.role !== 'settings_analysis';
  if (mission === 'hypoNow' || mission === 'hypoDetective') {
    return agent.role === 'pattern_analysis';
  }
  return true;
}

async function runSpecialist(
  params: AgentOrchestraParams,
  agent: AiAgentDefinition,
): Promise<string> {
  const result = await runLlmToolLoop({
    provider: params.provider,
    model: params.model,
    systemPrompt: buildSpecialistPrompt(params, agent),
    initialMessages: params.initialMessages,
    maxToolCalls: Math.min(params.maxToolCalls, SPECIALIST_MAX_TOOL_CALLS),
    allowedTools: agent.allowedTools,
    maxOutputTokens: Math.min(params.maxOutputTokens, SPECIALIST_MAX_OUTPUT_TOKENS),
    temperature: params.temperature,
    abortSignal: params.abortSignal,
    callbacks: params.callbacks,
  });

  return unwrapFinalEnvelope(result.finalText);
}

async function runFinalWriter(
  params: AgentOrchestraParams,
  findings: AgentFinding[],
): Promise<string> {
  const content = await sendNoToolAgent(params, {
    systemPrompt: [
      buildAiOrchestraPromptBlock(params.mission),
      params.baseSystemPrompt,
      'You are the final writer. Use the specialist findings below to answer the patient.',
      'Do not mention internal agent names. Keep the answer concise, grounded, and practical.',
      'If findings conflict, prefer safety and explain uncertainty plainly.',
    ].join('\n\n'),
    messages: [
      ...params.initialMessages,
      {
        role: 'user',
        content: `Specialist findings:\n${JSON.stringify(findings, null, 2)}`,
      },
    ],
    maxOutputTokens: Math.min(params.maxOutputTokens, FINAL_MAX_OUTPUT_TOKENS),
  });

  return content;
}

async function runSafetyReview(
  params: AgentOrchestraParams,
  agent: AiAgentDefinition,
  findings: AgentFinding[],
  draft: string,
): Promise<string> {
  return sendNoToolAgent(params, {
    systemPrompt: [
      params.baseSystemPrompt,
      `Agent objective: ${agent.objective}`,
      'Review the draft for safety, medical overreach, unsupported claims, and unclear uncertainty.',
      'Return the final patient-facing answer only. If the draft is already safe, return it with minimal changes.',
    ].join('\n\n'),
    messages: [
      {
        role: 'user',
        content: `Findings:\n${JSON.stringify(findings, null, 2)}\n\nDraft:\n${draft}`,
      },
    ],
    maxOutputTokens: Math.min(params.maxOutputTokens, FINAL_MAX_OUTPUT_TOKENS),
  });
}

async function sendNoToolAgent(
  params: AgentOrchestraParams,
  input: {
    systemPrompt: string;
    messages: LlmChatMessage[];
    maxOutputTokens: number;
  },
) {
  const res = await params.provider.sendChat({
    model: params.model,
    messages: [{role: 'system', content: input.systemPrompt}, ...input.messages],
    temperature: params.temperature,
    maxOutputTokens: input.maxOutputTokens,
    abortSignal: params.abortSignal,
  });

  return String(res.content ?? '').trim();
}

function buildSpecialistPrompt(
  params: AgentOrchestraParams,
  agent: AiAgentDefinition,
): string {
  return [
    buildAiOrchestraPromptBlock(params.mission),
    params.baseSystemPrompt,
    `You are the ${agent.title}.`,
    `Objective: ${agent.objective}`,
    `Return ${agent.outputKind} only. Be concise and concrete.`,
    'Use tools only when needed. Report data gaps and confidence.',
  ].join('\n\n');
}

function unwrapFinalEnvelope(text: string): string {
  const trimmed = String(text ?? '').trim();
  if (!trimmed.startsWith('{')) return trimmed;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed?.type === 'final' && typeof parsed.content === 'string') {
      return parsed.content.trim();
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}
