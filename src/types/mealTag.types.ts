/**
 * Meal tagging types.
 *
 * Tags are simple lowercase strings (e.g. "pizza", "sushi", "family dinner").
 * They are stored locally in AsyncStorage and synced to the Nightscout
 * treatment `notes` field.
 */

/** A single tag applied to a meal/treatment. */
export type MealTag = string;

/**
 * A record mapping a treatment/meal ID to its tags.
 * Stored as a flat JSON object in AsyncStorage.
 */
export type MealTagMap = Record<string, MealTag[]>;

/** Entry in the tag registry — tracks popularity for autocomplete. */
export interface TagRegistryEntry {
  /** Normalised tag name (lowercase, trimmed). */
  tag: string;
  /** How many times this tag has been used. */
  count: number;
  /** Last-used timestamp (ms) for recency sorting. */
  lastUsed: number;
}

/** Serialised shape stored under the `tag-registry-v1` key. */
export type TagRegistry = TagRegistryEntry[];
