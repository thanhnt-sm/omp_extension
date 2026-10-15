import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import registerExtension, {
  sanitizeStateForTypeSafe,
  collectConversationContext,
  resetLastCheckpoint,
  formatTaskReport,
} from "../typesafe-planner";
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

  test("sanitizeStateForTypeSafe preserves tail of test_summary and agent_work_log while keeping XML tags", () => {
    const hugeTestInner = "HEAD_NOISE_".repeat(300) + "\nRan 42 tests across 5 files. [42 pass, 0 fail]";
    const hugeWorkLogInner = "EARLY_STEP_".repeat(300) + "\nFinal step: completed implementation and verified.";
    const mediumArtifact = "# Spec\n" + "Detail line\n".repeat(250); // ~3000 chars (> 2000, < 5000)
    const inputState = {
      test_summary: `<test_summary>\n${hugeTestInner}\n</test_summary>`,
      agent_work_log: `<agent_work_log>\n${hugeWorkLogInner}\n</agent_work_log>`,
      deliverable_artifacts: mediumArtifact,
    };

    const sanitized = sanitizeStateForTypeSafe(inputState);
    expect(typeof sanitized).toBe("object");
    if (typeof sanitized === "object" && sanitized !== null) {
      const testVal = typeof sanitized.test_summary === "string" ? sanitized.test_summary : "";
      expect(testVal.startsWith("<test_summary>\n")).toBe(true);
      expect(testVal.endsWith("\n</test_summary>")).toBe(true);
      expect(testVal).toContain("Ran 42 tests across 5 files. [42 pass, 0 fail]");
      expect(testVal.length).toBeLessThanOrEqual(2000);

      const workVal = typeof sanitized.agent_work_log === "string" ? sanitized.agent_work_log : "";
      expect(workVal.startsWith("<agent_work_log>\n")).toBe(true);
      expect(workVal.endsWith("\n</agent_work_log>")).toBe(true);
      expect(workVal).toContain("Final step: completed implementation and verified.");
      expect(workVal.length).toBeLessThanOrEqual(2000);

      const artifactVal = typeof sanitized.deliverable_artifacts === "string" ? sanitized.deliverable_artifacts : "";
      expect(artifactVal).toBe(mediumArtifact);
    }

    const planEvalState = `<plan_evaluation_state>\n${"P".repeat(10000)}\n</plan_evaluation_state>`;
    const sanitizedPlan = sanitizeStateForTypeSafe(planEvalState);
    expect(sanitizedPlan).toBe(planEvalState);

    const hugePlanEvalState = `<plan_evaluation_state>\n${"P".repeat(18000)}\n</plan_evaluation_state>`;
    const clampedPlan = String(sanitizeStateForTypeSafe(hugePlanEvalState));
    expect(clampedPlan.length).toBeLessThanOrEqual(14000);
    expect(clampedPlan.startsWith("<plan_evaluation_state>\n")).toBe(true);
    expect(clampedPlan.endsWith("\n</plan_evaluation_state>")).toBe(true);
  });

  test("collectConversationContext head-clamps <task-result> and scopes lastTestSummary to bash/eval", () => {
    const taskResultText = `<task-result>\nSubagent key summary at top\n${"detail ".repeat(300)}\nAgent is now idle.</task-result>`;
    const mockCtx = {
      sessionManager: {
        getBranch: () => [
          {
            type: "message",
            message: {
              role: "toolResult",
              toolName: "task",
              isError: false,
              content: taskResultText,
            },
          },
          {
            type: "message",
            message: {
              role: "toolResult",
              toolName: "bash",
              isError: false,
              content: "bun test\nRan 18 tests across 2 files. [18 pass, 0 fail]",
            },
          },
          {
            type: "message",
            message: {
              role: "toolResult",
              toolName: "read",
              isError: false,
              content: "// File mentioning bun test in a comment should NOT overwrite lastTestSummary",
            },
          },
        ],
      },
    };

    const convo = collectConversationContext(mockCtx);
    expect(convo.agentWorkLog).toContain("Subagent key summary at top");
    expect(convo.lastTestSummary).toContain("Ran 18 tests across 2 files");
    expect(convo.lastTestSummary).not.toContain("File mentioning bun test");
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

  test("formatTaskReport outputs verdict and task_type alongside meets_criteria, drift, and scope", () => {
    const report = formatTaskReport({
      kind: "DONE",
      tasks: ["Clarify requirements and brainstorm approaches"],
      approved: true,
      decidedBy: "judge",
      scores: {
        meetsCriteria: 0.94,
        drift: "no_drift",
        scope: "HOLD",
        verdict: "APPROVE",
        taskType: "analysis_research",
      },
      diffScope: "task-baseline",
      changedFiles: [],
      test: "not provided",
      reasons: [],
    });

    expect(report).toContain("Judge: meets_criteria=0.94 | drift=no_drift | scope=HOLD | verdict=APPROVE | task_type=analysis_research");
  });

  test("E2E handleTodoInterception: cognitive task with zero code changes uses analysis_research, supplies agentWorkLog fallback, filters plan-cli stubs, and reports verdict and task_type", async () => {
    const { handlers, messages, mockPi } = createMockPi();
    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    const interceptor = handlers.tool_call?.[0];

    // Scaffold a plan-cli stub in tempRepo to verify it is filtered out from deliverable_artifacts
    const stubDir = path.join(tempRepo, "plans", "261014-stub");
    fs.mkdirSync(stubDir, { recursive: true });
    fs.writeFileSync(path.join(stubDir, "plan.md"), "# Stub Plan\n\n## Overview\n\nTBD.\n", "utf8");

    const mockCtx = {
      cwd: tempRepo,
      sessionManager: {
        getBranch: () => [
          { type: "message", message: { role: "user", content: "Clarify requirements and brainstorm 3 approaches" } },
          {
            type: "message",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "Evaluated 3 architectural options (Option A, B, C) with trade-offs." }],
            },
          },
        ],
      },
    };

    await interceptor?.(
      { tool: "todo", params: { op: "done", task: "Clarify requirements and brainstorm 3 approaches" } },
      mockCtx
    );

    expect(capturedState).not.toBeNull();
    const deliverableArtifacts = String(capturedState?.deliverable_artifacts || "");
    expect(deliverableArtifacts).toContain("Evaluated 3 architectural options");
    expect(deliverableArtifacts).not.toContain("TBD.");

    const taskReportMsg = messages.find((m) => m.customType === "typesafe-task-report");
    expect(taskReportMsg?.content).toContain("verdict=APPROVE");
    expect(taskReportMsg?.content).toContain("task_type=analysis_research");
  });

  test("collectConversationContext filters TypeSafe task reports and background job notices from userRequest while extracting background test results", () => {
    const convo = collectConversationContext({
      sessionManager: {
        getBranch: () => [
          {
            type: "message",
            message: {
              role: "user",
              content: "[IMPORTANT: User invoked the \"ck:team\" skill]\nFull skill body...\nUser: Revert unrelated changes and verify workspace",
            },
          },
          {
            type: "message",
            message: {
              role: "user",
              content: "📋 TypeSafe task report — DONE \"Step 1\"\nDecision: APPROVED",
            },
          },
          {
            type: "message",
            message: {
              role: "user",
              content: "<system-notice>\nBackground job bg_1 has completed.\nbun test v1.4.0\n 312 pass\n 0 fail\nRan 312 tests across 33 files.\n</system-notice>",
            },
          },
        ],
      },
    });

    expect(convo.userRequest).toBe("Revert unrelated changes and verify workspace");
    expect(convo.userRequest).not.toContain("TypeSafe task report");
    expect(convo.userRequest).not.toContain("Background job bg_1");
    expect(convo.lastTestSummary).toContain("312 pass");
  });
});
