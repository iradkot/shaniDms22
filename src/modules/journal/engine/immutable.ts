const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const deepFreeze = <T>(value: T): T => {
  if (!isObject(value) || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value).forEach(child => deepFreeze(child));
  return Object.freeze(value);
};

export const immutableJsonClone = <T>(value: T): T =>
  deepFreeze(JSON.parse(JSON.stringify(value)) as T);
