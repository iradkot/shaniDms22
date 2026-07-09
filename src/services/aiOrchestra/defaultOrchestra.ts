import {
  AiAgentDefinition,
  AiOrchestraMission,
  AiOrchestraPhase,
  AiOrchestraPlan,
} from './types';

export const DEFAULT_AI_ORCHESTRA_AGENTS: AiAgentDefinition[] = [
  {
    id: 'orchestrator',
    role: 'orchestrator',
    title: 'Orchestrator',
    objective:
      'Route the request, decide which specialist findings are needed, and merge them into one coherent task plan.',
    required: true,
    allowedTools: [],
    outputKind: 'routing_plan',
  },
  {
    id: 'safety_reviewer',
    role: 'safety',
    title: 'Safety reviewer',
    objective:
      'Check for medical-risk language, dosing-risk overreach, missing uncertainty, and situations requiring a safer answer.',
    required: true,
    allowedTools: [],
    outputKind: 'safety_findings',
  },
  {
    id: 'memory_curator',
    role: 'memory',
    title: 'Memory curator',
    objective:
      'Retrieve patient context, preferences, active clinical flags, and historical notes that should influence the response.',
    required: true,
    allowedTools: [
      'getPatientProfileSnapshot',
      'searchMemory',
      'getMemoryByIds',
      'addMemoryEntry',
      'proposeMemoryEntry',
      'approveMemoryEntry',
    ],
    outputKind: 'memory_context',
  },
  {
    id: 'nightscout_data_agent',
    role: 'data_retrieval',
    title: 'Nightscout data agent',
    objective:
      'Pull the smallest useful Nightscout data slices, report coverage gaps, and avoid dumping raw samples into prompts.',
    required: true,
    allowedTools: [
      'getCgmSamples',
      'getTreatments',
      'getInsulinSummary',
      'getCurrentProfileSettings',
      'getSettingsChangeHistory',
    ],
    outputKind: 'data_findings',
  },
  {
    id: 'pattern_agent',
    role: 'pattern_analysis',
    title: 'Pattern agent',
    objective:
      'Find glucose, meal, low/high, and time-of-day patterns with concrete numbers and dates.',
    required: false,
    allowedTools: [
      'getGlucoseStats',
      'getGlucosePatterns',
      'getMonthlyGlucoseSummary',
      'analyzeMealResponses',
      'getMealAbsorptionData',
      'getGlycemicEvents',
    ],
    outputKind: 'pattern_findings',
  },
  {
    id: 'settings_agent',
    role: 'settings_analysis',
    title: 'Loop settings agent',
    objective:
      'Analyze Loop settings only when relevant, prefer conservative changes, and avoid basal changes by default.',
    required: false,
    allowedTools: [
      'getCurrentProfileSettings',
      'getSettingsChangeHistory',
      'analyzeSettingsImpact',
      'comparePeriods',
      'getPumpProfile',
    ],
    outputKind: 'settings_findings',
  },
  {
    id: 'agp_comparison_agent',
    role: 'pattern_analysis',
    title: 'AGP comparison agent',
    objective:
      'Explain period-to-period AGP differences using segment, meal, correction, and settings evidence.',
    required: false,
    allowedTools: ['analyzeAgpPeriodComparison'],
    outputKind: 'pattern_findings',
  },
  {
    id: 'behavior_agent',
    role: 'behavior_analysis',
    title: 'Behavior agent',
    objective:
      'Identify practical habit opportunities such as pre-bolus timing, carb estimation, activity, sleep, and follow-up checks.',
    required: false,
    allowedTools: [
      'analyzeMealResponses',
      'getMealAbsorptionData',
      'getInsulinDeliveryStats',
      'getTreatments',
    ],
    outputKind: 'behavior_findings',
  },
  {
    id: 'final_writer',
    role: 'final_writer',
    title: 'Final writer',
    objective:
      'Synthesize specialist findings into one short, humane, grounded answer in the user language.',
    required: true,
    allowedTools: [],
    outputKind: 'patient_answer',
  },
];

