import {AiAnalystToolName} from 'app/services/aiAnalyst/aiAnalystLocalTools';

export type AiAgentRole =
  | 'orchestrator'
  | 'safety'
  | 'memory'
  | 'data_retrieval'
  | 'pattern_analysis'
  | 'settings_analysis'
  | 'behavior_analysis'
  | 'final_writer';

export type AiAgentOutputKind =
  | 'routing_plan'
  | 'safety_findings'
  | 'memory_context'
  | 'data_findings'
  | 'pattern_findings'
  | 'settings_findings'
  | 'behavior_findings'
  | 'patient_answer';

export type AiAgentDefinition = {
  id: string;
  role: AiAgentRole;
  title: string;
  objective: string;
  required: boolean;
  allowedTools: AiAnalystToolName[];
  outputKind: AiAgentOutputKind;
};

export type AiOrchestraMission =
  | 'openChat'
  | 'dailyBrief'
  | 'hypoNow'
  | 'hypoDetective'
  | 'userBehavior'
  | 'loopSettings';

export type AiOrchestraPhase = {
  id: string;
  title: string;
  execution: 'serial' | 'parallel';
  agentIds: string[];
  instruction: string;
};

export type AiOrchestraPlan = {
  mission: AiOrchestraMission;
  phases: AiOrchestraPhase[];
  finalWriterAgentId: string;
};
