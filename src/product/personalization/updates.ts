import type {StoredDestinationTarget} from '../destinations';
import type {
  PersonalizationLayout,
  PersonalizationQuestionnaireAnswers,
  PersonalizationQuestionnaireStage,
  ProductPersonalizationChange,
  QuestionnairePresentationStage,
  RelationshipToDataSubject,
  StoredLayoutProfile,
  StoredDayGraphPreferences,
  StoredProductPersonalization,
} from './types';
import {MAX_PERSISTED_RECENT_MODULES} from './types';
import {
  parsePersonalizationQuestionnaireAnswers,
  parseStoredLayoutProfile,
  parseStoredProductPersonalization,
} from './validation';

const replaceLayoutProfile = (
  current: StoredProductPersonalization,
  replacement: StoredLayoutProfile,
): StoredProductPersonalization =>
  parseStoredProductPersonalization({
    ...current,
    layout: {
      ...current.layout,
      profiles: current.layout.profiles.map(profile =>
        profile.layout === replacement.layout ? replacement : profile,
      ),
    },
  });

export const beginPersonalizationQuestionnaire = (
  current: StoredProductPersonalization,
  currentStage: PersonalizationQuestionnaireStage = 'relationship',
): StoredProductPersonalization =>
  parseStoredProductPersonalization({
    ...current,
    workspace: {
      ...current.workspace,
      questionnaire: {schemaVersion: 1, status: 'in-progress', currentStage},
    },
  });

export const completePersonalizationQuestionnaire = (
  current: StoredProductPersonalization,
  untrustedAnswers: unknown,
): StoredProductPersonalization => {
  const answers: PersonalizationQuestionnaireAnswers =
    parsePersonalizationQuestionnaireAnswers(untrustedAnswers);
  const updatedLayout = parseStoredLayoutProfile({
    ...answers.presentation,
  });
  return parseStoredProductPersonalization({
    ...current,
    account: {
      ...current.account,
      favorites: answers.quickAccess.favorites,
    },
    workspace: {
      ...current.workspace,
      questionnaire: {schemaVersion: 1, status: 'completed'},
      relationship: answers.relationship.relationship,
    },
    layout: {
      ...current.layout,
      profiles: current.layout.profiles.map(profile =>
        profile.layout === updatedLayout.layout ? updatedLayout : profile,
      ),
    },
  });
};

/**
 * Changes presentation without rewriting onboarding history. In particular,
 * a Product User who skipped the questionnaire is never forced to invent a
 * relationship merely to edit Favorites or a Layout Profile.
 */
export const customizeProductPersonalization = (
  current: StoredProductPersonalization,
  input: {
    readonly relationship?: RelationshipToDataSubject;
    readonly favorites: readonly StoredDestinationTarget[];
    readonly hiddenModules?: readonly StoredDestinationTarget[];
    readonly presentation: QuestionnairePresentationStage;
  },
): StoredProductPersonalization => {
  const updatedLayout = parseStoredLayoutProfile(input.presentation);
  return parseStoredProductPersonalization({
    ...current,
    account: {
      ...current.account,
      favorites: input.favorites,
      hiddenModules: input.hiddenModules ?? current.account.hiddenModules,
    },
    workspace:
      input.relationship === undefined
        ? current.workspace
        : {...current.workspace, relationship: input.relationship},
    layout: {
      ...current.layout,
      profiles: current.layout.profiles.map(profile =>
        profile.layout === updatedLayout.layout ? updatedLayout : profile,
      ),
    },
  });
};

/** Resolves an update against the latest value and validates its result. */
export const resolveProductPersonalizationChange = (
  current: StoredProductPersonalization,
  change: ProductPersonalizationChange,
): StoredProductPersonalization =>
  parseStoredProductPersonalization(
    typeof change === 'function' ? change(current) : change,
  );

export const skipPersonalizationQuestionnaire = (
  current: StoredProductPersonalization,
): StoredProductPersonalization => {
  const workspaceWithoutRelationship = {...current.workspace};
  delete workspaceWithoutRelationship.relationship;
  return parseStoredProductPersonalization({
    ...current,
    workspace: {
      ...workspaceWithoutRelationship,
      questionnaire: {schemaVersion: 1, status: 'skipped'},
    },
  });
};

export const replaceFavoriteDestinations = (
  current: StoredProductPersonalization,
  favorites: readonly StoredDestinationTarget[],
): StoredProductPersonalization =>
  parseStoredProductPersonalization({
    ...current,
    account: {...current.account, favorites},
  });

export type FavoriteMoveDirection = 'earlier' | 'later';

/**
 * Moves one stable Favorite in its explicit display order.
 * Boundary and unknown moves are no-ops so UI controls can stay race-safe.
 */
export const moveFavoriteDestination = (
  favorites: readonly StoredDestinationTarget[],
  destinationId: string,
  direction: FavoriteMoveDirection,
): readonly StoredDestinationTarget[] => {
  const currentIndex = favorites.findIndex(
    favorite => favorite.destinationId === destinationId,
  );
  const nextIndex = currentIndex + (direction === 'earlier' ? -1 : 1);
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= favorites.length) {
    return favorites;
  }
  const reordered = [...favorites];
  const current = reordered[currentIndex];
  const next = reordered[nextIndex];
  if (current === undefined || next === undefined) {
    return favorites;
  }
  reordered[currentIndex] = next;
  reordered[nextIndex] = current;
  return reordered;
};

export const replaceHiddenModules = (
  current: StoredProductPersonalization,
  hiddenModules: readonly StoredDestinationTarget[],
): StoredProductPersonalization =>
  parseStoredProductPersonalization({
    ...current,
    account: {...current.account, hiddenModules},
  });

export const updateLayoutProfile = (
  current: StoredProductPersonalization,
  untrustedProfile: unknown,
): StoredProductPersonalization =>
  replaceLayoutProfile(current, parseStoredLayoutProfile(untrustedProfile));

export const selectLayoutProfile = (
  current: StoredProductPersonalization,
  layout: PersonalizationLayout,
): StoredLayoutProfile => {
  const profile = current.layout.profiles.find(
    candidate => candidate.layout === layout,
  );
  if (!profile) {
    throw new Error(`Missing ${layout} Layout Profile`);
  }
  return profile;
};

/** Apply to the latest snapshot so saving a chart never undoes Hub edits or visits. */
export const updateDayGraphPreferences = (
  current: StoredProductPersonalization,
  layout: PersonalizationLayout,
  dayGraph: StoredDayGraphPreferences,
): StoredProductPersonalization =>
  updateLayoutProfile(current, {
    ...selectLayoutProfile(current, layout),
    dayGraph,
  });

export const recordRecentModule = (
  current: StoredProductPersonalization,
  target: StoredDestinationTarget,
  visitedAt: number,
): StoredProductPersonalization =>
  parseStoredProductPersonalization({
    ...current,
    device: {
      ...current.device,
      recentModules: [
        {schemaVersion: 1, target, visitedAt},
        ...current.device.recentModules.filter(
          recent => recent.target.destinationId !== target.destinationId,
        ),
      ].slice(0, MAX_PERSISTED_RECENT_MODULES),
    },
  });

export const clearRecentModules = (
  current: StoredProductPersonalization,
): StoredProductPersonalization =>
  parseStoredProductPersonalization({
    ...current,
    device: {...current.device, recentModules: []},
  });
