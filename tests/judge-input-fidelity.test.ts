import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import registerExtension, { sanitizeStateForTypeSafe, resetLastCheckpoint } from "../typesafe-planner";
import { runPhaseMacroCheck, runTaskMicroCheck } from "../src/cook-expert-judge";

interface MockPiMessage {
  customType?: string;
  content?: string;
  display?: boolean;
}

interface MockPiInstance {
  tools: Record<string, unknown>;
  handlers: Record<string, Array<(event: unknown, ctx: unknown) => Promise<void>>>;
  messages: MockPiMessage[];
  mockPi: {
    zod: unknown;
    registerTool: (def: { name: string }) => void;
    on: (event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) => void;
    sendMessage: (msg: MockPiMessage) => Promise<void>;
  };
}

function createZodMock() {
  const schema = {
    safeParse: (val: unknown) => {
      if (val && typeof val === "object") {
        return { success: true, data: val };
      }
      return { success: false, error: new Error("Invalid") };
    },
    optional: () => schema,
    default: () => schema,
    describe: () => schema,
  };

  return {
    object: () => schema,
    union: () => schema,
    string: () => schema,
    number: () => schema,
    boolean: () => schema,
    record: () => schema,
    enum: (vals: string[]) => ({
      ...schema,
      safeParse: (val: unknown) => {
        return typeof val === "string" && vals.includes(val)
          ? { success: true, data: val }
          : { success: false, error: new Error("Enum mismatch") };
      },
    }),
    unknown: () => schema,
    array: () => ({
      ...schema,
      min: () => schema,
    }),
  };
}

