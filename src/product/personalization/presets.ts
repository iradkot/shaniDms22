import {
  CORE_DESTINATION_IDS,
  createStoredDestinationTarget,
  type StoredDestinationTarget,
} from '../destinations';
import type {StoredProductShellPreferences} from '../shell';
import type {
  PersonalizationLayout,
  PersonalizationQuestionnaireAnswers,
  RelationshipToDataSubject,
  StoredLayoutProfile,
  StoredProductPersonalization,
} from './types';
import {parseStoredProductPersonalization} from './validation';

const target = (id: string): StoredDestinationTarget =>
  createStoredDestinationTarget(id);

const SELF_FAVORITES = [
  CORE_DESTINATION_IDS.dayGraph,
  CORE_DESTINATION_IDS.dailyOverview,
  CORE_DESTINATION_IDS.trends,
].map(target);

const CARE_FAVORITES = [
  CORE_DESTINATION_IDS.dayGraph,
  CORE_DESTINATION_IDS.hypoInvestigation,
  CORE_DESTINATION_IDS.updateCenter,
].map(target);

const CLINICIAN_FAVORITES = [
  CORE_DESTINATION_IDS.dailyOverview,
  CORE_DESTINATION_IDS.trends,
  CORE_DESTINATION_IDS.loopChangesImpact,
  CORE_DESTINATION_IDS.similarEvents,
].map(target);

/** The editable general recommendation currently shown by the Hub rewrite. */
const GENERAL_FAVORITES = [
  CORE_DESTINATION_IDS.dayGraph,
  CORE_DESTINATION_IDS.dailyOverview,
  CORE_DESTINATION_IDS.trends,
  CORE_DESTINATION_IDS.meals,
  CORE_DESTINATION_IDS.aiAnalyst,
].map(target);

const DEFAULT_SHELL: StoredProductShellPreferences = {
  schemaVersion: 1,
  shortcuts: [
    target(CORE_DESTINATION_IDS.aiAnalyst),
    target(CORE_DESTINATION_IDS.updateCenter),
  ],
};

const favoritePreset = (
  relationship: RelationshipToDataSubject,
): readonly StoredDestinationTarget[] => {
  switch (relationship) {
    case 'self':
      return SELF_FAVORITES;
    case 'parent':
    case 'caregiver':
      return CARE_FAVORITES;
    case 'clinician':
      return CLINICIAN_FAVORITES;
    case 'family-member':
    case 'other':
    case 'prefer-not-to-answer':
      return GENERAL_FAVORITES;
  }
};

const createGeneralLayoutProfile = (
  layout: PersonalizationLayout,
): StoredLayoutProfile => ({
  schemaVersion: 1,
  layout,
  showCurrentSnapshot: false,
  showRecents: true,
  showGri: false,
  shell: DEFAULT_SHELL,
});

/**
 * Builds editable answers. It selects quick access; it never hides Modules.
 */
export const buildPersonalizationQuestionnairePreset = (
  relationship: RelationshipToDataSubject,
  layout: PersonalizationLayout,
): PersonalizationQuestionnaireAnswers => ({
  schemaVersion: 1,
  relationship: {schemaVersion: 1, relationship},
  quickAccess: {
    schemaVersion: 1,
    favorites: favoritePreset(relationship),
  },
  presentation: {
    schemaVersion: 1,
    layout,
    showCurrentSnapshot:
      relationship === 'parent' || relationship === 'caregiver',
    showRecents: true,
    showGri: false,
    shell: DEFAULT_SHELL,
  },
});

/**
 * Safe initial state before onboarding. Skipping keeps this general editable
 * layout and leaves Relationship unset.
 */
export const createDefaultProductPersonalization =
  (): StoredProductPersonalization =>
    parseStoredProductPersonalization({
      schemaVersion: 1,
      account: {
        schemaVersion: 1,
        favorites: GENERAL_FAVORITES,
        hiddenModules: [],
      },
      workspace: {
        schemaVersion: 1,
        questionnaire: {schemaVersion: 1, status: 'not-started'},
      },
      layout: {
        schemaVersion: 1,
        profiles: [
          createGeneralLayoutProfile('phone'),
          createGeneralLayoutProfile('tablet'),
          createGeneralLayoutProfile('desktop'),
        ],
      },
      device: {schemaVersion: 1, recentModules: []},
    });
