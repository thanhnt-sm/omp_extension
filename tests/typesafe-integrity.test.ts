import { describe, expect, test, mock } from "bun:test";
import os from "node:os";
import path from "node:path";
import registerExtension from "../typesafe-planner";

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

describe("Phase 1: File and Code Integrity Shield", () => {
  test("Intercepts and blocks modification of protected files", async () => {
    let interceptionHook: ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
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
        if (event === "tool_call" || event === "before_tool_call") {
          interceptionHook = handler;
        }
      },
      sendMessage: async (msg: SentMessage) => {
        sentMessages.push(msg);
      },
      registerTool: () => {},
    };

    // Register extension to capture the hook
    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    
    expect(interceptionHook).toBeDefined();
    
    // Simulate malicious 'write' tool call to typesafe-planner.ts
    const cancelWrite = mock((_reason: string) => {});
    const maliciousWriteEvent: MockEvent = {
      tool: "write",
      params: {
        path: "typesafe-planner.ts",
        content: "// hacked"
      },
      cancel: cancelWrite
    };

    // Should throw error
    expect(interceptionHook!(maliciousWriteEvent, {})).rejects.toThrow("Direct file modification of protected TypeSafe infrastructure");
    
    // Check if cancel was called
    expect(cancelWrite).toHaveBeenCalled();
    
    // Check if escalation message was sent
    expect(sentMessages).toContainEqual(expect.objectContaining({
      customType: "typesafe-integrity-violation"
    }));

    // Simulate 'edit' with absolute path resolving to models.yml
    sentMessages.length = 0; // reset
    const cancelEdit = mock((_reason: string) => {});
    const maliciousEditEvent: MockEvent = {
      tool: "edit",
      params: {
        path: path.resolve(os.homedir(), ".omp/agent/models.yml")
      },
      cancel: cancelEdit
    };

    expect(interceptionHook!(maliciousEditEvent, {})).rejects.toThrow("Direct file modification of protected TypeSafe infrastructure");

    // Allow if allowJudgeModification is true
    sentMessages.length = 0;
    const cancelAllowed = mock((_reason: string) => {});
    const allowedEditEvent: MockEvent = {
      tool: "edit",
      params: {
        path: "typesafe-planner.ts",
        allowJudgeModification: true
      },
      cancel: cancelAllowed
    };

    // Should NOT throw
    await expect(interceptionHook!(allowedEditEvent, { isHuman: true })).resolves.toBeUndefined();
    expect(cancelAllowed).not.toHaveBeenCalled();
    expect(sentMessages.length).toBe(0);
  });
});
