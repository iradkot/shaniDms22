import type {StoredDestinationTarget} from '../destinations';
import type {StoredProductShellPreferences} from '../shell';

export const RELATIONSHIPS_TO_DATA_SUBJECT = [
  'self',
  'parent',
  'family-member',
  'caregiver',
  'clinician',
  'other',
  'prefer-not-to-answer',
] as const;

export type RelationshipToDataSubject =
  (typeof RELATIONSHIPS_TO_DATA_SUBJECT)[number];

export const PERSONALIZATION_LAYOUTS = ['phone', 'tablet', 'desktop'] as const;

export type PersonalizationLayout = (typeof PERSONALIZATION_LAYOUTS)[number];

/** Presentation only. Never stores a date, selected event, or medical value. */
export interface StoredDayGraphPreferences {
  readonly schemaVersion: 1;
  readonly mode: 'separate' | 'mixed';
  readonly windowHours: 'full-day' | 3 | 6 | 12;
}

export const DEFAULT_DAY_GRAPH_PREFERENCES: StoredDayGraphPreferences = {
  schemaVersion: 1,
  mode: 'separate',
  windowHours: 'full-day',
};

export const DAILY_OVERVIEW_CARD_IDS = [
  'ranges',
  'mean',
  'glucose',
  'insulin',
  'coverage',
] as const;

export type DailyOverviewCardId = (typeof DAILY_OVERVIEW_CARD_IDS)[number];

/** Presentation only. Medical values and selected dates never enter this snapshot. */
export interface StoredDailyOverviewPreferences {
  readonly schemaVersion: 1;
  readonly rangeStyle: 'ring' | 'bar' | 'list';
  /** Every card appears exactly once; editing cannot hide medical context. */
  readonly cardOrder: readonly DailyOverviewCardId[];
}

export const DEFAULT_DAILY_OVERVIEW_PREFERENCES: StoredDailyOverviewPreferences =
  {
    schemaVersion: 1,
    rangeStyle: 'ring',
    cardOrder: DAILY_OVERVIEW_CARD_IDS,
  };

export const PERSONALIZATION_QUESTIONNAIRE_STAGES = [
  'relationship',
  'quick-access',
  'presentation',
] as const;

export type PersonalizationQuestionnaireStage =
  (typeof PERSONALIZATION_QUESTIONNAIRE_STAGES)[number];

export type StoredQuestionnaireProgress =
  | {
      readonly schemaVersion: 1;
      readonly status: 'not-started' | 'completed' | 'skipped';
    }
  | {
      readonly schemaVersion: 1;
      readonly status: 'in-progress';
      readonly currentStage: PersonalizationQuestionnaireStage;
    };

export interface QuestionnaireRelationshipStage {
  readonly schemaVersion: 1;
  readonly relationship: RelationshipToDataSubject;
}

export interface QuestionnaireQuickAccessStage {
  readonly schemaVersion: 1;
  /** Explicit order, with no product-level maximum. */
  readonly favorites: readonly StoredDestinationTarget[];
}

export interface QuestionnairePresentationStage {
  readonly schemaVersion: 1;
  readonly layout: PersonalizationLayout;
  readonly showCurrentSnapshot: boolean;
  readonly showRecents: boolean;
  /** Advanced published GRI metric; disabled unless explicitly enabled. */
  readonly showGri: boolean;
  /** An omitted startDestination means Hub. */
  readonly shell: StoredProductShellPreferences;
  readonly dayGraph?: StoredDayGraphPreferences;
  readonly dailyOverview?: StoredDailyOverviewPreferences;
}

/**
 * The three independently renderable questionnaire stages.
 *
 * Answers contain navigation targets only. They cannot carry Workspace IDs,
 * dates, glucose values, filters, or other medical/transient context.
 */
export interface PersonalizationQuestionnaireAnswers {
  readonly schemaVersion: 1;
  readonly relationship: QuestionnaireRelationshipStage;
  readonly quickAccess: QuestionnaireQuickAccessStage;
  readonly presentation: QuestionnairePresentationStage;
}

export interface StoredAccountPersonalization {
  readonly schemaVersion: 1;
  /** Follows the Product User across Workspaces and devices. */
  readonly favorites: readonly StoredDestinationTarget[];
  /**
   * Modules omitted from All Modules. Favorites are intentionally independent
   * so hiding a Module never removes an explicit quick-access choice.
   */
  readonly hiddenModules: readonly StoredDestinationTarget[];
}

export interface StoredWorkspacePersonalization {
  readonly schemaVersion: 1;
  readonly questionnaire: StoredQuestionnaireProgress;
  /** Optional when onboarding was skipped. Never grants access. */
  readonly relationship?: RelationshipToDataSubject;
}

export interface StoredLayoutProfile {
  readonly schemaVersion: 1;
  readonly layout: PersonalizationLayout;
  readonly showCurrentSnapshot: boolean;
  readonly showRecents: boolean;
  readonly showGri: boolean;
  readonly shell: StoredProductShellPreferences;
  /** Optional for backwards-compatible local and remote snapshots. */
  readonly dayGraph?: StoredDayGraphPreferences;
  readonly dailyOverview?: StoredDailyOverviewPreferences;
}

export interface StoredLayoutPersonalization {
  readonly schemaVersion: 1;
  /** Exactly one synchronised profile for each form factor. */
  readonly profiles: readonly StoredLayoutProfile[];
}

export interface StoredRecentModule {
  readonly schemaVersion: 1;
  readonly target: StoredDestinationTarget;
  readonly visitedAt: number;
}

export interface StoredDevicePersonalization {
  readonly schemaVersion: 1;
  /** Device-local and capped at the persistence boundary. */
  readonly recentModules: readonly StoredRecentModule[];
}

/**
 * One transport-neutral snapshot with explicit sync seams.
 *
 * Account, Workspace, Layout, and device adapters may persist their nested
 * sections independently without reclassifying individual fields.
 */
export interface StoredProductPersonalization {
  readonly schemaVersion: 1;
  readonly account: StoredAccountPersonalization;
  readonly workspace: StoredWorkspacePersonalization;
  readonly layout: StoredLayoutPersonalization;
  readonly device: StoredDevicePersonalization;
}

/** A full replacement or an atomic update against the latest local value. */
export type ProductPersonalizationChange =
  | StoredProductPersonalization
  | ((current: StoredProductPersonalization) => StoredProductPersonalization);

export interface ProductPersonalizationSaveOptions {
  /** Editors with their own draft can publish only after local persistence. */
  readonly optimistic?: boolean;
}

export const MAX_PERSISTED_RECENT_MODULES = 20;
