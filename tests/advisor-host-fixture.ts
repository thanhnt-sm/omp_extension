// Offline SDK control-flow fixture only: no child, model, provider, API, or host proof is fabricated for production.
import { registerAdvisorHost, type AdvisorHostAPI, type AdvisorHostExecuteContext, type AdvisorHostServices, type AdvisorHostRegistration, type AdvisorRequestDraft } from "../src/advisor-host";
import type { AdvisorHostToolDefinition, AdvisorHostToolInfo } from "../src/advisor-host-types";
import { createAdvisorRequest, record, type AdvisorReceipt } from "../src/advisor-protocol";
import { advisorFixture, responsesPayload, validAssessment } from "./advisor-fixtures";
import { nativeAdvisorPrompt } from "../src/advisor-native-prompt";

export function object(value: unknown): Record<string, unknown> { if (!record(value)) throw new Error("fixture_object_required"); return value; }
export function advisorValue(result: unknown): Record<string, unknown> { return object(object(object(result).details).advisor); }
export class AdvisorHostFixture {
  readonly events = {}; readonly tools = new Map<string, AdvisorHostToolDefinition>();
  readonly nativeSchemas = new Map<string, object>(); readonly infos = new Map<string, AdvisorHostToolInfo>();
  readonly handlers = new Map<string, Array<(event: unknown, context: AdvisorHostExecuteContext) => unknown | Promise<unknown>>>();
  readonly entries: unknown[] = []; readonly receipts: AdvisorReceipt[] = []; readonly finalCalls: string[] = []; readonly continuations: unknown[] = [];
  readonly context: AdvisorHostExecuteContext; readonly api: AdvisorHostAPI; readonly registration: AdvisorHostRegistration;
  readonly services: AdvisorHostServices; pending: AdvisorHostToolDefinition[] = []; active = ["task", "read", "grep", "glob", "yield", "bash"];
  started = false; aborted = 0; getAllDuringLoad = 0; nativeCalls = 0; nativeReads = 0; providerCalls = 0; child?: AdvisorHostFixture; projected?: unknown;
  constructor(readonly sessionId = "session", parent?: AdvisorHostFixture, parentSessionOverride?: string) {
    const file = `D:/host-fixture/${sessionId}.jsonl`;
    const sessionManager = { getSessionId: () => sessionId, getSessionFile: () => file,
      getHeader: () => ({ parentSession: parent ? parentSessionOverride ?? parent.context.sessionManager.getSessionFile() : undefined }), getBranch: () => this.entries };
    this.context = { cwd: "D:/workspace", agent: parent ? { kind: "sub", id: `allocated-${sessionId}`, name: "advisor", parentId: parent.context.agent.id } : { kind: "main", id: "Main", name: "Main" },
      model: { api: "openai-codex-responses", id: "offline-control-fixture", provider: "offline-fixture" }, sessionManager, abort: () => { this.aborted++; } };
    const primitive = () => ({ optional: () => ({ optional: true }) });
    this.api = { events: this.events, zod: { object: shape => ({ shape }), string: primitive, unknown: primitive },
      on: (name, handler) => { this.handlers.set(name, [...this.handlers.get(name) ?? [], handler]); },
      registerTool: definition => { this.tools.set(definition.name, definition); if (this.started) this.pending.push(definition); },
      getAllTools: () => { if (!this.started) { this.getAllDuringLoad++; throw new Error("SDK_load_phase_action_unavailable"); } return [...this.infos.values()]; },
      getActiveTools: () => [...this.active], setActiveTools: async names => { for (const definition of this.pending) this.infos.set(definition.name, { name: definition.name, description: definition.description, parameters: definition.parameters, sourceInfo: { source: "extension", path: definition.sourcePath ?? "" } }); this.pending = []; this.active = [...names]; },
      appendEntry: (customType, data) => { this.appendHistory({ type: "custom", customType, data: structuredClone(data) }); },
      sendMessage: (message, options) => { this.continuations.push({ message, options }); } };
    for (const name of this.active) {
      const item = { agent: { type: "string" }, task: { type: "string" }, solutionSpace: { type: "string" }, outputSchema: {}, schemaMode: { enum: ["permissive", "strict"] } };
      const parameters = { type: "object", nativeSchemaIdentity: name, ...(name === "task" ? { properties: { context: { type: "string" }, tasks: { type: "array", items: { type: "object", properties: item } } } } : {}) };
      this.nativeSchemas.set(name, parameters); this.infos.set(name, { name, description: `native ${name}`, parameters, sourceInfo: { source: "builtin", path: `<builtin:${name}>` } });
    }
    this.services = {
      prepareReview: (_params, context, mode) => {
        const base = advisorFixture(mode === "consultation" ? "consultation" : "task_review").request;
        const { requestId: _id, requestDigest: _digest, bindingDigest: _binding, promptDigest: _prompt, parentToolCallId: _call, itemIndex: _index, ...draft } = base;
        const binding = { ...draft.binding, provenance: { ...draft.binding.provenance, sessionId: context.sessionManager.getSessionId() } };
        return { ...draft, binding, sessionEpoch: context.advisorSessionEpoch, parentAgentId: context.agent.id };
      },
      createTaskRequest: (_params, context, id, preparation) => this.finalize(preparation.draft, context, id, preparation.itemIndex),
      createConsultationRequest: (_params, context, id, preparation) => this.finalize(preparation.draft, context, id, preparation.itemIndex),
      isCurrent: () => true,
      onReceipt: receipt => { this.receipts.push(receipt); },
    };
    this.registration = registerAdvisorHost(this.api, this.services);
  }
  finalize(draft: AdvisorRequestDraft, context: AdvisorHostExecuteContext | { sessionManager: AdvisorHostExecuteContext["sessionManager"] }, id: string, itemIndex: number) {
    this.finalCalls.push(id); const fixture = advisorFixture(draft.binding.purpose === "consultation" ? "consultation" : "task_review");
    return createAdvisorRequest({ ...draft, parentToolCallId: id, itemIndex }, { ...fixture.context, sessionId: context.sessionManager.getSessionId(), purpose: draft.binding.purpose, expectedProvenance: draft.binding.provenance });
  }
  async emit(name: string, event: unknown, context = this.context): Promise<unknown> {
    let result: unknown;
    for (const handler of this.handlers.get(name) ?? []) { const next = await handler(event, context); if (next !== undefined) result = next; }
    return result;
  }
  async start() { this.started = true; await this.emit("session_start", {}); }
  async prepare(params: Record<string, unknown> = {}, consultation = true): Promise<Record<string, unknown>> {
    const definition = this.tools.get(consultation ? "typesafe_advisor" : "typesafe_prepare_advisor")!;
    return advisorValue(await definition.execute("prepare-call-not-task-id", { question: "Independent source review", ...params }, undefined, undefined, this.context));
  }
  async nativeReview(parameters: Record<string, unknown>, options: { outerError?: boolean; asyncAck?: boolean; parentSessionOverride?: string; malformedError?: unknown; providerApi?: string } = {}): Promise<unknown> {
    const definition = this.tools.get("task")!;
    this.appendHistory({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "task", id: "actual-native-task-id", arguments: structuredClone(parameters) }] } });
    return definition.execute("actual-native-task-id", parameters, undefined, undefined, { ...this.context, invokeTool: async nativeParams => {
      this.nativeCalls++;
      const spawn = await this.emit("before_subagent_spawn", { agent: "advisor", invocationKind: "task", spawnKey: "actual-native-task-id:0" });
      if (record(spawn) && spawn.block) return { isError: true, content: [{ type: "text", text: "spawn blocked" }], details: { results: [] } };
      const child = new AdvisorHostFixture(`${this.sessionId}-child`, this, options.parentSessionOverride); this.child = child;
      if (options.providerApi) child.context.model = { api: options.providerApi };
      await child.start();
      const task = object((nativeParams.tasks as unknown[])[0]);
      try {
        await child.emit("before_agent_start", { prompt: nativeAdvisorPrompt(String(task.task)) });
        await child.emit("context", { messages: [{ role: "system", content: "PRIVATE AMBIENT" }] });
        this.projected = await child.emit("before_provider_request", { payload: responsesPayload }); this.providerCalls++;
        const assessment = validAssessment();
        await child.emit("tool_call", { toolName: "yield", toolCallId: "actual-yield", input: { data: assessment } });
        await child.emit("tool_result", { toolName: "yield", toolCallId: "actual-yield", input: { data: assessment }, details: { status: "success", data: assessment }, isError: false });
        const result = { index: 0, id: child.context.agent.id, agent: "advisor", agentSource: "project", task: nativeAdvisorPrompt(String(task.task)), assignment: task.task, exitCode: 0,
          structuredOutput: { source: "caller", mode: "strict", status: "valid", data: assessment } };
        return { ...(options.outerError ? { isError: true } : options.malformedError !== undefined ? { isError: options.malformedError } : {}),
          content: [{ type: "text", text: "offline native control envelope" }], details: { results: [result], ...(options.asyncAck ? { async: { jobId: "running-job" } } : {}) } };
      } catch { return { isError: true, content: [{ type: "text", text: "child mediation denied" }], details: { results: [] } }; }
    } });
  }
  persistNativeResult(result: unknown, patch: Record<string, unknown> = {}) {
    const envelope = object(result);
    this.appendHistory({ type: "message", message: { role: "toolResult", toolName: "task", toolCallId: "actual-native-task-id", content: envelope.content, details: envelope.details, isError: envelope.isError, ...patch } });
  }
  appendHistory(entry: Record<string, unknown>) {
    const previous = this.entries.at(-1);
    this.entries.push({ ...entry, id: `${this.sessionId}-entry-${this.entries.length + 1}`, parentId: record(previous) ? previous.id : null });
  }
}
