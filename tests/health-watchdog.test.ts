import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import registerExtension from "../typesafe-planner";
import { withScopedEnv } from "./helpers/test-env-harness";
const { resetRateLimitState } = createRequire(import.meta.url)("../src/typesafe-api-client.cjs") as {
  resetRateLimitState: () => void;
};
interface SentMessage {
  customType?: string;
  content: string;
  display?: boolean;
}

interface MessageOptions {
  deliverAs?: string;
}


describe("Phase 3: Session Pre-Flight Health Probe", () => {
  let fixtureHome: string;

  function registerHealthExtension(pi: Parameters<typeof registerExtension>[0]) {
    return registerExtension(pi, {
      homeDir: fixtureHome,
    });
  }

  beforeEach(async () => {
    resetRateLimitState();
    fixtureHome = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-health-home-"));
    await fs.mkdir(path.join(fixtureHome, ".claude"), { recursive: true });
    await fs.writeFile(
      path.join(fixtureHome, ".claude", ".ck.json"),
      JSON.stringify({ typesafe: { projects: ["*", process.cwd()], excludeProjects: [] } }),
      "utf8"
    );
  });

  afterEach(async () => {
    await fs.rm(fixtureHome, { recursive: true, force: true });
  });

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

    registerHealthExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
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

  test("session startup emits one safe cached runtime origin proof before optional API probing", async () => {
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
        if (event === "session_start") sessionStartHandler = handler;
      },
      sendMessage: async (msg: SentMessage, _opts?: MessageOptions) => {
        sentMessages.push(msg);
      },
      registerTool: () => {},
    };

    registerHealthExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    await withScopedEnv({ TYPESAFE_API_KEY: undefined }, async () => {
      await sessionStartHandler!({}, { cwd: process.cwd() });
      await sessionStartHandler!({}, { cwd: process.cwd() });
    });

    const originMessages = sentMessages.filter((message) => {
      if (message.customType !== "typesafe-health") return false;
      try {
        const content = JSON.parse(message.content);
        return (
          content !== null &&
          typeof content === "object" &&
          "kind" in content &&
          content.kind === "runtime-origin"
        );
      } catch {
        return false;
      }
    });
    expect(originMessages).toHaveLength(1);
    expect(originMessages[0].display).toBe(false);
    const entrypointDigest = createHash("sha256")
      .update(await fs.readFile(path.resolve(import.meta.dir, "../typesafe-planner.ts")))
      .digest("hex");
    const bundledDigests = await Promise.all(
      [
        "typesafe-enabled-resolver.cjs",
        "typesafe-redact.cjs",
        "typesafe-api-client.cjs",
        "typesafe-policy-client.cjs",
      ].map(async (moduleName) =>
        createHash("sha256")
          .update(await fs.readFile(path.resolve(import.meta.dir, "../src", moduleName)))
          .digest("hex")
      )
    );
    expect(originMessages[0].content).not.toContain("valid_test_key");
    expect(JSON.parse(originMessages[0].content)).toEqual({
      kind: "runtime-origin",
      algorithm: "sha256",
      entrypoint: {
        origin: expect.stringMatching(/^file:/),
        sha256: entrypointDigest,
      },
      bundledModules: [
        {
          origin: expect.stringMatching(/typesafe-enabled-resolver\.cjs$/),
          sha256: bundledDigests[0],
        },
        {
          origin: expect.stringMatching(/typesafe-redact\.cjs$/),
          sha256: bundledDigests[1],
        },
        {
          origin: expect.stringMatching(/typesafe-api-client\.cjs$/),
          sha256: bundledDigests[2],
        },
        {
          origin: expect.stringMatching(/typesafe-policy-client\.cjs$/),
          sha256: bundledDigests[3],
        },
      ],
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

    registerHealthExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
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

    registerHealthExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
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

    registerHealthExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
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
  test("False-Positive Warning Suppression: 200 OK probe suppresses unreachable warning on IPC rejection", async () => {
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
        if (event === "session_start") sessionStartHandler = handler;
      },
      sendMessage: async (msg: SentMessage, opts?: MessageOptions) => {
        if (opts?.deliverAs === "nextTurn") {
          throw new Error("IPC rejection on nextTurn");
        }
        sentMessages.push(msg);
      },
      registerTool: () => {},
    };

    registerHealthExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    await withScopedEnv({ TYPESAFE_API_KEY: "valid_key" }, async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ answers: { ping: { noul: 1.0 } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof fetch;

      await expect(sessionStartHandler!({}, { cwd: process.cwd() })).resolves.toBeUndefined();

      const onlineMsg = sentMessages.find((m) => m.content.includes("TypeSafe: ONLINE (jev-latest)"));
      const unreachableMsg = sentMessages.find((m) => m.content.includes("TypeSafe API unreachable"));

      expect(onlineMsg).toBeDefined();
      expect(unreachableMsg).toBeUndefined();
    });
  });
});
