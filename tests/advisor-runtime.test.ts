import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAdvisorRequest } from "../src/advisor-protocol";
import { contractDigest } from "../src/task-contract-source";
import { createAdvisorRuntime } from "../src/advisor-runtime";
import { advisorOutputSchema, type AdvisorJournalRecord } from "../src/advisor-protocol";
import type { AdvisorChildContext } from "../src/advisor-guards";
import { advisorFixture, responsesPayload, validAssessment } from "./advisor-fixtures";
import { nativeAdvisorPrompt } from "../src/advisor-native-prompt";

function harness() {
  const { request } = advisorFixture(); const journal: AdvisorJournalRecord[] = []; const continuations: string[] = [];
  const runtime = createAdvisorRuntime({ capabilities: { childContext: true, providerPayload: true, toolCall: true, toolResult: true, actualChildIdentity: true, providerOnPayload: true, guardedReadExecution: true }, append: entry => journal.push(entry), continueParent: id => continuations.push(id) });
  const child: AdvisorChildContext = { agent: { kind: "sub", id: "real-allocated-child", name: "advisor", parentId: "parent" }, model: { api: "openai-codex-responses", provider: "openai-codex", id: "gpt-fixture" }, sessionEpoch: "epoch" };
  const data = validAssessment();
  const item = { agent: "advisor", task: request.publicPrompt, outputSchema: advisorOutputSchema, schemaMode: "strict" };
  const single = { index: 0, id: child.agent.id, agent: "advisor", agentSource: "project", task: nativeAdvisorPrompt(request.publicPrompt), assignment: request.publicPrompt, exitCode: 0, structuredOutput: { source: "caller", mode: "strict", status: "valid", data } };
  function observe() {
    runtime.childContext(child, [{ role: "user", content: nativeAdvisorPrompt(request.publicPrompt) }]);
    runtime.providerPayload(child, structuredClone(responsesPayload));
    runtime.toolCall(child, { toolName: "yield", input: { data } });
    runtime.toolResult(child, { toolName: "yield", isError: false, details: { status: "success", data } });
  }
  return { runtime, request, journal, continuations, child, data, item, single, observe };
}
describe("blocking native Advisor finality", () => {
  test("only a successful actual settled native outer envelope issues one immutable receipt", async () => {
    const h = harness(); expect(h.runtime.prepare(h.request).status).toBe("pending");
    const envelope = { isError: false, details: { results: [h.single] } };
    const actual = await h.runtime.executeNativeTask("task-call", { context: "", tasks: [h.item] }, undefined, undefined, { invokeTool: async () => { h.observe(); return envelope; } });
    expect(actual).toBe(envelope); expect(h.runtime.currentReceipt(h.request.requestId)?.provenance.childId).toBe("real-allocated-child");
    expect(h.continuations).toHaveLength(1); expect(h.runtime.prepare(h.request).status).toBe("ready");
    expect(h.runtime.currentReceipt(h.request.requestId)?.authority).toBe("none");
  });
  for (const kind of ["outer-error", "async-ack", "child-error", "abort", "retry-failure", "foreign-child", "foreign-index", "wrong-source", "wrong-schema", "duplicate-result"] as const) {
    test(`rejects ${kind} even after valid provisional yield`, async () => {
      const h = harness(); h.runtime.prepare(h.request);
      const result = { ...h.single, ...(kind === "child-error" ? { error: "failed" } : {}), ...(kind === "abort" ? { aborted: true } : {}), ...(kind === "retry-failure" ? { retryFailure: { reason: "failed" } } : {}),
        ...(kind === "foreign-child" ? { id: "requested-name-not-allocation" } : {}), ...(kind === "foreign-index" ? { index: 1 } : {}), ...(kind === "wrong-source" ? { agentSource: "user" } : {}),
        ...(kind === "wrong-schema" ? { structuredOutput: { ...h.single.structuredOutput, source: "session" } } : {}) };
      await h.runtime.executeNativeTask("task-call", { context: "", tasks: [h.item] }, undefined, undefined, { invokeTool: async () => {
        h.observe(); return { isError: kind === "outer-error", details: { results: kind === "duplicate-result" ? [result, result] : [result], ...(kind === "async-ack" ? { async: { state: "running", jobId: "ack-job" } } : {}) } };
      } });
      expect(h.runtime.currentReceipt(h.request.requestId)).toBeUndefined(); expect(h.continuations).toHaveLength(0);
    });
  }
  test("a late native isolation wrapper throw cannot mint receipt", async () => {
    const h = harness(); h.runtime.prepare(h.request);
    await expect(h.runtime.executeNativeTask("task-call", { tasks: [h.item] }, undefined, undefined, { invokeTool: async () => { h.observe(); throw new Error("patch wrapper failed after completed executor"); } })).rejects.toThrow();
    expect(h.runtime.currentReceipt(h.request.requestId)).toBeUndefined(); expect(h.continuations).toHaveLength(0);
  });
  test("pasted assessment without observed actual child/provider/yield never settles", async () => {
    const h = harness(); h.runtime.prepare(h.request);
    await h.runtime.executeNativeTask("task-call", { tasks: [h.item] }, undefined, undefined, { invokeTool: async () => ({ details: { results: [h.single] } }) });
    expect(h.runtime.currentReceipt(h.request.requestId)).toBeUndefined();
  });
  test("ordinary nonreview tasks preserve native parameters/result/bookkeeping", async () => {
    const h = harness(); const params = { tasks: [{ agent: "sonic", task: "ordinary task" }], context: "normal" }; const result = { details: { ordinary: true } };
    let captured: unknown;
    expect(await h.runtime.executeNativeTask("ordinary", params, undefined, undefined, { invokeTool: async actual => { captured = actual; return result; } })).toBe(result);
    expect(captured).toBe(params); expect(h.journal).toHaveLength(0);
  });
  test("missing provider mediation prevents dispatch preparation", () => {
    const { request } = advisorFixture();
    const runtime = createAdvisorRuntime({ capabilities: { childContext: true, providerPayload: true, toolCall: true, toolResult: true, actualChildIdentity: true, providerOnPayload: false, guardedReadExecution: true }, append: () => {}, continueParent: () => {} });
    expect(runtime.prepare(request)).toEqual({ status: "UNAVAILABLE", reasons: ["advisor_host_providerOnPayload_required"] });
  });
  test("default-denies every private path, URI, query, eval and additive tool before execution", async () => {
    const h = harness(); h.runtime.prepare(h.request); let reads = 0;
    await h.runtime.executeNativeTask("task-call", { tasks: [h.item] }, undefined, undefined, { invokeTool: async () => {
      h.runtime.childContext(h.child, [{ role: "user", content: nativeAdvisorPrompt(h.request.publicPrompt) }]);
      for (const [toolName, input] of [["read", { path: "C:/Users/private/.claude/settings.json" }], ["read", { path: "history://session" }], ["read", { path: "src/link/private" }], ["grep", { pattern: "key" }], ["glob", {}], ["bash", { command: "cat private" }], ["eval", { code: "spawn()" }], ["task", {}], ["web_search", { query: "private source" }], ["write", { path: "xd://typesafe_judge" }], ["new_readonly_tool", {}]] as const) {
        const decision = h.runtime.toolCall(h.child, { toolName, input }); if (!decision?.block) reads++;
        expect(decision?.block).toBe(true);
      }
      return { isError: true };
    } });
    expect(reads).toBe(0);
  });
  test("Responses provider receives no automatic context, metadata, private catalog or replay", async () => {
    const h = harness(); h.runtime.prepare(h.request);
    await h.runtime.executeNativeTask("task-call", { tasks: [h.item] }, undefined, undefined, { invokeTool: async () => {
      const context = h.runtime.childContext(h.child, [{ role: "user", content: nativeAdvisorPrompt(h.request.publicPrompt) }, { role: "system", content: "PRIVATE HOME" }]);
      const payload = h.runtime.providerPayload(h.child, { ...responsesPayload, previous_response_id: "private-response", client_metadata: { secret: "PRIVATE" } });
      expect(JSON.stringify(context)).not.toContain("PRIVATE"); expect(JSON.stringify(payload)).not.toContain("PRIVATE");
      expect(payload?.tools).toHaveLength(1); expect(payload?.store).toBe(false);
      return { isError: true };
    } });
  });
  test("unbound advisor actual identity and unsupported payload are rejected", () => {
    const h = harness();
    expect(() => h.runtime.childContext(h.child, [{ role: "user", content: "forged prompt" }])).toThrow("advisor_unbound");
    expect(() => h.runtime.providerPayload(h.child, { hidden: "private" })).toThrow("advisor_unbound");
  });
  test("turn restoration preserves receipt and invalidates forks", async () => {
    const h = harness(); h.runtime.prepare(h.request);
    await h.runtime.executeNativeTask("task-call", { tasks: [h.item] }, undefined, undefined, { invokeTool: async () => { h.observe(); return { details: { results: [h.single] } }; } });
    h.runtime.restore(h.journal, { sessionId: "session", sessionEpoch: "epoch" });
    expect(h.runtime.currentReceipt(h.request.requestId)).toBeDefined();
    h.runtime.invalidateBranch("session", "fork-epoch");
    expect(h.runtime.currentReceipt(h.request.requestId)).toBeUndefined();
  });
  test("guarded authorized tail reads of a large source reach the real provider context", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "advisor-read-"));
    try {
      mkdirSync(path.join(root, "src"));
      const source = `${"public data\n".repeat(7000)}TAIL_INTEGRATION_DEFECT\n`;
      writeFileSync(path.join(root, "src/public.ts"), source);
      const h = harness(); const original = advisorFixture();
      const request = createAdvisorRequest({ ...h.request, scope: { ...h.request.scope, workspaceRoot: root, files: [{ path: "src/public.ts", sha256: contractDigest(source) }] } }, original.context);
      h.runtime.prepare(request);
      await h.runtime.executeNativeTask("task-call", { context: "", tasks: [h.item] }, undefined, undefined, { invokeTool: async () => {
        h.runtime.childContext(h.child, [{ role: "user", content: nativeAdvisorPrompt(request.publicPrompt) }]);
        const input = { path: "src/public.ts:7001-7001" };
        expect(h.runtime.toolCall(h.child, { toolName: "read", toolCallId: "read-tail", input })).toBeUndefined();
        const result = h.runtime.executeReadOnlyTool("read", input, h.child, "read-tail");
        expect(result?.isError).toBe(false); expect(JSON.stringify(result?.content)).toContain("TAIL_INTEGRATION_DEFECT");
        h.runtime.toolResult(h.child, { toolName: "read", toolCallId: "read-tail", ...result });
        const payload = h.runtime.providerPayload(h.child, { ...responsesPayload, tools: [...responsesPayload.tools, { type: "function", name: "read", parameters: { type: "object", properties: { path: { type: "string" } } } }] });
        expect(JSON.stringify(payload?.input)).toContain("TAIL_INTEGRATION_DEFECT");
        expect(JSON.stringify(payload)).not.toContain("PRIVATE");
        h.runtime.toolCall(h.child, { toolName: "yield", input: { data: h.data } });
        h.runtime.toolResult(h.child, { toolName: "yield", details: { status: "success", data: h.data } });
        return { details: { results: [h.single] } };
      } });
      expect(h.runtime.currentReceipt(request.requestId)).toBeDefined();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
