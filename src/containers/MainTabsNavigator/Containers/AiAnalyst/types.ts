import {RefObject} from 'react';
import {ScrollView} from 'react-native';
import {AiAnalystToolName} from 'app/services/aiAnalyst/aiAnalystLocalTools';
import {LlmChatMessage} from 'app/services/llm/llmTypes';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type MissionKey = 'hypoDetective' | 'userBehavior' | 'loopSettings';

export type AnalystMode = 'userBehavior' | 'loopSettings';

export type ScreenState =
  | {mode: 'locked'}
  | {mode: 'dashboard'}
  | {mode: 'modeSelection'}
  | {mode: 'history'}
  | {mode: 'historyDetail'; id: string}
  | {mode: 'mission'; mission: MissionKey};

export type ToolEnvelope =
  | {type: 'tool_call'; name: AiAnalystToolName; args?: any}
  | {type: 'final'; content: string};

// ---------------------------------------------------------------------------
// Markdown config bundle (returned by the hook, consumed by screens)
// ---------------------------------------------------------------------------

export interface MarkdownConfig {
  instance: ReturnType<typeof import('./helpers/markdownConfig').createMarkdownItInstance>;
  rules: ReturnType<typeof import('./helpers/markdownConfig').createSelectableMarkdownRules>;
  style: ReturnType<typeof import('./helpers/markdownConfig').createMarkdownStyle>;
}

// ---------------------------------------------------------------------------
// Engine interface – everything the hook exposes to screen components
// ---------------------------------------------------------------------------

export interface AiAnalystEngine {
  // Screen routing
  state: ScreenState;
  setState: React.Dispatch<React.SetStateAction<ScreenState>>;
  hasKey: boolean;
  isEnabled: boolean;

  // Chat state
  uiMessages: LlmChatMessage[];
  input: string;
  setInput: (text: string) => void;
  isBusy: boolean;
  progressText: string;
  errorText: string | null;

  // History
  historyItems: any[];
  historyBusy: boolean;

  // Refs
  scrollRef: RefObject<ScrollView | null>;

  // Markdown rendering
  markdown: MarkdownConfig;

  // Navigation / actions
  openSettings: () => void;
  openHistory: () => Promise<void>;
  clearHistory: () => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  startHypoDetective: () => Promise<void>;
  startUserBehavior: () => Promise<void>;
  startLoopSettingsAdvisor: () => Promise<void>;
  sendFollowUp: () => Promise<void>;
  cancelActiveRun: () => void;
  goBackToDashboard: () => void;
  exportSession: () => Promise<void>;
}