const COMMON_PHASES: AiOrchestraPhase[] = [
  {
    id: 'route_and_context',
    title: 'Route and gather context',
    execution: 'parallel',
    agentIds: ['orchestrator', 'memory_curator', 'nightscout_data_agent'],
    instruction:
      'Decide scope, load compact patient memory, and fetch only data needed for the request.',
  },
  {
    id: 'specialist_review',
    title: 'Specialist review',
    execution: 'parallel',
    agentIds: ['pattern_agent', 'settings_agent', 'behavior_agent'],
    instruction:
      'Run only relevant specialists. Each specialist returns findings, confidence, evidence, and missing data.',
  },
  {
    id: 'safety_and_write',
    title: 'Safety review and final answer',
    execution: 'serial',
    agentIds: ['safety_reviewer', 'final_writer'],
    instruction:
      'Check recommendations for safety, remove overreach, then write the final patient-facing answer.',
  },
];

function agentsForMission(mission: AiOrchestraMission): string[] {
  switch (mission) {
    case 'dailyBrief':
      return [
        'orchestrator',
        'memory_curator',
        'nightscout_data_agent',
        'pattern_agent',
        'behavior_agent',
        'safety_reviewer',
        'final_writer',
      ];
    case 'hypoNow':
    case 'hypoDetective':
      return [
        'orchestrator',
        'memory_curator',
        'nightscout_data_agent',
        'pattern_agent',
        'safety_reviewer',
        'final_writer',
      ];
    case 'loopSettings':
      return [
        'orchestrator',
        'memory_curator',
        'nightscout_data_agent',
        'pattern_agent',
        'settings_agent',
        'safety_reviewer',
        'final_writer',
      ];
    case 'agpPeriodComparison':
      return [
        'orchestrator',
        'memory_curator',
        'agp_comparison_agent',
        'settings_agent',
        'behavior_agent',
        'safety_reviewer',
        'final_writer',
      ];
    case 'userBehavior':
      return [
        'orchestrator',
        'memory_curator',
        'nightscout_data_agent',
        'pattern_agent',
        'behavior_agent',
        'safety_reviewer',
        'final_writer',
      ];
    case 'openChat':
    default:
      return DEFAULT_AI_ORCHESTRA_AGENTS.map(a => a.id);
  }
}

export function getAiOrchestraAgentsForMission(mission: AiOrchestraMission) {
  const ids = new Set(agentsForMission(mission));
  return DEFAULT_AI_ORCHESTRA_AGENTS.filter(agent => ids.has(agent.id));
}

export function buildAiOrchestraPlan(
  mission: AiOrchestraMission,
): AiOrchestraPlan {
  const ids = new Set(agentsForMission(mission));
  const phases = COMMON_PHASES.map(phase => ({
    ...phase,
    agentIds: phase.agentIds.filter(id => ids.has(id)),
  })).filter(phase => phase.agentIds.length > 0);

  return {
    mission,
    phases,
    finalWriterAgentId: 'final_writer',
  };
}

export function buildAiOrchestraPromptBlock(
  mission: AiOrchestraMission,
): string {
  const plan = buildAiOrchestraPlan(mission);
  const agents = getAiOrchestraAgentsForMission(mission);

  return [
    '=== AI_ORCHESTRA_PLAN ===',
    `mission: ${mission}`,
    `agents: ${agents.map(a => `${a.id}:${a.outputKind}`).join(', ')}`,
    'process:',
    ...plan.phases.map(
      phase =>
        `- ${phase.id} (${phase.execution}): ${phase.agentIds.join(', ')}. ${phase.instruction}`,
    ),
    'Synthesize specialist findings. Do not expose internal agent names to the patient.',
    '=== /AI_ORCHESTRA_PLAN ===',
  ].join('\n');
}
