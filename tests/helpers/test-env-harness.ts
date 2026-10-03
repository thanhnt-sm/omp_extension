/**
 * Test Environment Isolation Harness
 * Eliminates cross-suite test pollution by safely managing process.env and globalThis.fetch.
 */

export type EnvOverrides = Record<string, string | undefined>;

/**
 * Executes an asynchronous or synchronous function within an isolated environment scope.
 * Automatically takes a snapshot of globalThis.fetch and specified environment variables,
 * applies overrides, and deterministically restores previous state in a finally block.
 */
export async function withScopedEnv<T>(
  overrides: EnvOverrides,
  fn: () => Promise<T> | T
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const envSnapshot: Record<string, string | undefined> = {};

  // Snapshot all variables that will be modified
  for (const key of Object.keys(overrides)) {
    envSnapshot[key] = process.env[key];
  }

  // Also snapshot all existing TYPESAFE_* variables to guard against implicit leaks
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("TYPESAFE_") && !(key in envSnapshot)) {
      envSnapshot[key] = process.env[key];
    }
  }

  // Apply overrides
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    // Restore globalThis.fetch
    globalThis.fetch = originalFetch;

    // Restore environment variables
    for (const [key, originalValue] of Object.entries(envSnapshot)) {
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
  }
}

/**
 * Creates a scoped environment snapshot and applies overrides.
 * Returns a restore function suitable for beforeEach / afterEach lifecycles.
 */
export function createEnvScope(
  overrides: EnvOverrides = { TYPESAFE_API_KEY: "test_key" }
): () => void {
  const originalFetch = globalThis.fetch;
  const envSnapshot: Record<string, string | undefined> = {};

  for (const key of Object.keys(overrides)) {
    envSnapshot[key] = process.env[key];
  }

  for (const key of Object.keys(process.env)) {
    if (key.startsWith("TYPESAFE_") && !(key in envSnapshot)) {
      envSnapshot[key] = process.env[key];
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    globalThis.fetch = originalFetch;
    for (const [key, originalValue] of Object.entries(envSnapshot)) {
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
  };
}

/**
 * Convenience helper to isolate TYPESAFE_API_KEY mutations during testing.
 */
export async function withIsolatedKey<T>(
  key: string | undefined,
  fn: () => Promise<T> | T
): Promise<T> {
  return withScopedEnv({ TYPESAFE_API_KEY: key }, fn);
}
