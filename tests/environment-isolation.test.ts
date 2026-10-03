import { describe, expect, test, mock } from "bun:test";
import { withScopedEnv, withIsolatedKey } from "./helpers/test-env-harness";

describe("Phase 4: Test Environment Isolation and Hardening", () => {
  test("withScopedEnv restores environment variables on success and on error", async () => {
    process.env.TYPESAFE_API_KEY = "initial_key";
    process.env.TYPESAFE_CUSTOM_VAR = "initial_custom";

    await withScopedEnv(
      { TYPESAFE_API_KEY: "scoped_key", TYPESAFE_CUSTOM_VAR: "scoped_custom" },
      async () => {
        expect(process.env.TYPESAFE_API_KEY).toBe("scoped_key");
        expect(process.env.TYPESAFE_CUSTOM_VAR).toBe("scoped_custom");
      }
    );

    expect(process.env.TYPESAFE_API_KEY).toBe("initial_key");
    expect(process.env.TYPESAFE_CUSTOM_VAR).toBe("initial_custom");

    // Check error case
    await expect(
      withScopedEnv({ TYPESAFE_API_KEY: "error_key" }, async () => {
        expect(process.env.TYPESAFE_API_KEY).toBe("error_key");
        throw new Error("Simulated failure inside test");
      })
    ).rejects.toThrow("Simulated failure inside test");

    // Post-failure check: env must be restored!
    expect(process.env.TYPESAFE_API_KEY).toBe("initial_key");
  });

  test("withScopedEnv restores globalThis.fetch on exit even on exceptions", async () => {
    const originalFetch = globalThis.fetch;
    const mockCustomFetch = mock(async () => new Response("custom mock"));

    await expect(
      withScopedEnv({}, async () => {
        globalThis.fetch = mockCustomFetch as unknown as typeof fetch;
        expect(globalThis.fetch).toBe(mockCustomFetch as unknown as typeof fetch);
        throw new Error("Fetch failure test");
      })
    ).rejects.toThrow("Fetch failure test");

    expect(globalThis.fetch).toBe(originalFetch);
  });

  test("withIsolatedKey sets key, runs callback, and cleans up completely", async () => {
    process.env.TYPESAFE_API_KEY = "base_key";

    await withIsolatedKey("temporary_isolated_key", async () => {
      expect(process.env.TYPESAFE_API_KEY).toBe("temporary_isolated_key");
    });

    expect(process.env.TYPESAFE_API_KEY).toBe("base_key");

    delete process.env.TYPESAFE_API_KEY;
    await withIsolatedKey("another_isolated_key", async () => {
      expect(process.env.TYPESAFE_API_KEY).toBe("another_isolated_key");
    });

    expect(process.env.TYPESAFE_API_KEY).toBeUndefined();
  });
});
