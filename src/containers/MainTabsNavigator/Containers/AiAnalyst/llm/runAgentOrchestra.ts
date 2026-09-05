import {LlmChatMessage} from 'app/services/llm/llmTypes';
import {
  AiAgentDefinition,
  AiOrchestraMission,
  buildAiOrchestraPromptBlock,
  getAiOrchestraAgentsForMission,
} from 'app/services/aiOrchestra';

import {runLlmToolLoop} from './runToolLoop';
import {ToolLoopParams, ToolLoopResult} from './types';
import {
  maybeRewriteLoopSettingsResponse,
  maybeReflectAsEndoExpert,
} from './guardrails';
import {
  createLoopSettingsEvidenceState,
  hasMinimumLoopSettingsEvidence,
  isLoopSettingsReadOnlyTool,
  LOOP_SETTINGS_EVIDENCE_SAFETY_RESPONSE,
  recordLoopSettingsEvidence,
} from './guardrails/loopSettingsEvidenceGate';

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
const MAX_REVIEW_LOOPS = 4;

const LOOP_AND_PREGNANCY_REFERENCE_GUIDANCE = [
  'Reference guidance to use when relevant:',
  '- LoopDocs: Loop uses user therapy settings, meal entries, insulin data, and glucose data to predict glucose and bring predictions into the correction range.',
  '- LoopDocs: Loop predicts glucose over roughly the next 6 hours; recent hours have the strongest impact on recommendations.',
  '- LoopDocs algorithm overview: Loop should avoid adding insulin when the near-term prediction goes below the glucose safety limit.',
  '- OpenAPS safety design: automated systems can reduce or suspend insulin, but cannot remove insulin already on board from earlier boluses/corrections.',
  '- ADA Standards of Care in Diabetes 2026, pregnancy CGM goals: target sensor range 63-140 mg/dL, TIR >70%, time below 63 mg/dL <4%, time below 54 mg/dL <1%.',
  '- Practical implication: a user target around 75-80 mg/dL is a very narrow overnight buffer; do not frame failure to sit exactly at 75-80 as user failure.',
  '- Pregnancy possibility is not inferable from CGM data. If pregnancy is possible, answers may discuss physiology and safer monitoring, but should not diagnose.',
].join('\n');

export async function runAiAnalystAgentOrchestra(
  params: AgentOrchestraParams,
): Promise<ToolLoopResult> {
  if (params.callbacks.isCancelled() || params.abortSignal?.aborted) {
    return {finalText: '', llmMessages: params.initialMessages};
  }
  const isLoopSettingsMode = params.mission === 'loopSettings';
  let evidence = createLoopSettingsEvidenceState();
  const scopedParams: AgentOrchestraParams = {
    ...params,
    callbacks: {
      ...params.callbacks,
      onToolResult: (name, result) => {
        if (params.callbacks.isCancelled() || params.abortSignal?.aborted)
          return;
        if (isLoopSettingsMode) {
          evidence = recordLoopSettingsEvidence(evidence, name, result);
        }
        params.callbacks.onToolResult?.(name, result);
      },
    },
  };
  const agents = getAiOrchestraAgentsForMission(params.mission);
  const specialistAgents = agents.filter(agent =>
    [
      'memory',
      'data_retrieval',
      'pattern_analysis',
      'settings_analysis',
      'behavior_analysis',
      'clinical_reference',
    ].includes(agent.role),
  );
  const safetyAgent = agents.find(agent => agent.role === 'safety');

  const findings = await runSpecialists(scopedParams, specialistAgents);
  if (params.callbacks.isCancelled() || params.abortSignal?.aborted) {
    return {finalText: '', llmMessages: params.initialMessages};
  }
  if (isLoopSettingsMode && !hasMinimumLoopSettingsEvidence(evidence)) {
    return {
      finalText: LOOP_SETTINGS_EVIDENCE_SAFETY_RESPONSE,
      llmMessages: [
        ...params.initialMessages,
        {role: 'assistant', content: LOOP_SETTINGS_EVIDENCE_SAFETY_RESPONSE},
      ],
    };
  }
  const draft = await runFinalWriter(scopedParams, findings);
  let finalText = safetyAgent
    ? await runSafetyReview(scopedParams, safetyAgent, findings, draft)
    : draft;
  if (isLoopSettingsMode) {
    const guardParams = {
      provider: params.provider,
      model: params.model,
      systemPrompt: params.baseSystemPrompt,
      workingMessages: params.initialMessages,
      temperature: params.temperature,
      abortSignal: params.abortSignal,
      isCancelled: params.callbacks.isCancelled,
    };
    finalText = await maybeRewriteLoopSettingsResponse(finalText, guardParams);
    finalText = await maybeReflectAsEndoExpert(finalText, guardParams);
  }

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
  const selectedAgents = agents.filter(agent =>
    shouldRunAgent(agent, params.mission),
  );

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
  if (agent.required) {
    return true;
  }
  if (mission === 'loopSettings') {
    return agent.role !== 'behavior_analysis';
  }
  if (mission === 'userBehavior') {
    return agent.role !== 'settings_analysis';
  }
  if (mission === 'dailyBrief') {
    return agent.role !== 'settings_analysis';
  }
  if (mission === 'hypoNow' || mission === 'hypoDetective') {
    return (
      agent.role === 'pattern_analysis' || agent.role === 'clinical_reference'
    );
  }
  return true;
}

