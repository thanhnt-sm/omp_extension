import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createContractRuntime, type ContractRuntime } from "../src/contract-runtime";
import { createTaskEvidenceRuntime, type TaskEvidenceRuntime, type TaskEvidenceRecord } from "../src/task-evidence-runtime";
import type { AdvisorHostContext } from "../src/advisor-host";
import type { HostHistoryEntry } from "../src/host-history";
import { createHostToolInvocationRuntime, type HostToolInvocationRuntime } from "../src/host-tool-invocation";

export interface ReadonlyVerificationFixture {
  cwd: string;
  task: string;
  context: AdvisorHostContext;
  entries: HostHistoryEntry[];
  contracts: ContractRuntime;
  evidence: TaskEvidenceRuntime;
  invocations: HostToolInvocationRuntime;
  record: TaskEvidenceRecord;
  policyDigest: string;
  appendEntry(customType: string, data: unknown): void;
  appendCall(name: string, id: string, params: Record<string, unknown>): void;
  appendResult(name: string, id: string, details: unknown, isError?: boolean): void;
  dispose(): Promise<void>;
}

/** Real local source/contract/evidence factories; simulated SDK history is not a live host/native claim. */
export async function readonlyVerificationFixture(): Promise<ReadonlyVerificationFixture> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-task-runtime-"));
  const task = "Investigate the parser boundary and write reports/cause.md";
  const policyDigest = "a".repeat(64);
  const entries: HostHistoryEntry[] = [];
  function append(entry: Omit<HostHistoryEntry, "id" | "parentId">): void {
    entries.push({ ...entry, id: `entry-${entries.length}`, ...(entries.length ? { parentId: entries[entries.length - 1].id } : {}) });
  }
  const context: AdvisorHostContext = { cwd, agent: { kind: "main", id: "parent", name: "parent" }, advisorSessionEpoch: "fixture-epoch",
    abort() { throw new Error("Unexpected abort in local source fixture"); },
    sessionManager: { getSessionId: () => "fixture-session", getBranch: () => entries, getHeader: () => null, getSessionFile: () => undefined } };
  const appendEntry = (customType: string, data: unknown) => append({ type: "custom", customType, data });
  const invocations = createHostToolInvocationRuntime(appendEntry);
  const appendCall = (name: string, id: string, params: Record<string, unknown>) => append({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name, id, arguments: params }] } });
  const appendResult = (name: string, id: string, details: unknown, isError = false) => append({ type: "message", message: { role: "toolResult", toolName: name, toolCallId: id, isError, details, content: [{ type: "text", text: "Offline fixture result; no provider/child/native completion proof is supplied." }] } });
  try {
    await fs.mkdir(path.join(cwd, "reports"));
    await fs.writeFile(path.join(cwd, "reports/cause.md"), `Task: ${task}\n\n## Findings\nThe parser boundary needs actual finite Noul values, not Choice confidence.\n\n## Evidence\nThe report records the observed representation mismatch and preserves missing live-host evidence.\n`, "utf8");
    append({ type: "message", message: { role: "user", content: [{ type: "text", text: task }] } });
    appendCall("todo", "init-call", { op: "init", list: [{ phase: "Investigation", items: [task] }] });
    appendResult("todo", "init-call", { op: "init", phases: [{ name: "Investigation", tasks: [{ content: task, status: "in_progress" }] }], completedTasks: [] });
    const contracts = createContractRuntime({ appendEntry, policyDigest, approvedCommandIds: [], invocations });
    const bind = { task, phase: "Investigation" };
    appendCall("typesafe_bind_task", "bind-call", bind);
    const bound = await invocations.run(context, "typesafe_bind_task", "bind-call", bind, () => contracts.bind(context, "bind-call", bind));
    if (bound.status !== "BOUND") throw new Error(`Source fixture binding prerequisite: ${bound.reasons.join("; ")}`);
    appendResult("typesafe_bind_task", "bind-call", { status: bound.status });
    const evidence = createTaskEvidenceRuntime({ contracts, commands: () => new Map(), invocations });
    const collection = { ...bind, artifactPaths: ["reports/cause.md"] };
    appendCall("typesafe_collect_evidence", "collect-call", collection);
    const collected = await invocations.run(context, "typesafe_collect_evidence", "collect-call", collection, () => evidence.collect(context, "collect-call", collection));
    if (!collected.record || collected.status !== "COLLECTED") throw new Error(`Source fixture collection prerequisite: ${collected.reasons.join("; ")}`);
    appendResult("typesafe_collect_evidence", "collect-call", { status: collected.status });
    return { cwd, task, context, entries, contracts, evidence, invocations, record: collected.record, policyDigest, appendEntry, appendCall, appendResult,
      async dispose() { evidence.clear(context); await fs.rm(cwd, { recursive: true, force: true }); } };
  } catch (error) { await fs.rm(cwd, { recursive: true, force: true }); throw error; }
}
