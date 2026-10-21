import { describe, expect, test } from "bun:test";
import { AdvisorHostFixture, advisorValue, object } from "./advisor-host-fixture";

describe("source-supported native Advisor host adapter (offline controls, not live proof)", () => {
  test("defers native schema lookup until SDK initialization and preserves native schema identity", async () => {
    const host = new AdvisorHostFixture(); expect(host.getAllDuringLoad).toBe(0);
    await host.start();
    for (const name of ["task", "read", "grep", "glob"]) expect(host.tools.get(name)?.parameters).toBe(host.nativeSchemas.get(name));
    const shape = object(object(host.tools.get("typesafe_prepare_advisor")!.parameters).shape);
    expect(Object.hasOwn(shape, "task")).toBe(true); expect(Object.hasOwn(shape, "phase")).toBe(true);
    expect((await host.prepare({ purpose: "shadow" }, false)).status).toBe("UNAVAILABLE");
    expect((await host.prepare({ purpose: "invented" }, false)).status).toBe("UNAVAILABLE");
  });
  test("binds only actual native task ID, routes separate child event buses, and waits for actual outer history", async () => {
    const host = new AdvisorHostFixture(); await host.start(); const pending = await host.prepare();
    expect(pending.status).toBe("REVIEW_REQUIRED"); expect(host.finalCalls).toEqual([]);
    const params = object(pending.parameters); expect(Object.hasOwn(params, "blocking")).toBe(false);
    expect(Object.hasOwn(object((params.tasks as unknown[])[0]), "blocking")).toBe(false);
    const result = await host.nativeReview(params);
    expect(host.nativeCalls).toBe(1); expect(host.finalCalls).toEqual(["actual-native-task-id"]);
    expect(host.child?.events).not.toBe(host.events); expect(host.providerCalls).toBe(1);
    expect(JSON.stringify(host.projected)).not.toContain("PRIVATE"); expect(JSON.stringify(host.projected)).not.toContain('"name":"bash"');
    expect(host.receipts).toHaveLength(1); expect(host.receipts[0].provenance.parentToolCallId).toBe("actual-native-task-id");
    expect(host.receipts[0].authority).toBe("none"); expect(Object.isFrozen(host.receipts[0].assessment)).toBe(true);
    expect(await host.registration.reviews(host.context)).toEqual([]);
    host.persistNativeResult(result);
    expect(await host.registration.reviews(host.context)).toHaveLength(1);
    await host.emit("turn_end", {}); expect(await host.registration.reviews(host.context)).toHaveLength(1);
    const cached = await host.prepare(); expect(cached.status).toBe("ready"); expect(cached.cachedSourceReceipt).toBe(true);
    expect(host.nativeCalls).toBe(1); expect(host.continuations).toHaveLength(1);
  });
  test.each([{ outerError: true }, { asyncAck: true }, { malformedError: "false" }])("rejects zero-child-exit under invalid outer envelope %j", async options => {
    const host = new AdvisorHostFixture(); await host.start(); const pending = await host.prepare();
    const result = await host.nativeReview(object(pending.parameters), options); host.persistNativeResult(result);
    expect(host.providerCalls).toBe(1); expect(host.receipts).toEqual([]); expect(await host.registration.reviews(host.context)).toEqual([]);
  });
  test("later outer error or conflicting duplicate invalidates host receipts without selecting a favorable row", async () => {
    const host = new AdvisorHostFixture(); await host.start(); const pending = await host.prepare();
    const result = await host.nativeReview(object(pending.parameters)); host.persistNativeResult(result);
    expect(await host.registration.reviews(host.context)).toHaveLength(1);
    host.persistNativeResult(result, { isError: true });
    expect(await host.registration.reviews(host.context)).toEqual([]);
    await host.emit("tool_result", { toolName: "task", toolCallId: "actual-native-task-id", isError: true, details: object(result).details });
    expect(await host.registration.reviews(host.context)).toEqual([]); expect((await host.prepare()).status).not.toBe("ready");
  });
  test.each([{ parentSessionOverride: "D:/another-private-SDK/Main.jsonl" }, { providerApi: "devin-agent" }])("rejects foreign ancestry/unsupported payload mediation before provider dispatch %j", async options => {
    const host = new AdvisorHostFixture(); await host.start(); const pending = await host.prepare();
    await host.nativeReview(object(pending.parameters), options);
    expect(host.providerCalls).toBe(0); expect(host.child?.aborted).toBeGreaterThan(0); expect(host.receipts).toEqual([]);
  });
  test("cannot dispatch guessed Advisor or eval requests and preserves ordinary native task behavior", async () => {
    const host = new AdvisorHostFixture(); await host.start();
    expect(object(await host.emit("before_subagent_spawn", { agent: "advisor", invocationKind: "eval" })).block).toBe(true);
    expect(object(await host.emit("before_subagent_spawn", { agent: "advisor", invocationKind: "task" })).block).toBe(true);
    let calls = 0; const original = { content: [{ type: "text", text: "ordinary native bookkeeping" }], details: { ordinary: true } };
    const params = { tasks: [{ agent: "scout", task: "Ordinary non-review task" }] };
    const result = await host.tools.get("task")!.execute("ordinary-id", params, undefined, undefined, { ...host.context,
      invokeTool: async actual => { expect(actual).toBe(params); calls++; return original; } });
    expect(calls).toBe(1); expect(result).toBe(original); expect(host.finalCalls).toEqual([]);
  });
  test("actual branch changes invalidate cached reviews; shutdown does not erase settled applicable source history", async () => {
    const host = new AdvisorHostFixture(); await host.start(); const pending = await host.prepare();
    const result = await host.nativeReview(object(pending.parameters)); host.persistNativeResult(result);
    await host.emit("session_tree", {}); expect(await host.registration.reviews(host.context)).toEqual([]);
    expect((await host.prepare()).status).toBe("REVIEW_REQUIRED");
  });
  test("separate Main registries cannot consume another actual session's provisional native prompt", async () => {
    const first = new AdvisorHostFixture("session-one"); const second = new AdvisorHostFixture("session-two"); await first.start(); await second.start();
    const pending = await first.prepare(); const response = await second.nativeReview(object(pending.parameters));
    expect(advisorValue(response).status).toBe("UNAVAILABLE"); expect(second.nativeCalls).toBe(0); expect(second.receipts).toEqual([]);
  });
});