async function runSpecialist(
  params: AgentOrchestraParams,
  agent: AiAgentDefinition,
): Promise<string> {
  if (params.callbacks.isCancelled() || params.abortSignal?.aborted) return '';
  const result = await runLlmToolLoop({
    workspaceScope: params.workspaceScope,
    provider: params.provider,
    model: params.model,
    systemPrompt: buildSpecialistPrompt(params, agent),
    initialMessages: params.initialMessages,
    maxToolCalls: Math.min(params.maxToolCalls, SPECIALIST_MAX_TOOL_CALLS),
    allowedTools:
      params.mission === 'loopSettings'
        ? agent.allowedTools.filter(isLoopSettingsReadOnlyTool)
        : agent.allowedTools,
    maxOutputTokens: Math.min(
      params.maxOutputTokens,
      SPECIALIST_MAX_OUTPUT_TOKENS,
    ),
    ...(params.temperature !== undefined
      ? {temperature: params.temperature}
      : {}),
    ...(params.abortSignal !== undefined
      ? {abortSignal: params.abortSignal}
      : {}),
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
      'Do not optimize for a single glucose number. Explain why exact overnight targets may not be achievable when insulin-on-board, carbs-on-board, activity, or sensor lag are involved.',
      'When the user asks why they are not reaching 75-80 overnight, explicitly check: current target range, overnight TIR/TBR, lows, late bolus/correction stacking, COB/meal absorption, recent setting changes, and pregnancy/illness/activity uncertainty.',
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

  return runDraftReviewLoops(params, findings, content);
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
      LOOP_AND_PREGNANCY_REFERENCE_GUIDANCE,
      `Agent objective: ${agent.objective}`,
      'Review the draft for safety, medical overreach, unsupported claims, and unclear uncertainty.',
      'Be especially strict for pregnancy, overnight lows, targets below 80 mg/dL, and insulin-setting recommendations.',
      'Return the final patient-facing answer only. If the draft is already safe, return it with minimal changes.',
    ].join('\n\n'),
    messages: [
      {
        role: 'user',
        content: `Findings:\n${JSON.stringify(
          findings,
          null,
          2,
        )}\n\nDraft:\n${draft}`,
      },
    ],
    maxOutputTokens: Math.min(params.maxOutputTokens, FINAL_MAX_OUTPUT_TOKENS),
  });
}

async function runDraftReviewLoops(
  params: AgentOrchestraParams,
  findings: AgentFinding[],
  initialDraft: string,
): Promise<string> {
  let draft = initialDraft;

  for (let i = 0; i < MAX_REVIEW_LOOPS; i += 1) {
    if (params.callbacks.isCancelled()) {
      return draft;
    }

    const critique = await sendNoToolAgent(params, {
      systemPrompt: [
        params.baseSystemPrompt,
        LOOP_AND_PREGNANCY_REFERENCE_GUIDANCE,
        'You are a strict diabetes-tech recommendation reviewer.',
        'Grill the draft against the patient request, the specialist findings, and the reference guidance.',
        'Return APPROVED only if the draft is specific, evidence-grounded, safe, and gives a useful next step.',
        'Otherwise return concise bullets beginning with Fix: for every required improvement.',
      ].join('\n\n'),
      messages: [
        {
          role: 'user',
          content:
            `Specialist findings:\n${JSON.stringify(findings, null, 2)}\n\n` +
            `Draft to review:\n${draft}`,
        },
      ],
      maxOutputTokens: Math.min(params.maxOutputTokens, 650),
    });

    if (critiqueLooksApproved(critique)) {
      break;
    }

    draft = await sendNoToolAgent(params, {
      systemPrompt: [
        buildAiOrchestraPromptBlock(params.mission),
        params.baseSystemPrompt,
        LOOP_AND_PREGNANCY_REFERENCE_GUIDANCE,
        'Revise the patient-facing answer to satisfy the critique.',
        'Keep it concise, practical, in the user language, and do not mention internal review loops.',
        'If evidence is missing, say exactly what is missing and give a safer question/check rather than guessing.',
      ].join('\n\n'),
      messages: [
        {
          role: 'user',
          content:
            `Specialist findings:\n${JSON.stringify(findings, null, 2)}\n\n` +
            `Previous draft:\n${draft}\n\nReviewer critique:\n${critique}`,
        },
      ],
      maxOutputTokens: Math.min(
        params.maxOutputTokens,
        FINAL_MAX_OUTPUT_TOKENS,
      ),
    });
  }

  return draft;
}

async function sendNoToolAgent(
  params: AgentOrchestraParams,
  input: {
    systemPrompt: string;
    messages: LlmChatMessage[];
    maxOutputTokens: number;
  },
) {
  if (params.callbacks.isCancelled() || params.abortSignal?.aborted) {
    throw new Error('AI analysis cancelled');
  }
  const res = await params.provider.sendChat({
    model: params.model,
    messages: [
      {role: 'system', content: input.systemPrompt},
      ...input.messages,
    ],
    ...(params.temperature !== undefined
      ? {temperature: params.temperature}
      : {}),
    maxOutputTokens: input.maxOutputTokens,
    ...(params.abortSignal !== undefined
      ? {abortSignal: params.abortSignal}
      : {}),
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
    agent.role === 'clinical_reference'
      ? LOOP_AND_PREGNANCY_REFERENCE_GUIDANCE
      : '',
    `You are the ${agent.title}.`,
    `Objective: ${agent.objective}`,
    `Return ${agent.outputKind} only. Be concise and concrete.`,
    'Use tools only when needed. Report data gaps and confidence.',
  ].join('\n\n');
}

function critiqueLooksApproved(text: string): boolean {
  const normalized = String(text ?? '')
    .trim()
    .toLowerCase();
  return (
    normalized === 'approved' ||
    normalized.startsWith('approved\n') ||
    normalized.includes('no issues found. approved')
  );
}

function unwrapFinalEnvelope(text: string): string {
  const trimmed = String(text ?? '').trim();
  if (!trimmed.startsWith('{')) {
    return trimmed;
  }

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
