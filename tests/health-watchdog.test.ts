import { describe, expect, test, mock } from "bun:test";
import registerExtension from "../typesafe-planner";
import { withScopedEnv } from "./helpers/test-env-harness";
interface SentMessage {
  customType?: string;
  content: string;
  display?: boolean;
}

interface MessageOptions {
  deliverAs?: string;
}

describe("Phase 3: Session Pre-Flight Health Probe", () => {
  test("Successful probe on session_start emits ONLINE status", async () => {
    let sessionStartHandler: ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
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
      on: (event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) => {
        if (event === "session_start") {
          sessionStartHandler = handler;
        }
      },
      sendMessage: async (msg: SentMessage, _opts?: MessageOptions) => {
        sentMessages.push(msg);
      },
      registerTool: () => {},
    };

    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    expect(sessionStartHandler).toBeDefined();
    await withScopedEnv({ TYPESAFE_API_KEY: "valid_test_key" }, async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({
          answers: { ping: { noul: 1.0 } },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }) as unknown as typeof fetch;

      await sessionStartHandler!({}, { cwd: process.cwd() });

      const onlineMessage = sentMessages.find(
        (m) => m.content.includes("TypeSafe: ONLINE (jev-latest)")
      );
      expect(onlineMessage).toBeDefined();
      expect(onlineMessage?.display).toBe(true);
    });
  });

  test("401 probe failure on session_start emits auth warning with display: true", async () => {
    let sessionStartHandler: ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
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
      on: (event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) => {
        if (event === "session_start") {
          sessionStartHandler = handler;
        }
      },
      sendMessage: async (msg: SentMessage, _opts?: MessageOptions) => {
        sentMessages.push(msg);
      },
      registerTool: () => {},
    };

    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    await withScopedEnv({ TYPESAFE_API_KEY: "revoked_key" }, async () => {
      globalThis.fetch = mock(async () => {
        return new Response("Unauthorized", { status: 401 });
      }) as unknown as typeof fetch;

      await sessionStartHandler!({}, { cwd: process.cwd() });

      const warning = sentMessages.find(
        (m) => m.content.includes("TYPESAFE_API_KEY is invalid or expired")
      );
      expect(warning).toBeDefined();
      expect(warning?.display).toBe(true);
    });
  });

  test("404 probe failure emits routing warning pointing to models.yml", async () => {
    let sessionStartHandler: ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
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
      on: (event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) => {
        if (event === "session_start") {
          sessionStartHandler = handler;
        }
      },
      sendMessage: async (msg: SentMessage, _opts?: MessageOptions) => {
        sentMessages.push(msg);
      },
      registerTool: () => {},
    };

    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    await withScopedEnv({ TYPESAFE_API_KEY: "valid_key" }, async () => {
      globalThis.fetch = mock(async () => {
        return new Response("Not Found", { status: 404 });
      }) as unknown as typeof fetch;

      await sessionStartHandler!({}, { cwd: process.cwd() });

      const warning = sentMessages.find(
        (m) => m.content.includes("models.yml baseUrl")
      );
      expect(warning).toBeDefined();
      expect(warning?.display).toBe(true);
    });
  });

  test("Network error / timeout aborts within deadline without crashing", async () => {
    let sessionStartHandler: ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
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
      on: (event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) => {
        if (event === "session_start") {
          sessionStartHandler = handler;
        }
      },
      sendMessage: async (msg: SentMessage, _opts?: MessageOptions) => {
        sentMessages.push(msg);
      },
      registerTool: () => {},
    };

    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    await withScopedEnv({ TYPESAFE_API_KEY: "valid_key" }, async () => {
      globalThis.fetch = mock(async () => {
        throw new Error("Failed to fetch");
      }) as unknown as typeof fetch;

      await expect(sessionStartHandler!({}, { cwd: process.cwd() })).resolves.toBeUndefined();

      const warning = sentMessages.find(
        (m) => m.content.includes("TypeSafe API unreachable")
      );
      expect(warning).toBeDefined();
      expect(warning?.display).toBe(true);
    });
  });
});
