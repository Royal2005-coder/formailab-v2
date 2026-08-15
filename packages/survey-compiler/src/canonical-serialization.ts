/**
 * Serializes JSON-compatible data deterministically.
 *
 * Object keys are sorted at every depth while array order remains significant.
 * This module intentionally has no Node.js dependencies so it can be used by
 * browser import and preview flows.
 */
export const canonicalSerialize = (value: unknown): string => {
  const serialized = JSON.stringify(value, (_key, nestedValue: unknown) => {
    if (nestedValue === null || typeof nestedValue !== "object" || Array.isArray(nestedValue)) {
      return nestedValue;
    }

    return Object.fromEntries(
      Object.keys(nestedValue)
        .sort()
        .map((key) => [key, (nestedValue as Record<string, unknown>)[key]])
    );
  });

  if (serialized === undefined) {
    throw new TypeError("Canonical serialization requires a JSON-compatible value");
  }

  return serialized;
};