function createMockPi(): MockPiInstance {
  const tools: Record<string, unknown> = {};
  const handlers: Record<string, Array<(event: unknown, ctx: unknown) => Promise<void>>> = {};
  const messages: MockPiMessage[] = [];

  const mockPi = {
    zod: createZodMock(),
    registerTool(def: { name: string }) {
      tools[def.name] = def;
    },
    on(event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    async sendMessage(msg: MockPiMessage) {
      messages.push(msg);
    },
  };

  return { tools, handlers, messages, mockPi };
}

describe("Judge Input Fidelity", () => {
  const originalFetch = globalThis.fetch;
  let tempRepo: string;
  let capturedState: Record<string, unknown> | null = null;
  let capturedBodyStr = "";

  beforeEach(() => {
    tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), "typesafe-judge-fidelity-"));
    execSync("git init", { cwd: tempRepo, stdio: "ignore" });
    execSync('git config user.name "Test"', { cwd: tempRepo, stdio: "ignore" });
    execSync('git config user.email "test@example.com"', { cwd: tempRepo, stdio: "ignore" });
    resetLastCheckpoint();
    capturedState = null;
    capturedBodyStr = "";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("systemone")) {
        if (init?.body) {
          capturedBodyStr = init.body as string;
          try {
            const parsed: unknown = JSON.parse(capturedBodyStr);
            if (parsed && typeof parsed === "object" && "state" in parsed) {
              const stateVal = parsed.state;
              if (stateVal && typeof stateVal === "object") {
                capturedState = stateVal as Record<string, unknown>;
              }
            }
            return {
              ok: true,
              status: 200,
              json: async () => ({
                answers: {
                  meets_criteria: { noul: 0.95 },
                  deliverables_verdict: { choice: "APPROVE", confidence: 0.9 },
                  architectural_drift: { choice: "no_drift", confidence: 0.9 },
                  scope_mode: { choice: "HOLD", confidence: 0.9 },
                },
              }),
            } as Response;
          } catch {}
        }
      }
      return originalFetch(url, init);
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    try {
      fs.rmSync(tempRepo, { recursive: true, force: true });
    } catch {}
  });

  test("Task-start baseline captures only diffs since start, diff_scope = task-baseline", async () => {
    const { handlers, mockPi } = createMockPi();
    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    const interceptor = handlers.tool_call?.[0];

    // Commit a.txt
    fs.writeFileSync(path.join(tempRepo, "a.txt"), "hello\n");
    execSync("git add a.txt && git commit -m 'initial'", { cwd: tempRepo, stdio: "ignore" });

    // Modify a.txt (pre-existing WIP)
    fs.writeFileSync(path.join(tempRepo, "a.txt"), "hello modified before start\n");

    // Start task "T"
    await interceptor?.(
      { tool: "todo", params: { op: "start", task: "T" } },
      { cwd: tempRepo }
    );

    // Create b.md
    fs.writeFileSync(path.join(tempRepo, "b.md"), "# Deliverable\n");

    // Complete task "T"
    await interceptor?.(
      { tool: "todo", params: { op: "done", task: "T" } },
      { cwd: tempRepo }
    );

    expect(capturedState).not.toBeNull();
    const diffSummary = typeof capturedState?.diff_summary === "string" ? capturedState.diff_summary : "";
    expect(diffSummary).toContain("b.md");
    expect(diffSummary).not.toContain("a.txt");
    const diffScope = typeof capturedState?.diff_scope === "string" ? capturedState.diff_scope : "";
    expect(diffScope).toContain("task-baseline");
  });

  test("No start and no prior checkpoint: diff_scope = full-working-tree", async () => {
    const { handlers, mockPi } = createMockPi();
    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    const interceptor = handlers.tool_call?.[0];

    fs.writeFileSync(path.join(tempRepo, "c.txt"), "some change\n");

    await interceptor?.(
      { tool: "todo", params: { op: "done", task: "T_nostart" } },
      { cwd: tempRepo }
    );

    expect(capturedState).not.toBeNull();
    const diffScope = typeof capturedState?.diff_scope === "string" ? capturedState.diff_scope : "";
    expect(diffScope).toContain("full-working-tree");
  });

  test("No testCommand provided outputs standard placeholder and skips command", async () => {
    const { handlers, mockPi } = createMockPi();
    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    const interceptor = handlers.tool_call?.[0];

    fs.writeFileSync(path.join(tempRepo, "doc.md"), "done\n");

    await interceptor?.(
      { tool: "todo", params: { op: "done", task: "T_notest" } },
      { cwd: tempRepo }
    );

    expect(capturedState).not.toBeNull();
    expect(String(capturedState?.test_summary)).toContain("No testCommand provided for this task; test evidence not collected.");
  });

  test("todo_task, user_request, and agent_work_log are populated from conversation", async () => {
    const { handlers, mockPi } = createMockPi();
    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    const interceptor = handlers.tool_call?.[0];

    fs.writeFileSync(path.join(tempRepo, "doc.md"), "done\n");

    const mockCtx = {
      cwd: tempRepo,
      sessionManager: {
        getBranch: () => [
          { type: "message", message: { role: "user", content: "please drop T or finish it" } },
          { type: "message", message: { role: "assistant", content: [{ type: "text", text: "I wrote b.md" }] } },
        ],
      },
    };

    await interceptor?.(
      { tool: "todo", params: { op: "done", task: "T_convo" } },
      mockCtx
    );

    expect(capturedState).not.toBeNull();
    expect(String(capturedState?.todo_task)).toContain("T_convo");
    const userReq = typeof capturedState?.user_request === "string" ? capturedState.user_request : "";
    expect(userReq).toContain("please drop T or finish it");
    const workLog = typeof capturedState?.agent_work_log === "string" ? capturedState.agent_work_log : "";
    expect(workLog).toContain("I wrote b.md");
  });

  test("Plan context separated when phase does not match task", async () => {
    const { handlers, mockPi } = createMockPi();
    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    const interceptor = handlers.tool_call?.[0];

    // Create a plan with checkboxes
    const plansDir = path.join(tempRepo, "plans", "261012-sample");
    fs.mkdirSync(plansDir, { recursive: true });
    fs.writeFileSync(path.join(plansDir, "plan.md"), "---\nstatus: pending\n---\n- [ ] Unrelated plan item\n");
    fs.writeFileSync(path.join(tempRepo, "touch.txt"), "touch\n");

    await interceptor?.(
      { tool: "todo", params: { op: "done", task: "Unmatched task item" } },
      { cwd: tempRepo }
    );

    expect(capturedState).not.toBeNull();
    const taskReqs = typeof capturedState?.task_requirements === "string" ? capturedState.task_requirements : "";
    expect(taskReqs).toContain("Unmatched task item");
    expect(capturedState?.plan_context).toBeDefined();
    const planCtx = String(capturedState?.plan_context || "");
    expect(planCtx).toContain("Unrelated plan item");
  });

  test("sanitizeStateForTypeSafe preserves closing XML tag on clamping", () => {
    const hugeInner = "A".repeat(8000);
    const inputState = {
      test_summary: `<test_summary>\n${hugeInner}\n</test_summary>`,
    };

    const sanitized = sanitizeStateForTypeSafe(inputState);
    const sanitizedVal = typeof sanitized.test_summary === "string" ? sanitized.test_summary : "";

    expect(sanitizedVal.length).toBeLessThanOrEqual(6000);
    expect(sanitizedVal.startsWith("<test_summary>\n")).toBe(true);
    expect(sanitizedVal.endsWith("\n</test_summary>")).toBe(true);
    expect(sanitizedVal).toContain("[...");
  });

  test("runPhaseMacroCheck with taskType analysis_research and unifiedDiff with config.json does not force code_change", async () => {
    let capturedQuestion = "";
    const mockClient = {
      evaluate: async (ctx: { questions: Record<string, { instructions: string }> }) => {
        capturedQuestion = ctx.questions?.deliverables_verdict?.instructions || ctx.questions?.meets_criteria?.instructions || "";
        return {
          answers: {
            meets_criteria: { noul: 0.95 },
          },
        };
      },
    };

    await runPhaseMacroCheck(
      {
        todoTask: "Research task",
        taskType: "analysis_research",
        diffSummary: "?? reports/x.md",
        unifiedDiff: "Referencing config.json in documentation text",
        deliverableArtifacts: "# Research report\nAll good.",
      },
      mockClient as unknown as Parameters<typeof runPhaseMacroCheck>[1]
    );

    expect(capturedQuestion).toContain("deliverable_artifacts");
    expect(capturedQuestion).not.toContain("code changes");
  });

  test("runTaskMicroCheck zero evidence passes if agentWorkLog is present", async () => {
    const failRes = await runTaskMicroCheck({
      gitStatus: "",
      gitDiff: "",
      testExitCode: null,
      testOutput: "",
      cleanWorkingTree: true,
      agentWorkLog: "",
    });
    expect(failRes.passed).toBe(false);
    expect(failRes.reasons.join(" ")).toContain("Zero evidence");

    const passRes = await runTaskMicroCheck({
      gitStatus: "",
      gitDiff: "",
      testExitCode: null,
      testOutput: "",
      cleanWorkingTree: true,
      agentWorkLog: "analysis delivered in chat",
    });
    expect(passRes.passed).toBe(true);
  });

  test("Payload size check: 200 KB diff produces serialized state <= 32768 bytes with matching XML tags", async () => {
    const { handlers, mockPi } = createMockPi();
    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    const interceptor = handlers.tool_call?.[0];

    // Create huge 200KB file
    const huge = "export const x = 1;\n".repeat(10000);
    fs.writeFileSync(path.join(tempRepo, "huge.ts"), huge);

    await interceptor?.(
      { tool: "todo", params: { op: "done", task: "Huge file task" } },
      { cwd: tempRepo }
    );

    expect(capturedBodyStr).not.toBe("");
    expect(Buffer.byteLength(capturedBodyStr)).toBeLessThanOrEqual(32768);
    expect(String(capturedState?.todo_task)).toContain("Huge file task");
    expect(capturedState?.user_request).toBeDefined();

    // Check all <tag> have matching </tag>
    for (const [, val] of Object.entries(capturedState || {})) {
      if (typeof val === "string" && val.startsWith("<") && val.includes(">\n")) {
        const match = val.match(/^<([a-z_]+)>/);
        if (match) {
          const tagName = match[1];
          expect(val.endsWith(`</${tagName}>`)).toBe(true);
        }
      }
    }
  });
});
