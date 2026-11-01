import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import registerExtension from "../typesafe-planner";
import { withScopedEnv } from "./helpers/test-env-harness";

describe("Phase 2 Client Integration: evaluateDebate on extension judge client", () => {
  test("createExtensionJudgeClient implements evaluateDebate method", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-debate-home-"));
    await fs.mkdir(path.join(home, ".omp", "agent"), { recursive: true });
    await fs.writeFile(
      path.join(home, ".omp", "agent", "typesafe.json"),
      JSON.stringify({ typesafe: { projects: ["*", process.cwd()], excludeProjects: [] } }),
      "utf8"
    );
    let capturedTool: { name: string; execute: Function } | undefined;
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
      sendMessage: async () => {},
      registerTool: (def: { name: string; execute: Function }) => {
        if (def.name === "typesafe_elevate_plan") {
          capturedTool = def;
        }
      },
    };

    try {
      await withScopedEnv({ TYPESAFE_API_KEY: "client-debate-fixture-credential" }, async () => {
        registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0], { homeDir: home });
        expect(capturedTool).toBeDefined();

        const questionSets: string[][] = [];
        globalThis.fetch = (async (_url: unknown, options?: { body?: unknown }) => {
          const body = JSON.parse(String(options?.body)) as {
            questions: Record<string, { type: string; criteria?: unknown }>;
          };
          questionSets.push(Object.keys(body.questions));
          const answers = Object.fromEntries(Object.entries(body.questions).map(([key, question]) => {
            if (question.type === "noul") return [key, { noul: 0.95 }];
            if (question.type === "score") {
              const levels = Array.isArray(question.criteria) ? question.criteria.length : 4;
              return [key, { score: Math.min(2.5, levels - 1), confidence: 0.9 }];
            }
            const options = Object.keys((question.criteria ?? {}) as Record<string, unknown>);
            return [key, { choice: options.includes("HOLD") ? "HOLD" : options[0], confidence: 0.9 }];
          }));
          return new Response(JSON.stringify({ answers }), { status: 200 });
        }) as typeof fetch;

        // An approved plan evaluation is what dispatches the independent debate through the bound client.
        const res = await capturedTool!.execute("call-debate", {
          planTitle: "Secure Plan",
          planContent: "1. Implement token validation in src/auth.ts with expired-token rejection.\nVerification: bun test tests/auth.test.ts",
        });

        const parsed = JSON.parse(res.content[0].text);
        expect(parsed.debate).toBeDefined();
        expect(parsed.debate.status).toBe("approved");
        expect(parsed.debate.approved).toBe(true);
        expect(parsed.debate.modelTier).toBeDefined();
        expect(questionSets.some((keys) => keys.includes("devils_advocate"))).toBe(true);
      });
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });

  test("an unapproved plan reports an undispatched debate in the DebateResult shape with zero egress", async () => {
    let capturedTool: { name: string; execute: Function } | undefined;
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
      sendMessage: async () => {},
      registerTool: (def: { name: string; execute: Function }) => {
        if (def.name === "typesafe_elevate_plan") capturedTool = def;
      },
    };
    await withScopedEnv({ TYPESAFE_API_KEY: undefined }, async () => {
      registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
      let fetchCalls = 0;
      globalThis.fetch = (async () => { fetchCalls++; return new Response("{}", { status: 200 }); }) as typeof fetch;
      const res = await capturedTool!.execute("call-debate-undispatched", {
        planTitle: "Secure Plan",
        planContent: "1. Step 1: Securely update auth in src/auth.ts\nVerification: bun test",
      });
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.approved).toBe(false);
      expect(parsed.debate.approved).toBe(false);
      expect(parsed.debate.status).toBe("unavailable");
      expect(parsed.debate.advisoryOnly).toBe(true);
      expect(typeof parsed.debate.modelTier).toBe("string");
      expect(parsed.debate.requestedModel).toBe(parsed.debate.modelTier);
      expect(fetchCalls).toBe(0);
    });
  });
});
