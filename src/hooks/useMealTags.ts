/**
 * React hook for meal tagging.
 *
 * Provides:
 * - Tag read/write for individual meals
 * - Batch tag lookup for a list of meals
 * - Autocomplete suggestions
 * - All known tags for filtering
 */
import {useCallback, useEffect, useRef, useState} from 'react';
import type {MealTag, MealTagMap, TagRegistryEntry} from 'app/types/mealTag.types';
import {
  getTagsForMeals,
  tagMealAndSync,
  getTagSuggestions,
  getAllKnownTags,
} from 'app/services/mealTagService';

export interface UseMealTagsResult {
  /** Map of mealId → tags for the current set of meal IDs. */
  tagMap: MealTagMap;
  /** All known tags (for filter chips). */
  knownTags: TagRegistryEntry[];
  /** Autocomplete suggestions (most popular). */
  suggestions: string[];
  /** Tag a meal (saves locally + syncs to NS). Refreshes tagMap. */
  tagMeal: (mealId: string, tags: MealTag[]) => Promise<void>;
  /** Refresh tags for the current meal IDs. */
  refreshTags: () => void;
  /** Whether the initial load is still pending. */
  isLoading: boolean;
}

/**
 * Load and manage tags for a set of meal IDs.
 * @param mealIds - Array of treatment/meal IDs to load tags for.
 */
export function useMealTags(mealIds: string[]): UseMealTagsResult {
  const [tagMap, setTagMap] = useState<MealTagMap>({});
  const [knownTags, setKnownTags] = useState<TagRegistryEntry[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Track the latest mealIds to avoid stale closures
  const mealIdsRef = useRef(mealIds);
  mealIdsRef.current = mealIds;

  const load = useCallback(async () => {
    try {
      const [map, sugg, known] = await Promise.all([
        getTagsForMeals(mealIdsRef.current),
        getTagSuggestions(30),
        getAllKnownTags(),
      ]);
      setTagMap(map);
      setSuggestions(sugg);
      setKnownTags(known);
    } catch (err) {
      console.warn('useMealTags: load failed', err);
    } finally {
      setIsLoading(false);
    }
  }, []); // stable — reads mealIdsRef

  // Reload whenever mealIds change
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Stringify to trigger only when the ID list actually changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    mealIds.join(','),
    load,
  ]);

  const tagMeal = useCallback(
    async (mealId: string, tags: MealTag[]) => {
      await tagMealAndSync(mealId, tags);
      // Refresh
      await load();
    },
    [load],
  );

  return {
    tagMap,
    knownTags,
    suggestions,
    tagMeal,
    refreshTags: load,
    isLoading,
  };
}
