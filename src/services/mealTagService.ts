/**
 * Meal Tag Service — AsyncStorage-backed CRUD with Nightscout sync.
 *
 * Storage layout:
 *   `meal-tags-v1`     → MealTagMap  (treatmentId → string[])
 *   `tag-registry-v1`  → TagRegistry (global list for autocomplete)
 *
 * Nightscout sync:
 *   Tags are written to the treatment `notes` field as comma-separated values.
 *   When reading treatments, tags are extracted from notes via `parseTagsFromNotes`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {nightscoutInstance} from 'app/api/shaniNightscoutInstances';
import type {MealTag, MealTagMap, TagRegistry, TagRegistryEntry} from 'app/types/mealTag.types';

// ── Storage keys ────────────────────────────────────────────────────────

const TAG_MAP_KEY = 'meal-tags-v1';
const REGISTRY_KEY = 'tag-registry-v1';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Normalise a tag: lowercase, trimmed, collapse whitespace. */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Serialise tags into a Nightscout-friendly notes string. */
export function formatTagsForNotes(tags: MealTag[]): string {
  if (!tags.length) return '';
  return tags.map(t => `#${t}`).join(' ');
}

/**
 * Parse tags from a Nightscout treatment `notes` field.
 * Extracts `#tag` patterns (supports spaces via quote-style).
 * Also falls back to comma-separated if no hashtags found.
 */
export function parseTagsFromNotes(notes: string | null | undefined): MealTag[] {
  if (!notes || typeof notes !== 'string') return [];

  // Try hashtag patterns first: #pizza  #family-dinner  #"family dinner"
  const hashtagRe = /#([\w][\w\s-]*?)(?=\s+#|\s*$)/g;
  const hashMatches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = hashtagRe.exec(notes)) !== null) {
    const tag = normalizeTag(m[1]);
    if (tag) hashMatches.push(tag);
  }
  if (hashMatches.length) return hashMatches;

  // No hashtags — maybe raw comma-separated tags?
  // Only if notes looks tag-like (short, no long sentences)
  if (notes.length < 100 && notes.includes(',')) {
    return notes
      .split(',')
      .map(normalizeTag)
      .filter(Boolean);
  }

  return [];
}

// ── Tag Map (treatmentId → tags) ────────────────────────────────────────

async function loadTagMap(): Promise<MealTagMap> {
  try {
    const raw = await AsyncStorage.getItem(TAG_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveTagMap(map: MealTagMap): Promise<void> {
  await AsyncStorage.setItem(TAG_MAP_KEY, JSON.stringify(map));
}

export async function getTagsForMeal(mealId: string): Promise<MealTag[]> {
  const map = await loadTagMap();
  return map[mealId] ?? [];
}

export async function setTagsForMeal(mealId: string, tags: MealTag[]): Promise<void> {
  const map = await loadTagMap();
  const normalised = tags.map(normalizeTag).filter(Boolean);
  if (normalised.length) {
    map[mealId] = normalised;
  } else {
    delete map[mealId];
  }
  await saveTagMap(map);

  // Update the registry with any new tags
  await batchUpdateRegistry(normalised);
}

/**
 * Get all tags for a batch of meal IDs at once.
 * More efficient than calling getTagsForMeal N times.
 */
export async function getTagsForMeals(mealIds: string[]): Promise<MealTagMap> {
  const map = await loadTagMap();
  const result: MealTagMap = {};
  for (const id of mealIds) {
    if (map[id]?.length) {
      result[id] = map[id];
    }
  }
  return result;
}

// ── Tag Registry (autocomplete) ─────────────────────────────────────────

async function loadRegistry(): Promise<TagRegistry> {
  try {
    const raw = await AsyncStorage.getItem(REGISTRY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveRegistry(registry: TagRegistry): Promise<void> {
  await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
}

async function batchUpdateRegistry(tags: MealTag[]): Promise<void> {
  const registry = await loadRegistry();
  const now = Date.now();
  const lookup = new Map(registry.map(e => [e.tag, e]));

  for (const tag of tags) {
    const existing = lookup.get(tag);
    if (existing) {
      existing.count += 1;
      existing.lastUsed = now;
    } else {
      const entry: TagRegistryEntry = {tag, count: 1, lastUsed: now};
      registry.push(entry);
      lookup.set(tag, entry);
    }
  }

  // Keep registry sorted by usage (descending), then recency
  registry.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);

  // Cap at 200 entries
  await saveRegistry(registry.slice(0, 200));
}

/**
 * Get popular/recent tags for autocomplete suggestions.
 * Returns up to `limit` tags sorted by usage count then recency.
 */
export async function getTagSuggestions(limit: number = 20): Promise<string[]> {
  const registry = await loadRegistry();
  return registry.slice(0, limit).map(e => e.tag);
}

/**
 * Get all unique tags that have been used, sorted by popularity.
 */
export async function getAllKnownTags(): Promise<TagRegistryEntry[]> {
  return loadRegistry();
}

// ── Nightscout Sync ─────────────────────────────────────────────────────

/**
 * Sync tags to a Nightscout treatment's `notes` field.
 * Preserves any existing non-tag notes content.
 */
export async function syncTagsToNightscout(
  treatmentId: string,
  tags: MealTag[],
): Promise<boolean> {
  try {
    // First fetch the current treatment to preserve existing notes
    const response = await nightscoutInstance.get(`/api/v1/treatments/${treatmentId}`);
    const treatment = response.data;

    // Strip old tags from notes, preserve other content
    const existingNotes = typeof treatment?.notes === 'string' ? treatment.notes : '';
    const nonTagNotes = existingNotes
      .replace(/#[\w][\w\s-]*/g, '')
      .trim();

    // Build new notes: existing content + tags
    const tagString = formatTagsForNotes(tags);
    const newNotes = [nonTagNotes, tagString].filter(Boolean).join(' ').trim();

    // PUT update
    await nightscoutInstance.put(`/api/v1/treatments`, {
      ...treatment,
      notes: newNotes,
    });

    return true;
  } catch (err) {
    console.warn('syncTagsToNightscout: Failed to sync', treatmentId, err);
    return false;
  }
}

/**
 * Save tags locally and sync to Nightscout in background.
 * Returns immediately after local save — NS sync is fire-and-forget.
 */
export async function tagMealAndSync(
  mealId: string,
  tags: MealTag[],
): Promise<void> {
  // 1. Save locally (fast)
  await setTagsForMeal(mealId, tags);

  // 2. Sync to Nightscout (background, don't block)
  syncTagsToNightscout(mealId, tags).catch(() => {
    // Silently fail — local is the source of truth
  });
}
