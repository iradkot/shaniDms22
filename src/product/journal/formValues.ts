const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/;

const twoDigits = (value: number): string => String(value).padStart(2, '0');

/**
 * Stable, platform-neutral minute format used by the Journal forms.
 * It deliberately represents local wall-clock time; no timezone is discarded
 * behind the product Interface.
 */
export const formatJournalDateTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(
    date.getDate(),
  )} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
};

/** Returns undefined for malformed or impossible local dates. */
export const parseJournalDateTime = (value: string): number | undefined => {
  const match = DATE_TIME_PATTERN.exec(value.trim());
  if (match === null) {
    return undefined;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  const timestamp = date.getTime();
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp <= 0 ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return undefined;
  }
  return timestamp;
};

/** Comma/newline separated tags, trimmed and de-duplicated case-insensitively. */
export const parseJournalTags = (value: string): readonly string[] => {
  const seen = new Set<string>();
  const tags: string[] = [];
  value.split(/[,\n]/).forEach(part => {
    const tag = part.trim();
    const canonical = tag.toLocaleLowerCase();
    if (tag.length === 0 || seen.has(canonical)) {
      return;
    }
    seen.add(canonical);
    tags.push(tag);
  });
  return tags;
};

export const formatJournalTags = (tags: readonly string[]): string =>
  tags.join(', ');

export const sameJournalTags = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);
