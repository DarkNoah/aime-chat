const invalidQuery = (name: string, expected: string): never => {
  throw Object.assign(new Error(`${name} must be ${expected}`), {
    status: 400,
  });
};

export const queryString = (
  value: unknown,
  name: string,
  required = false,
): string | undefined => {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || (required && !value.trim())) {
    return invalidQuery(name, 'a non-empty string');
  }
  return value;
};

export const queryInteger = (
  value: unknown,
  name: string,
  minimum: number,
): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return invalidQuery(name, `an integer >= ${minimum}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    return invalidQuery(name, `an integer >= ${minimum}`);
  }
  return parsed;
};
