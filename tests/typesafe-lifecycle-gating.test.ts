import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import registerExtension, {
  activeContractedTasks,
  consecutiveFailuresByTask,
  resetLastCheckpoint,
} from "../typesafe-planner";
const nodeRequire = createRequire(import.meta.url);
interface MockToolDefinition {
  name: string;
  description: string;
  parameters: {
    safeParse: (val: unknown) => { success: boolean; data?: unknown; error?: unknown };
  };
  execute: (id: string, params: unknown, signal?: AbortSignal, ctx?: unknown) => Promise<unknown>;
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

function createZodMock() {
  const schema = {
    safeParse: (val: unknown) => {
      if (val && typeof val === "object") {
        return { success: true, data: val };
      }
      return { success: false, error: new Error("Invalid") };
    },
    optional: () => schema,
  };

  return {
    object: () => schema,
    union: () => schema,
    string: () => schema,
    number: () => schema,
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

function createMockPi() {
  const tools: Record<string, MockToolDefinition> = {};
  const handlers: Record<string, Array<(event: unknown, ctx: unknown) => Promise<void>>> = {};
  const messages: unknown[] = [];

  const mockPi = {
    zod: createZodMock(),
    registerTool(def: MockToolDefinition) {
      tools[def.name] = def;
    },
    on(event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    async sendMessage(msg: unknown) {
      messages.push(msg);
    },
  };

  registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);

  return { tools, handlers, messages };
}

describe("TypeSafe Lifecycle Gating & Human Authorization Fix (TDD Tests)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    activeContractedTasks.clear();
    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("systemone")) {
        return new Response(
          JSON.stringify({
            answers: {
              meets_criteria: { noul: 1.0 },
              architectural_drift: { choice: "no_drift", confidence: 1.0 },
              scope_mode: { choice: "HOLD", confidence: 1.0 },
              plan_drift: { choice: "drift_free" },
              claude_account_untouched: { noul: 1.0 },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // Requirement 1: Reproduce false-positive invariant violation when todo op: "init" is invoked on an empty task list.
  test("allows initial todo init when no active tasks exist", async () => {
    const { handlers } = createMockPi();
    const interceptor = handlers.tool_call?.[0];
    expect(interceptor).toBeDefined();

    let cancelledReason: string | undefined;
    const evt: MockEvent = {
      tool: "todo",
      params: { op: "init", items: ["Task 1", "Task 2"], testCommand: "node -e 'process.exit(0)'" },
      cancel: (r: string) => {
        cancelledReason = r;
      },
    };

    let threw = false;
    try {
      await interceptor?.(evt, {});
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(cancelledReason).toBeUndefined();
  });

  // Requirement 2: Reject todo init/drop when tasks are active/uncompleted without human authorization
  test("rejects todo drop or init when tasks are active and uncompleted without human authorization", async () => {
    const { handlers } = createMockPi();
    const interceptor = handlers.tool_call?.[0];
    expect(interceptor).toBeDefined();

    // First populate some active tasks via append or init
    await interceptor?.({
      tool: "todo",
      params: { op: "append", items: ["Pending Task"], testCommand: "node -e 'process.exit(0)'" },
    }, {});

    let cancelledReason: string | undefined;
    const dropEvt: MockEvent = {
      tool: "todo",
      params: { op: "drop", task: "Pending Task", testCommand: "node -e 'process.exit(0)'" },
      cancel: (r: string) => {
        cancelledReason = r;
      },
    };

    let threw = false;
    try {
      await interceptor?.(dropEvt, {});
    } catch {
      threw = true;
    }

    expect(threw || cancelledReason !== undefined).toBe(true);
    expect(cancelledReason || "").toContain("dropping or resetting");
    expect(cancelledReason || "").toContain("NEXT ACTIONS FOR AGENT");
  });

  // Requirement 3: Human authorization permits resetting tasks
  test("allows dropping or resetting tasks when human authorization is present", async () => {
    const { handlers } = createMockPi();
    const interceptor = handlers.tool_call?.[0];
    expect(interceptor).toBeDefined();

    let cancelledReason: string | undefined;
    const dropEvt: MockEvent = {
      tool: "todo",
      params: { op: "drop", task: "Pending Task", testCommand: "node -e 'process.exit(0)'" },
      cancel: (r: string) => {
        cancelledReason = r;
      },
    };

    // With ctx.isHuman: true
    await interceptor?.(dropEvt, { isHuman: true });
    expect(cancelledReason).toBeUndefined();
  });

  // Requirement 4 & 5: Actionable remediation in Gate 1 / Invariant Violation rejections
  test("rejections include actionable NEXT ACTIONS FOR AGENT instructions", async () => {
    const { handlers } = createMockPi();
    const interceptor = handlers.tool_call?.[0];
    expect(interceptor).toBeDefined();

    // Trigger invariant violation
    activeContractedTasks.add("Any Task");
    let cancelledReason = "";
    const evt: MockEvent = {
      tool: "todo",
      params: { op: "drop", task: "Any Task", testCommand: "node -e 'process.exit(0)'" },
      cancel: (r: string) => {
        cancelledReason = r;
      },
    };

    try {
      await interceptor?.(evt, {});
    } catch (e: unknown) {
      if (e instanceof Error) {
        cancelledReason = cancelledReason || e.message;
      }
    }

    expect(cancelledReason).toContain("NEXT ACTIONS FOR AGENT:");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // Requirement 6: Plan completion loophole: direct status: completed in plan files or plan-cli check
  test("intercepts write/edit to plans/**/plan.md or phase-*.md setting status: completed", async () => {
    const { handlers } = createMockPi();
    const interceptor = handlers.tool_call?.[0];
    expect(interceptor).toBeDefined();
    activeContractedTasks.add("Dummy Task");

    let cancelledReason: string | undefined;
    const evt: MockEvent = {
      tool: "edit",
      params: {
        path: "plans/261007-test/plan.md",
        input: "[plans/261007-test/plan.md#1234]\nPUT 4:=4:\n+status: completed",
      },
      cancel: (r: string) => {
        cancelledReason = r;
      },
    };

    let threw = false;
    try {
      await interceptor?.(evt, {});
    } catch {
      threw = true;
    }

    expect(threw || cancelledReason !== undefined).toBe(true);
    expect(cancelledReason || "").toContain("Plan closure");
  });

  test("intercepts write/edit to plan setting status: complete (without d)", async () => {
    const { handlers } = createMockPi();
    const interceptor = handlers.tool_call?.[0];
    expect(interceptor).toBeDefined();
    activeContractedTasks.add("Unfinished Task");

    let cancelledReason: string | undefined;
    const evt: MockEvent = {
      tool: "write",
      params: {
        path: "plans/261012-test/plan.md",
        content: "---\ntitle: test\nstatus: complete\n---",
      },
      cancel: (r: string) => {
        cancelledReason = r;
      },
    };

    let threw = false;
    try {
      await interceptor?.(evt, {});
    } catch {
      threw = true;
    }

    expect(threw || cancelledReason !== undefined).toBe(true);
    expect(cancelledReason || "").toContain("Plan closure rejected");
    expect(cancelledReason || "").toContain("Unfinished Task");
  });

  test("allows writing reports under plans/reports/*.md even when activeContractedTasks is non-empty and report mentions status: completed", async () => {
    const { handlers } = createMockPi();
    const interceptor = handlers.tool_call?.[0];
    expect(interceptor).toBeDefined();
    activeContractedTasks.add("Ongoing Research Task");

    let cancelledReason: string | undefined;
    const evt: MockEvent = {
      tool: "write",
      params: {
        path: "plans/reports/261014-scout-report.md",
        content: "# Scout Report\n\nObserved historical plan with `status: completed` in frontmatter.\n",
      },
      cancel: (r: string) => {
        cancelledReason = r;
      },
    };

    let threw = false;
    try {
      await interceptor?.(evt, {});
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(cancelledReason).toBeUndefined();
  });

  test("intercepts bash command running plan-cli.cjs check", async () => {
    const { handlers } = createMockPi();
    const interceptor = handlers.tool_call?.[0];
    activeContractedTasks.add("Dummy Task");


    let cancelledReason: string | undefined;
    const evt: MockEvent = {
      tool: "bash",
      params: {
        command: "node plans/plan-cli.cjs check 01",
      },
      cancel: (r: string) => {
        cancelledReason = r;
      },
    };

    let threw = false;
    try {
      await interceptor?.(evt, {});
    } catch {
      threw = true;
    }

    expect(threw || cancelledReason !== undefined).toBe(true);
    expect(cancelledReason || "").toContain("Plan closure");
  });

  test("Resolver Contract: '*' enables TypeSafe for any project and respects excludeProjects", async () => {
    const resolverPath = path.join(os.homedir(), ".claude", "hooks", "lib", "typesafe-enabled-resolver.cjs");
    const { resolveTypeSafeEnabled } = nodeRequire(resolverPath);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-test-home-"));
    try {
      const claudeDir = path.join(tempDir, ".claude");
      await fs.mkdir(claudeDir, { recursive: true });
      const forbiddenDir = path.join(tempDir, "forbidden");
      await fs.mkdir(forbiddenDir, { recursive: true });
      await fs.mkdir(path.join(forbiddenDir, ".git"), { recursive: true });

      const normalDir = path.join(tempDir, "normal-repo");
      await fs.mkdir(normalDir, { recursive: true });
      await fs.mkdir(path.join(normalDir, ".git"), { recursive: true });

      const config = {
        typesafe: {
          projects: ["*"],
          excludeProjects: [forbiddenDir],
        },
      };
      await fs.writeFile(path.join(claudeDir, ".ck.json"), JSON.stringify(config), "utf8");

      // General git project matching wildcard "*"
      const res1 = resolveTypeSafeEnabled(normalDir, {
        env: { TYPESAFE_API_KEY: "test_key" },
        homeDir: tempDir,
      });
      expect(res1.enabled).toBe(true);
      expect(res1.reason).toBe("global-allowlist");

      // Excluded project
      const res2 = resolveTypeSafeEnabled(forbiddenDir, {
        env: { TYPESAFE_API_KEY: "test_key" },
        homeDir: tempDir,
      });
      expect(res2.enabled).toBe(false);
      expect(res2.reason).toBe("global-excluded");

      // Arbitrary non-git directory without project markers matching wildcard "*"
      const nonRepoDir = path.join(tempDir, "clean-arbitrary-dir");
      await fs.mkdir(nonRepoDir, { recursive: true });
      const res3 = resolveTypeSafeEnabled(nonRepoDir, {
        env: { TYPESAFE_API_KEY: "test_key" },
        homeDir: tempDir,
      });
      expect(res3.enabled).toBe(true);
      expect(res3.reason).toBe("global-allowlist");
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test("todo(op='init', list=[...]) populates activeContractedTasks and blocks subsequent rm or bare rm", async () => {
    const { handlers } = createMockPi();
    const interceptor = handlers.tool_call?.[0];
    expect(interceptor).toBeDefined();

    await interceptor?.(
      {
        tool: "todo",
        params: {
          op: "init",
          list: [{ phase: "P1", items: ["Task A", "Task B"] }],
        },
      },
      {}
    );

    expect(activeContractedTasks.has("Task A")).toBe(true);
    expect(activeContractedTasks.has("Task B")).toBe(true);

    // Attempt todo(op="rm", task="Task A") -> rejected by Drop Gate
    let rmCancelledReason: string | undefined;
    let rmThrew = false;
    try {
      await interceptor?.(
        {
          tool: "todo",
          params: { op: "rm", task: "Task A" },
          cancel: (r: string) => {
            rmCancelledReason = r;
          },
        },
        {}
      );
    } catch {
      rmThrew = true;
    }
    expect(rmThrew || rmCancelledReason !== undefined).toBe(true);
    expect(rmCancelledReason || "").toContain("Task A");

    // Attempt bare todo(op="rm") without task -> rejected by Drop Gate for all contracted tasks
    let bareRmCancelledReason: string | undefined;
    let bareRmThrew = false;
    try {
      await interceptor?.(
        {
          tool: "todo",
          params: { op: "rm" },
          cancel: (r: string) => {
            bareRmCancelledReason = r;
          },
        },
        {}
      );
    } catch {
      bareRmThrew = true;
    }
    expect(bareRmThrew || bareRmCancelledReason !== undefined).toBe(true);
    expect(bareRmCancelledReason || "").toContain("Task A");
    expect(bareRmCancelledReason || "").toContain("Task B");
  });

  test("Dual-parameter smuggling (todo init with both items and list) is caught by Drop Gate because list takes precedence", async () => {
    const { handlers } = createMockPi();
    const interceptor = handlers.tool_call?.[0];
    expect(interceptor).toBeDefined();

    await interceptor?.(
      {
        tool: "todo",
        params: {
          op: "init",
          list: [{ phase: "P1", items: ["Task A"] }],
        },
      },
      {}
    );
    expect(activeContractedTasks.has("Task A")).toBe(true);

    // Smuggle Task A in `items` while `list` replaces it with "New Task"
    let smuggleCancelled: string | undefined;
    let smuggleThrew = false;
    try {
      await interceptor?.(
        {
          tool: "todo",
          params: {
            op: "init",
            items: ["Task A"],
            list: [{ phase: "P1", items: ["New Task"] }],
          },
          cancel: (r: string) => {
            smuggleCancelled = r;
          },
        },
        {}
      );
    } catch {
      smuggleThrew = true;
    }
    expect(smuggleThrew || smuggleCancelled !== undefined).toBe(true);
    expect(smuggleCancelled || "").toContain("Task A");
  });

  test("attemptCount off-by-one fix: Attempt #3 (currentFailures === 2) still calls JEV instead of short-circuiting", async () => {
    resetLastCheckpoint();
    const { handlers } = createMockPi();
    const interceptor = handlers.tool_call?.[0];
    expect(interceptor).toBeDefined();

    let jevCalls = 0;
    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("systemone")) {
        jevCalls++;
        return new Response(
          JSON.stringify({
            answers: {
              meets_criteria: { noul: 0.95 },
              deliverables_verdict: { choice: "APPROVE", confidence: 0.95 },
              architectural_drift: { choice: "no_drift", confidence: 0.95 },
              scope_mode: { choice: "HOLD", confidence: 0.95 },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    // Simulate 2 prior failures (so this is Attempt #3)
    const taskName = "Research architecture options on attempt 3";
    consecutiveFailuresByTask.set(taskName, 2);

    const mockCtx = {
      cwd: os.tmpdir(),
      sessionManager: {
        getBranch: () => [
          { type: "message", message: { role: "user", content: "Research architecture options" } },
          {
            type: "message",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "Completed full architectural option analysis." }],
            },
          },
        ],
      },
    };

    let cancelledReason: string | undefined;
    await interceptor?.(
      {
        tool: "todo",
        params: { op: "done", task: taskName },
        cancel: (r: string) => {
          cancelledReason = r;
        },
      },
      mockCtx
    );

    expect(jevCalls).toBeGreaterThanOrEqual(1);
    expect(cancelledReason).toBeUndefined();
  });

  test("session_start clears activeContractedTasks and consecutiveFailuresByTask", async () => {
    const { handlers } = createMockPi();
    const sessionStartHandler = handlers.session_start?.[0];
    expect(sessionStartHandler).toBeDefined();

    activeContractedTasks.add("Stale Task");
    consecutiveFailuresByTask.set("Stale Task", 2);

    await sessionStartHandler?.({}, {});

    expect(activeContractedTasks.size).toBe(0);
    expect(consecutiveFailuresByTask.size).toBe(0);
  });
});
