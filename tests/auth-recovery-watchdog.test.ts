import { describe, expect, test, mock } from "bun:test";
import registerExtension from "../typesafe-planner";
import { withScopedEnv } from "./helpers/test-env-harness";

interface SentMessage {
  customType?: string;
  content: string;
  display?: boolean;
}

interface ToolDefinition {
  name: string;
  execute: (
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: unknown,
    ctx?: unknown
  ) => Promise<{ content: Array<{ type: "text"; text: string }>; details?: unknown }>;
}

describe("Phase 2: Dynamic Auth Recovery and Key Watchdog", () => {
  test("401 sets lastFailedKeyHash and subsequent call with same key fails fast without fetch", async () => {
    const registeredTools = new Map<string, ToolDefinition>();
    const sentMessages: SentMessage[] = [];

    const mockPi = {
      zod: {
        object: (x: unknown) => x,
        union: (x: unknown) => x,
        string: () => ({ optional: () => "string", min: () => "string" }),
        number: () => ({ optional: () => "number" }),
        record: (x: unknown) => x,
        enum: (x: unknown) => x,
        unknown: () => ({ optional: () => "unknown" }),
        array: (x: unknown) => ({ min: () => x, optional: () => x }),
      },
      on: () => {},
      sendMessage: async (msg: SentMessage) => {
        sentMessages.push(msg);
      },
      registerTool: (def: ToolDefinition) => {
        registeredTools.set(def.name, def);
      },
    };

    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    const judgeTool = registeredTools.get("typesafe_judge");
    expect(judgeTool).toBeDefined();

    await withScopedEnv({ TYPESAFE_API_KEY: "test_bad_key_1" }, async () => {
      let fetchCallCount = 0;

      globalThis.fetch = mock(async () => {
        fetchCallCount++;
        return new Response("Unauthorized", { status: 401 });
      }) as unknown as typeof fetch;

      const params = {
        state: "test state",
        questions: {
          q1: {
            type: "noul",
            instructions: "Is this valid?",
          },
        },
      };

      // First call -> reaches upstream, returns 401 unauthorized
      const result1 = await judgeTool!.execute("call1", params, undefined, undefined, { cwd: process.cwd() });
      expect(result1.content[0].text).toBe("TypeSafe error: unauthorized");
      expect(fetchCallCount).toBe(1);

      // Verify operator warning was sent with display: true
      const authAlert = sentMessages.find((m) => m.customType === "typesafe-auth-recovery" || m.display === true);
      expect(authAlert).toBeDefined();
      expect(authAlert?.display).toBe(true);

      // Second call with SAME bad key -> should fail fast without calling fetch
      const result2 = await judgeTool!.execute("call2", params, undefined, undefined, { cwd: process.cwd() });
      expect(result2.content[0].text).toBe("TypeSafe disabled");
      expect(fetchCallCount).toBe(1); // No new network call!

      // Step 2: Key rotation! Simulate environment variable update to a new valid key
      process.env.TYPESAFE_API_KEY = "test_new_valid_key_2";
      globalThis.fetch = mock(async () => {
        fetchCallCount++;
        return new Response(JSON.stringify({
          answers: {
            q1: { noul: 0.95 },
          },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }) as unknown as typeof fetch;

      // Third call with NEW key -> should self-heal and dispatch to upstream!
      const result3 = await judgeTool!.execute("call3", params, undefined, undefined, { cwd: process.cwd() });
      expect(fetchCallCount).toBe(2); // Fetched again!
      expect(result3.content[0].text).not.toBe("TypeSafe disabled");
      expect(result3.content[0].text).toContain("0.95");
    });
  });
});
