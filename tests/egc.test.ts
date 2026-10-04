import { describe, expect, it } from "bun:test";
import defaultExport from "../src/egc.js";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

interface MockToolSpec {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  handler?: (args: unknown, ctx: unknown) => unknown;
}

interface MockCommandSpec {
  description?: string;
  handler: (args: string, ctx: MockCommandContext) => unknown;
}

interface MockCommandContext {
  cwd: string;
  ui: {
    notify: (msg: string, level: string) => { msg: string; level: string };
  };
}

describe("EGC Extension", () => {
  it("exports an extension initialization function", () => {
    expect(typeof defaultExport).toBe("function");
  });

  it("registers tools and commands with ExtensionAPI mock", async () => {
    const registeredTools: Record<string, MockToolSpec> = {};
    const registeredCommands: Record<string, MockCommandSpec> = {};
    const eventHandlers: Record<string, Array<(...args: unknown[]) => unknown>> = {};

    const mockPi = {
      zod: {
        z: {
          object: (schema: unknown) => schema,
          string: () => ({ describe: () => ({}) }),
        },
      },
      appendEntry: (_type: string, _data: unknown) => {},
      registerTool: (spec: MockToolSpec) => {
        registeredTools[spec.name] = spec;
      },
      registerCommand: (name: string, spec: MockCommandSpec) => {
        registeredCommands[name] = spec;
      },
      on: (event: string, handler: (...args: unknown[]) => unknown) => {
        if (!eventHandlers[event]) eventHandlers[event] = [];
        eventHandlers[event].push(handler);
      },
    };

    // Initialize extension
    defaultExport(mockPi as unknown as Parameters<typeof defaultExport>[0]);

    // Verify registration
    expect(registeredTools["egc_blocked"]).toBeDefined();
    expect(registeredCommands["egc"]).toBeDefined();
    expect(eventHandlers["tool_call"]).toBeDefined();
    expect(eventHandlers["session_stop"]).toBeDefined();

    // Verify /egc init command behavior
    const testDir = join(tmpdir(), "egc_test_" + Date.now());
    const mockCtx: MockCommandContext = {
      cwd: testDir,
      ui: {
        notify: (msg: string, level: string) => ({ msg, level }),
      },
    };

    await registeredCommands["egc"].handler("init", mockCtx);
    const egcConfigPath = join(testDir, ".omp", "egc.json");
    expect(existsSync(egcConfigPath)).toBe(true);

    const configContent = JSON.parse(readFileSync(egcConfigPath, "utf8")) as {
      uncontracted?: string;
      tasks?: Record<string, unknown>;
    };
    expect(configContent.uncontracted).toBe("defaults");
    expect(configContent.tasks?.["T1"]).toBeDefined();

    // Clean up
    rmSync(testDir, { recursive: true, force: true });
  });
});
