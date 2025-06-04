export function assert(condition: unknown, message = 'Assertion failed') {
  if (!condition) throw new Error(message);
}

export function assertEquals<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected && JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
