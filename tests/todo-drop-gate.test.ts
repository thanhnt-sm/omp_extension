import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import registerExtension, { activeContractedTasks } from "../typesafe-planner";

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

interface MockPiMessage {
  customType?: string;
  content?: string;
  display?: boolean;
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
    min: () => schema,
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

function createMockPi() {
  const tools: Record<string, MockToolDefinition> = {};
  const handlers: Record<string, Array<(event: unknown, ctx: unknown) => Promise<void>>> = {};
  const messages: MockPiMessage[] = [];

  const mockPi = {
    zod: createZodMock(),
    registerTool(def: MockToolDefinition) {
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

const defaultPiInstance = createMockPi();
registerExtension(defaultPiInstance.mockPi as unknown as Parameters<typeof registerExtension>[0]);

describe("TypeSafe Todo Drop Gate", () => {
  const originalFetch = globalThis.fetch;
  let fetchStateBody: Record<string, unknown> | null = null;
  const interceptor = defaultPiInstance.handlers.tool_call?.[0];

  beforeEach(() => {
    activeContractedTasks.clear();
    defaultPiInstance.messages.length = 0;
    fetchStateBody = null;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("systemone")) {
        if (init?.body) {
          try {
            const parsed: unknown = JSON.parse(init.body as string);
            if (parsed && typeof parsed === "object" && "state" in parsed) {
              const stateVal = parsed.state;
              if (stateVal && typeof stateVal === "object") {
                fetchStateBody = stateVal as Record<string, unknown>;
              }
            }
            const isDrop = parsed && typeof parsed === "object" && "question" in parsed && typeof parsed.question === "string" && parsed.question.includes("drop_justified");
            if (isDrop || (fetchStateBody && "tasks_to_drop" in fetchStateBody)) {
              const X = parseFloat((globalThis as unknown as { mockJudgeNoul?: string }).mockJudgeNoul || "0.95");
              return {
                ok: true,
                status: 200,
                json: async () => ({
                  answers: {
                    drop_justified: { noul: X, confidence: 0.9 },
                  },
                }),
              } as Response;
            }
            return {
              ok: true,
              status: 200,
              json: async () => ({
                answers: {
                  meets_criteria: { noul: 0.95 },
                  architectural_drift: { choice: "no_drift", confidence: 0.9 },
                  scope_mode: { choice: "HOLD", confidence: 0.9 },
                },
              }),
            } as Response;
          } catch (e) {
            console.error(e);
          }
        }
      }
      return originalFetch(url, init);
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as unknown as { mockJudgeNoul?: string }).mockJudgeNoul;
    activeContractedTasks.clear();
  });

  test("Drop with judge noul 0.95 resolves and sends report", async () => {
    activeContractedTasks.add("T1");
    (globalThis as unknown as { mockJudgeNoul?: string }).mockJudgeNoul = "0.95";

    let cancelledReason: string | undefined;
    const dropEvt: MockEvent = {
      tool: "todo",
      params: { op: "drop", task: "T1" },
      cancel: (r: string) => { cancelledReason = r; },
    };

    let threw = false;
    try {
      await interceptor?.(dropEvt, { cwd: __dirname });
    } catch { threw = true; }

    expect(threw).toBe(false);
    expect(cancelledReason).toBeUndefined();
    expect(activeContractedTasks.has("T1")).toBe(false);

    const reports = defaultPiInstance.messages.filter(m => m.customType === "typesafe-task-report");
    expect(reports.length).toBe(1);
    expect(reports[0].content).toContain('DROP "T1"');
    expect(reports[0].content).toContain("Decision: APPROVED (by: judge)");
    expect(reports[0].content).toContain("drop_justified=0.95");
  });

  test("Drop with noul 0.10 cancels/throws and keeps T1", async () => {
    activeContractedTasks.add("T1");
    (globalThis as unknown as { mockJudgeNoul?: string }).mockJudgeNoul = "0.10";

    let cancelledReason: string | undefined;
    const dropEvt: MockEvent = {
      tool: "todo",
      params: { op: "drop", task: "T1" },
      cancel: (r: string) => { cancelledReason = r; },
    };

    let threw = false;
    let uiConfirmCalled = false;
    try {
      await interceptor?.(dropEvt, {
        cwd: __dirname,
        ui: { confirm: async () => { uiConfirmCalled = true; return true; } },
      });
    } catch (e: unknown) {
      threw = true;
      if (!cancelledReason && e instanceof Error) cancelledReason = e.message;
    }

    expect(threw || cancelledReason !== undefined).toBe(true);
    expect(cancelledReason).toContain("TypeSafe drop gate rejected");
    expect(cancelledReason).toContain("NEXT ACTIONS FOR AGENT");
    expect(activeContractedTasks.has("T1")).toBe(true);
    expect(uiConfirmCalled).toBe(false);
  });

  test("Drop gray zone (0.55) approved by UI confirm", async () => {
    activeContractedTasks.add("T1");
    (globalThis as unknown as { mockJudgeNoul?: string }).mockJudgeNoul = "0.55";

    let confirmMessage = "";
    let confirmCalled = 0;
    const ctx = {
      cwd: __dirname,
      hasUI: true,
      ui: {
        confirm: async (_title: string, message: string) => {
          confirmCalled++;
          confirmMessage = message;
          return true;
        },
      },
    };

    const dropEvt: MockEvent = { tool: "todo", params: { op: "drop", task: "T1" }, cancel: () => {} };
    await interceptor?.(dropEvt, ctx);

    expect(confirmCalled).toBe(1);
    expect(confirmMessage).toContain("T1");
    expect(confirmMessage).toContain("0.55");
    expect(confirmMessage).toContain("Agent drop reason:");
    expect(confirmMessage).toContain("User request:");
    expect(activeContractedTasks.has("T1")).toBe(false);

    const reports = defaultPiInstance.messages.filter(m => m.customType === "typesafe-task-report");
    expect(reports.length).toBe(1);
    expect(reports[0].content).toContain("Decision: APPROVED (by: human)");
  });
  test("Drop confirmation dialog formats full context (task, reason, user request, score)", async () => {
    activeContractedTasks.add("T1");
    (globalThis as unknown as { mockJudgeNoul?: string }).mockJudgeNoul = "0.55";

    let confirmMessage = "";
    const ctx = {
      cwd: __dirname,
      hasUI: true,
      ui: {
        confirm: async (_title: string, message: string) => {
          confirmMessage = message;
          return true;
        },
      },
      sessionManager: {
        getBranch: () => [
          {
            type: "message",
            message: { role: "user", content: "Please cancel the legacy T1 step." },
          },
        ],
      },
    };

    const dropEvt: MockEvent = {
      tool: "todo",
      params: { op: "drop", task: "T1", reason: "Obsolete after refactoring" },
      cancel: () => {},
    };
    await interceptor?.(dropEvt, ctx);

    expect(confirmMessage).toContain("Tasks to drop: T1");
    expect(confirmMessage).toContain("Agent drop reason: Obsolete after refactoring");
    expect(confirmMessage).toContain("User request: Please cancel the legacy T1 step.");
    expect(confirmMessage).toContain("0.55");
    expect(activeContractedTasks.has("T1")).toBe(false);
  });
  test("Drop boundary: 0.29 rejects with NEXT ACTIONS and no UI confirm", async () => {
    activeContractedTasks.add("T1");
    (globalThis as unknown as { mockJudgeNoul?: string }).mockJudgeNoul = "0.29";

    let cancelledReason: string | undefined;
    let uiCalled = false;
    let threw = false;
    try {
      await interceptor?.(
        { tool: "todo", params: { op: "drop", task: "T1" }, cancel: (r: string) => { cancelledReason = r; } },
        { cwd: __dirname, hasUI: true, ui: { confirm: async () => { uiCalled = true; return true; } } }
      );
    } catch (e: unknown) {
      threw = true;
      if (!cancelledReason && e instanceof Error) cancelledReason = e.message;
    }
    expect(threw || cancelledReason !== undefined).toBe(true);
    expect(uiCalled).toBe(false);
    expect(activeContractedTasks.has("T1")).toBe(true);
    expect(cancelledReason).toContain("NEXT ACTIONS FOR AGENT");
  });

  test("Drop boundary: 0.35 in gray zone calls UI confirm", async () => {
    activeContractedTasks.add("T1");
    (globalThis as unknown as { mockJudgeNoul?: string }).mockJudgeNoul = "0.35";

    let uiCalled = false;
    await interceptor?.(
      { tool: "todo", params: { op: "drop", task: "T1" }, cancel: () => {} },
      { cwd: __dirname, hasUI: true, ui: { confirm: async () => { uiCalled = true; return true; } } }
    );
    expect(uiCalled).toBe(true);
    expect(activeContractedTasks.has("T1")).toBe(false);
  });

  test("Drop boundary: 0.80 auto-approves without UI confirm", async () => {
    activeContractedTasks.add("T1");
    (globalThis as unknown as { mockJudgeNoul?: string }).mockJudgeNoul = "0.80";

    let uiCalled = false;
    await interceptor?.(
      { tool: "todo", params: { op: "drop", task: "T1" }, cancel: () => {} },
      { cwd: __dirname, hasUI: true, ui: { confirm: async () => { uiCalled = true; return true; } } }
    );
    expect(uiCalled).toBe(false);
    expect(activeContractedTasks.has("T1")).toBe(false);
  });

  test("Drop gray zone (0.55) rejected if UI confirm is false or hasUI false", async () => {
    (globalThis as unknown as { mockJudgeNoul?: string }).mockJudgeNoul = "0.55";

    // Subtest: UI returns false
    activeContractedTasks.add("T1");
    let threw = false;
    try {
      await interceptor?.(
        { tool: "todo", params: { op: "drop", task: "T1" }, cancel: () => {} },
        { cwd: __dirname, hasUI: true, ui: { confirm: async () => false } }
      );
    } catch { threw = true; }
    expect(threw).toBe(true);
    expect(activeContractedTasks.has("T1")).toBe(true);

    // Subtest: hasUI false
    activeContractedTasks.clear();
    activeContractedTasks.add("T2");
    threw = false;
    let uiCalled = false;
    try {
      await interceptor?.(
        { tool: "todo", params: { op: "drop", task: "T2" }, cancel: () => {} },
        { cwd: __dirname, hasUI: false, ui: { confirm: async () => { uiCalled = true; return true; } } }
      );
    } catch { threw = true; }
    expect(threw).toBe(true);
    expect(uiCalled).toBe(false);
    expect(activeContractedTasks.has("T2")).toBe(true);
  });

  test("Judge error treated as undecided (human confirm)", async () => {
    (globalThis as unknown as { mockJudgeNoul?: string }).mockJudgeNoul = "0.50";

    activeContractedTasks.add("T1");
    let uiCalled = false;
    await interceptor?.(
      { tool: "todo", params: { op: "drop", task: "T1" }, cancel: () => {} },
      { cwd: __dirname, hasUI: true, ui: { confirm: async () => { uiCalled = true; return true; } } }
    );
    expect(uiCalled).toBe(true);
    expect(activeContractedTasks.has("T1")).toBe(false);
  });

  test("Judge error treated as unavailable (fail-closed, no human confirm prompt)", async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 500, text: async () => "Internal Server Error" })) as unknown as typeof globalThis.fetch;

    activeContractedTasks.add("T1");
    let uiCalled = false;
    let threw = false;
    let cancelledReason: string | undefined;
    try {
      await interceptor?.(
        { tool: "todo", params: { op: "drop", task: "T1" }, cancel: (r: string) => { cancelledReason = r; } },
        { cwd: __dirname, hasUI: true, ui: { confirm: async () => { uiCalled = true; return true; } } }
      );
    } catch (e: unknown) {
      threw = true;
      if (!cancelledReason && e instanceof Error) cancelledReason = e.message;
    }
    expect(uiCalled).toBe(false);
    expect(threw).toBe(true);
    expect(activeContractedTasks.has("T1")).toBe(true);
    expect(cancelledReason).toContain("TypeSafe drop gate rejected");
  });

  test("params auth rejected, host ctx.isHuman approved", async () => {
    (globalThis as unknown as { mockJudgeNoul?: string }).mockJudgeNoul = "0.10";
    activeContractedTasks.add("T1");

    // params auth rejected
    let threw = false;
    try {
      await interceptor?.(
        { tool: "todo", params: { op: "drop", task: "T1", isHuman: true }, cancel: () => {} },
        { cwd: __dirname }
      );
    } catch { threw = true; }
    expect(threw).toBe(true);
    expect(activeContractedTasks.has("T1")).toBe(true);

    // ctx isHuman approved
    await interceptor?.(
      { tool: "todo", params: { op: "drop", task: "T1" }, cancel: () => {} },
      { cwd: __dirname, isHuman: true }
    );
    expect(activeContractedTasks.has("T1")).toBe(false);
  });

  test("init items covering active tasks allowed, omitting triggers drop gate", async () => {
    (globalThis as unknown as { mockJudgeNoul?: string }).mockJudgeNoul = "0.95";
    activeContractedTasks.add("T1");
    activeContractedTasks.add("T2");

    // Covering
    await interceptor?.(
      { tool: "todo", params: { op: "init", items: ["T1", "T2", "T3"] }, cancel: () => {} },
      { cwd: __dirname }
    );
    expect(fetchStateBody).toBeNull();
    expect(activeContractedTasks.has("T1")).toBe(true);

    // Omitting T1
    await interceptor?.(
      { tool: "todo", params: { op: "init", items: ["T2"] }, cancel: () => {} },
      { cwd: __dirname }
    );
    expect(fetchStateBody).not.toBeNull();
    expect(String(fetchStateBody?.tasks_to_drop)).toContain("T1");
    expect(String(fetchStateBody?.tasks_to_drop)).not.toContain("T2");
    expect(activeContractedTasks.has("T1")).toBe(false);
  });

  test("Mixed ops: one judge call covers both", async () => {
    (globalThis as unknown as { mockJudgeNoul?: string }).mockJudgeNoul = "0.95";
    activeContractedTasks.add("T1");
    activeContractedTasks.add("T2");

    let fetchCount = 0;
    const oldFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCount++;
      return oldFetch(url, init);
    }) as typeof globalThis.fetch;

    await interceptor?.(
      { tool: "todo", params: { ops: [{ op: "drop", task: "T1" }, { op: "drop", task: "T2" }] }, cancel: () => {} },
      { cwd: __dirname }
    );
    expect(fetchCount).toBe(1);
    expect(String(fetchStateBody?.tasks_to_drop)).toContain("T1");
    expect(String(fetchStateBody?.tasks_to_drop)).toContain("T2");
    expect(activeContractedTasks.has("T1")).toBe(false);
    expect(activeContractedTasks.has("T2")).toBe(false);
  });

  test("Stall ratchet resets or approves by human", async () => {
    activeContractedTasks.add("T3");

    const failEvt: MockEvent = {
      tool: "todo",
      params: { op: "done", task: "T3", testCommand: 'bun -e "process.exit(1)"' },
      cancel: () => {},
    };
    let errCancel = "";
    const ctxRej = { cwd: process.cwd(), hasUI: true, ui: { confirm: async () => false } };
    try { await interceptor?.(failEvt, ctxRej); } catch {}
    try { await interceptor?.(failEvt, ctxRej); } catch {}

    let confirmCalled = false;
    const ctxApp = {
      cwd: process.cwd(),
      hasUI: true,
      ui: { confirm: async () => { confirmCalled = true; return true; } },
    };
    await interceptor?.(failEvt, ctxApp);

    expect(confirmCalled).toBe(true);
    expect(activeContractedTasks.has("T3")).toBe(false);

    activeContractedTasks.add("T4");
    const cancelledReasons: string[] = [];
    const failEvt4: MockEvent = {
      tool: "todo",
      params: { op: "done", task: "T4", testCommand: 'bun -e "process.exit(1)"' },
      cancel: (r: string) => { cancelledReasons.push(r); },
    };
    try { await interceptor?.(failEvt4, ctxRej); } catch {}
    try { await interceptor?.(failEvt4, ctxRej); } catch {}
    let threw = false;
    let errReason = "";
    try {
      await interceptor?.(failEvt4, ctxRej);
    } catch (e: unknown) {
      threw = true;
      if (e instanceof Error) errReason = e.message;
    }
    const reason3 = errReason || cancelledReasons[cancelledReasons.length - 1] || "";
    expect(threw || reason3 !== "").toBe(true);
    expect(reason3).toContain("stall ratchet");

    threw = false;
    errReason = "";
    try {
      await interceptor?.(failEvt4, ctxRej);
    } catch (e: unknown) {
      threw = true;
      if (e instanceof Error) errReason = e.message;
    }
    const reason4 = errReason || cancelledReasons[cancelledReasons.length - 1] || "";
    expect(threw || reason4 !== "").toBe(true);
    expect(reason4).toContain("Gate 1 Micro-Check");
  });
});
