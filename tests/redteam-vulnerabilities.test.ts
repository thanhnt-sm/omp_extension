import { describe, expect, test, beforeEach } from "bun:test";
import registerExtension from "../typesafe-planner";
import { runTaskMicroCheck } from "../src/cook-expert-judge";
import { withScopedEnv } from "./helpers/test-env-harness";
import type { MicroCheckEvidence } from "../src/cook-expert-judge";
interface SentMessage {
  customType?: string;
  content: string;
  display?: boolean;
}
interface MockEvent {
  tool?: string;
  name?: string;
  toolName?: string;
  params?: Record<string, unknown>;
  args?: Record<string, unknown>;
  input?: Record<string, unknown>;
  cancel?: (reason: string) => void;
}
type EventHandler = (event: unknown, ctx: unknown) => Promise<void> | void;
interface RegisteredToolDef {
  name: string;
  label?: string;
  description: string;
  parameters: unknown;
  execute: (
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: unknown,
    ctx?: unknown
  ) => Promise<{ content: Array<{ type: string; text: string }>; details?: unknown }>;
}
describe("Red-Team Vulnerabilities & EGC Harmonization (7 Attack Vectors)", () => {
  let toolEventHandlers: Record<string, EventHandler[]>;
  let sentMessages: SentMessage[];
  let registeredTools: Record<string, RegisteredToolDef>;
  beforeEach(() => {
    toolEventHandlers = {};
    sentMessages = [];
    registeredTools = {};
    const dummyZodMethod = () => ({ optional: () => "val", min: () => "val" });
    const mockPi = {
      zod: {
        object: (x: unknown) => x,
        union: (x: unknown) => x,
        string: dummyZodMethod,
        number: dummyZodMethod,
        record: (x: unknown) => x,
        enum: (x: unknown) => x,
        unknown: dummyZodMethod,
        array: (x: unknown) => ({ min: () => x, optional: () => x }),
      },
      on: (event: string, handler: EventHandler) => {
        if (!toolEventHandlers[event]) toolEventHandlers[event] = [];
        toolEventHandlers[event].push(handler);
      },
      sendMessage: async (msg: SentMessage) => {
        sentMessages.push(msg);
      },
      registerTool: (def: RegisteredToolDef) => {
        registeredTools[def.name] = def;
      },
      updateTool: () => {},
      removeTool: () => {},
    };
    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
  });
  const fireToolCall = async (evt: MockEvent, ctx: Record<string, unknown> = { cwd: process.cwd() }) => {
    const handlers = toolEventHandlers["tool_call"] || [];
    for (const h of handlers) {
      await h(evt, ctx);
    }
  };
  test("Vector 1: Batch ops { ops: [{ op: 'done' }] } must trigger verification gate interception", async () => {
    let canceled = false;
    const cancelMock = (_reason: string) => {
      canceled = true;
    };
    try {
      await fireToolCall({
        tool: "todo",
        params: {
          ops: [{ op: "done", task: "batch task" }],
          testCommand: "echo ok",
        },
        cancel: cancelMock,
      });
    } catch {
      canceled = true;
    }
    expect(canceled).toBe(true);
  });
  test("Vector 2: Mutative ops (drop, init, start, append) cannot bypass gate unmonitored", async () => {
    const mutativeOps = ["drop", "init", "start", "append"];
    for (const op of mutativeOps) {
      let intercepted = false;
      const cancelMock = () => {
        intercepted = true;
      };
      try {
        await fireToolCall({
          tool: "todo",
          params: { op, task: `test-${op}`, testCommand: "echo ok" },
          cancel: cancelMock,
        });
      } catch {
        intercepted = true;
      }
      expect(intercepted).toBe(true);
    }
  });
  test("Vector 3: Absence of git diff and test output triggers zero-evidence rejection", async () => {
    const zeroEvidence: MicroCheckEvidence = {
      gitStatus: "",
      gitDiff: "",
      testExitCode: null,
      testOutput: "",
      cleanWorkingTree: true,
    };
    const microResult = await runTaskMicroCheck(zeroEvidence);
    expect(microResult.passed).toBe(false);
    expect(microResult.reasons.some((r) => r.toLowerCase().includes("evidence"))).toBe(true);
  });
  test("Vector 4: Diff summarizer retains full function implementation up to 28KB boundary", async () => {
    const implementationLines = Array.from(
      { length: 200 },
      (_, i) => `+    const stepResult_${i} = executePipelineStep(${i});`
    );
    const largeDiff = [
      "diff --git a/src/core.ts b/src/core.ts",
      "--- a/src/core.ts",
      "+++ b/src/core.ts",
      "@@ -1,5 +1,210 @@",
      "+  export function executeCorePipeline() {",
      ...implementationLines,
      "+    return { status: 'success', verified: true };",
      "+  }",
    ].join("\n");
    expect(largeDiff.length).toBeGreaterThan(8000);
    expect(largeDiff.length).toBeLessThan(28000);
    let observedDiffInPayload = "";
    await withScopedEnv({ TYPESAFE_API_KEY: "test_key_for_diff_preservation" }, async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        if (init && init.body && typeof init.body === "string") {
          try {
            const body = JSON.parse(init.body) as Record<string, unknown>;
            if (body.state) {
              const stateObj =
                typeof body.state === "string"
                  ? (JSON.parse(body.state) as Record<string, unknown>)
                  : (body.state as Record<string, unknown>);
              observedDiffInPayload = (stateObj.unified_diff || stateObj.diff || "") as string;
            }
          } catch {}
        }
        return new Response(
          JSON.stringify({
            answers: {
              architectural_drift_guard: { choice: "no_drift" },
            },
          }),
          { status: 200 }
        );
      }) as typeof globalThis.fetch;
      try {
        await registeredTools.typesafe_expert_review.execute("call-diff-test", {
          role: "drift_guard",
          context: { unified_diff: largeDiff },
          criteria: ["Implement pipeline"],
        });
      } catch {
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
    expect(observedDiffInPayload).toContain("return { status: 'success', verified: true };");
    expect(observedDiffInPayload).not.toContain("diff truncated");
  });
  test("Vector 5: Agent cannot self-grant allowJudgeModification: true in tool parameters", async () => {
    let blocked = false;
    try {
      await fireToolCall({
        tool: "edit",
        params: {
          path: "typesafe-planner.ts",
          allowJudgeModification: true, // Malicious self-grant
        },
        cancel: (_reason: string) => {
          blocked = true;
        },
      });
    } catch {
      blocked = true;
    }
    expect(blocked).toBe(true);
  });
  test("Vector 6: typesafe-planner yields todo handling cleanly when EGC extension is active", async () => {
    let canceled = false;
    await withScopedEnv({ EGC_ACTIVE: "1" }, async () => {
      try {
        await fireToolCall({
          tool: "todo",
          params: { op: "done", task: "harmonized task" },
          cancel: (_reason: string) => {
            canceled = true;
          },
        });
      } catch {
        canceled = true;
      }
    });
    expect(canceled).toBe(false);
  });
  test("Vector 7: Repeated failed verification attempts trigger stall ratchet escalation", async () => {
    let ratchetTriggered = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await fireToolCall({
          tool: "todo",
          params: { op: "done", task: "stalled-task-v7", testCommand: "echo ok" },
          cancel: (reason: string) => {
            if (reason.toLowerCase().includes("stall ratchet") || reason.toLowerCase().includes("consecutive")) {
              ratchetTriggered = true;
            }
          },
        });
      } catch (err: unknown) {
        if (err instanceof Error) {
          const msg = err.message.toLowerCase();
          if (msg.includes("stall ratchet") || msg.includes("consecutive")) {
            ratchetTriggered = true;
          }
        }
      }
    }
    expect(ratchetTriggered).toBe(true);
  });
});