const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export type ParsedVersion = readonly [number, number, number];

export const parseVersion = (value: string): ParsedVersion | undefined => {
  const match = VERSION_PATTERN.exec(value);
  if (!match) {
    return undefined;
  }
  const parsed = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  return parsed.every(Number.isSafeInteger) ? parsed : undefined;
};

export const compareVersions = (left: string, right: string): number => {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);
  if (!leftVersion || !rightVersion) {
    throw new Error('Expected strict major.minor.patch versions.');
  }
  for (let index = 0; index < leftVersion.length; index += 1) {
    const difference = leftVersion[index]! - rightVersion[index]!;
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
};

export const majorVersion = (version: string): number => {
  const parsed = parseVersion(version);
  if (!parsed) {
    throw new Error('Expected a strict major.minor.patch version.');
  }
  return parsed[0];
};
