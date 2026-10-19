/** Classifies persistent subject tokens so they stay raw; other input is an API_SECRET. */
export const normalizeNightscoutAccessToken = (raw: string): string | null => {
  const value = raw.trim().replace(/^token=/, '');
  return /^[a-z0-9_-]{1,96}-[a-f0-9]{16,64}$/i.test(value) ? value : null;
};
