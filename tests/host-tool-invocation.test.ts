import { describe, expect, test } from "bun:test";
import { createHostToolInvocationRuntime, HOST_TOOL_INVOCATION_ENTRY } from "../src/host-tool-invocation";
import { readHostBranch, validateProjectToolInvocationJoin } from "../src/host-history";
import type { HostHistoryEntry } from "../src/host-history";

function fixture() {
  const entries: HostHistoryEntry[] = [];
  let sessionId = "actual-fixture-session";
  const manager = { getSessionId: () => sessionId, getBranch: () => entries };
  const context = { sessionManager: manager };
  const runtime = createHostToolInvocationRuntime((customType, data) => entries.push({ id: `actual-entry-${entries.length}`, parentId: entries.at(-1)?.id, type: "custom", customType, data }));
  return { entries, context, runtime, changeSession: (value: string) => { sessionId = value; } };
}

describe("execute-scoped source witnesses", () => {
  test("joins schema-stripped intent but rejects changed authority-bearing arguments", async () => {
    const f = fixture();
    const wire = { i: "Binding current task", task: "A", phase: "P" };
    f.entries.push({ id: "actual-assistant", type: "message", message: { role: "assistant", content: [
      { type: "toolCall", id: "call", name: "typesafe_bind_task", arguments: wire },
    ] } });
    await f.runtime.run(f.context, "typesafe_bind_task", "call", { task: "A", phase: "P" }, async () => {
      const witness = f.runtime.current(f.context)!;
      expect(validateProjectToolInvocationJoin(readHostBranch(f.context)!, witness)).toBe(true);
      wire.task = "B";
      expect(validateProjectToolInvocationJoin(readHostBranch(f.context)!, witness)).toBe(false);
      wire.task = "A";
      wire.phase = "Q";
      expect(validateProjectToolInvocationJoin(readHostBranch(f.context)!, witness)).toBe(false);
    });
  });
  test("works before a current assistant row publishes, stores no raw public/private payload and binds actual assigned journal ID", async () => {
    const f = fixture();
    await f.runtime.run(f.context, "typesafe_bind_task", "actual-call", { task: "public task", privateMarker: "NEVER_JOURNAL_THIS" }, async () => {
      const witness = f.runtime.current(f.context);
      expect(witness?.entryId).toBe("actual-entry-0");
      expect(readHostBranch(f.context)?.byId.get(witness!.entryId)?.customType).toBe(HOST_TOOL_INVOCATION_ENTRY);
      expect(JSON.stringify(f.entries)).not.toContain("NEVER_JOURNAL_THIS");
      expect(f.entries.some(entry => entry.type === "message")).toBe(false);
    });
    expect(f.runtime.current(f.context)).toBeUndefined();
  });
  test("rejects a lookalike manager, different call/arguments and a manager reused for another session", async () => {
    const f = fixture();
    await f.runtime.run(f.context, "typesafe_bind_task", "call", { task: "A" }, async () => {
      expect(f.runtime.current({ sessionManager: { ...f.context.sessionManager } })).toBeUndefined();
      expect(f.runtime.current(f.context, "typesafe_bind_task", "other", { task: "A" })).toBeUndefined();
      expect(f.runtime.current(f.context, "typesafe_bind_task", "call", { task: "B" })).toBeUndefined();
      f.changeSession("different-session");
      expect(f.runtime.current(f.context)).toBeUndefined();
    });
  });
  test("keeps overlapping async executions distinct", async () => {
    const f = fixture();
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const first = f.runtime.run(f.context, "typesafe_collect_evidence", "first", { task: "A" }, async () => {
      await barrier;
      expect(f.runtime.current(f.context)?.callId).toBe("first");
    });
    const second = f.runtime.run(f.context, "typesafe_collect_evidence", "second", { task: "B" }, async () => {
      expect(f.runtime.current(f.context)?.callId).toBe("second");
      release();
      await Promise.resolve();
      expect(f.runtime.current(f.context)?.callId).toBe("second");
    });
    await Promise.all([first, second]);
  });
  test("orphan async descendants cannot retain execution authority after the actual callback returned", async () => {
    const f = fixture();
    let release!: () => void;
    let descendant!: Promise<unknown>;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    await f.runtime.run(f.context, "typesafe_review_task", "finished", {}, async () => {
      descendant = barrier.then(() => f.runtime.current(f.context));
    });
    release();
    expect(await descendant).toBeUndefined();
  });
  test("a missing journal publication yields no witness instead of inventing history", async () => {
    const entries: HostHistoryEntry[] = [];
    const context = { sessionManager: { getSessionId: () => "session", getBranch: () => entries } };
    const runtime = createHostToolInvocationRuntime(() => {});
    await runtime.run(context, "typesafe_bind_task", "call", {}, async () => { expect(runtime.current(context)).toBeUndefined(); });
    expect(entries).toEqual([]);
  });
});
