import { describe, expect, test } from "bun:test";
import {
  canonicalDigest, contractDigest, contractRevisionDigest, createContractHistoryRecord, createTaskContract,
  nativeTaskSourceUri, nativeTodoInputDigest, normalizeNativeTodoInput, normalizeNativeTodoPointer, projectContractHistory,
  readNativeTodoOperation, reviseTaskContract, validateNativeTodoTransition, validateReviewBinding,
  type AllowedMutationScope, type ContractAuthority, type ContractHistoryContext, type ContractReference,
  type CreateTaskContractInput, type HostReference, type ProjectedNativePhase, type ReviewBinding,
  type ReviewBindingContext, type TaskContract,
} from "../src/task-contract";

const plan = [
  "# Approved plan", "## Phase One", "### Requirements", "- Keep real native completions.",
  "  Including imported lifecycle snapshots.", "### Success Criteria", "- [ ] Never export private thinking.",
  "### Worklog", "- [x] This is not acceptance.", "## Phase Two", "### Requirements", "- Unrelated second phase.",
].join("\n");
const requestText = "Execute the explicitly approved Phase One of plans/approved.md.";
const scope: AllowedMutationScope = { paths: ["src/**"], operations: ["read", "modify"] };
const policyDigest = contractDigest("frozen policy");
const request: HostReference = { kind: "user_request", sessionId: "session", entryId: "user-1", digest: contractDigest(requestText) };
const amendment: HostReference = { kind: "user_amendment", sessionId: "session", entryId: "user-2", digest: contractDigest("Add an obligation") };
interface TestEntry {
  id: string; parentId: string | null; type: string; customType?: string; data?: unknown;
  message?: { role: string; content?: unknown[]; toolName?: string; toolCallId?: string; isError?: boolean; details?: unknown };
}

function fixture() {
  const entries: TestEntry[] = [{ id: "user-1", parentId: null, type: "message", message: { role: "user", content: [{ type: "text", text: requestText }] } }];
  const sources = new Map([[contractDigest(plan), plan]]);
  const hostEntries = new Set<string>();
  const context: ContractHistoryContext = {
    sessionId: "session", branchId: "origin",
    isHostOwnedEntry: (id) => hostEntries.has(id),
    validateReference: (reference) => entries.some((entry) => entry.id === reference.entryId)
      && (canonicalDigest(reference) === canonicalDigest(request) || canonicalDigest(reference) === canonicalDigest(amendment)),
    validateSourceSpan(span) {
      const text = sources.get(span.digest);
      return text !== undefined && span.path === "plans/approved.md" && span.startLine > 0 && span.endLine >= span.startLine
        && text.split("\n").slice(span.startLine - 1, span.endLine).join("\n") === span.text;
    },
    validateContract: (contract) => canonicalDigest(contract.allowedMutationScope) === canonicalDigest(scope) && contract.policyDigest === policyDigest,
  };
  const authority: ContractAuthority = {
    validateReference: context.validateReference,
    validateCreation: (creation, target) => projectContractHistory(entries, context).incarnations.some((reference) => reference.creationKnown
      && canonicalDigest(reference.creation) === canonicalDigest(creation) && canonicalDigest(reference.target) === canonicalDigest(target)),
    validateProposal: (input) => input.source.path === "plans/approved.md" && sources.get(input.source.digest) === input.source.text
      && canonicalDigest(input.allowedMutationScope) === canonicalDigest(scope) && input.taskKind === "implementation"
      && input.approvedCommandIds.every((id) => id === "affected-tests"),
  };
  function native(id: string, input: Record<string, unknown>, phases: ProjectedNativePhase[]) {
    const before = projectContractHistory(entries, context).nativePhases;
    const snapshot = structuredClone(phases);
    if (input.op !== "view") normalizeNativeTodoPointer(snapshot);
    const completedTasks = input.op === "view" ? [] : snapshot.flatMap((phase) => phase.tasks.flatMap((task) => {
      const previous = before?.find((candidate) => candidate.name === phase.name)?.tasks.find((candidate) => candidate.content === task.content);
      return task.status === "completed" && previous && previous.status !== "completed" ? [{ phase: phase.name, content: task.content }] : [];
    }));
    entries.push({ id: `call-${id}`, parentId: entries[entries.length - 1].id, type: "message", message: {
      role: "assistant", content: [{ type: "toolCall", id, name: "todo", arguments: input }],
    } });
    entries.push({ id: `result-${id}`, parentId: `call-${id}`, type: "message", message: {
      role: "toolResult", toolName: "todo", toolCallId: id, isError: false,
      details: { op: input.op, phases: snapshot, ...(completedTasks.length ? { completedTasks } : {}) },
    } });
  }
  function contract(overrides: Partial<CreateTaskContractInput> = {}) {
    const native = projectContractHistory(entries, context).incarnations[0];
    return createTaskContract({ source: { kind: "plan", path: "plans/approved.md", text: plan, digest: contractDigest(plan), phaseHeading: "Phase One", approval: request },
      originalUserRequest: request, creation: native.creation, target: native.target, taskKind: "implementation", allowedMutationScope: scope,
      approvedCommandIds: ["affected-tests"], parentRequirements: [], policyDigest, authority, ...overrides });
  }
  function persist(contract: TaskContract, id = "contract-1") {
    entries.push({ id, parentId: entries[entries.length - 1].id, type: "custom", customType: "omp.typesafe.contract.v1",
      data: createContractHistoryRecord(context, id, contract.creation.entryId, { kind: "contract", contract }) });
    hostEntries.add(id);
  }
  function approveAmendment() {
    entries.push({ id: "user-2", parentId: entries[entries.length - 1].id, type: "message",
      message: { role: "user", content: [{ type: "text", text: "Add an obligation" }] } });
  }
  native("init", { op: "init", phase: "P", items: ["A"] }, [{ name: "P", tasks: [{ content: "A", status: "pending" }] }]);
  return { entries, sources, hostEntries, context, authority, native, contract, persist, approveAmendment };
}

function reviewContext(contract: TaskContract): ReviewBindingContext {
  return {
    sessionId: "session", branchId: "origin", purpose: "task_review", contract, logicalOperationId: "done-1", authorizedScope: scope,
    validateReference: (reference) => canonicalDigest(reference) === canonicalDigest(request),
    expectedProvenance: { sessionId: "session", branchId: "origin", requestEntryId: "user-1", dispatchId: "dispatch-1",
      questionDigest: contractDigest("question"), evidenceDigest: contractDigest("evidence"), policyDigest, resultCallId: "result-call" },
  };
}
function taskBinding(contract: TaskContract, context = reviewContext(contract)): ReviewBinding {
  const reference: ContractReference = { contractId: contract.contractId, revisionId: contract.revisionId, incarnationId: contract.incarnationId };
  return { purpose: "task_review", contract: reference, target: contract.target, logicalOperationId: "done-1", provenance: context.expectedProvenance, authorizedScope: scope };
}

describe("explicit host-owned task contracts", () => {
  test("selects only exact phase criteria with original lines and stable IDs", () => {
    const f = fixture();
    const contract = f.contract();
    expect(contract.criteria.map((criterion) => criterion.text)).toEqual(["Keep real native completions.\nIncluding imported lifecycle snapshots.", "Never export private thinking."]);
    expect(contract.criteria[0].source).toMatchObject({ startLine: 4, endLine: 5, text: "- Keep real native completions.\n  Including imported lifecycle snapshots." });
    expect(f.contract().criteria.map((criterion) => criterion.id)).toEqual(contract.criteria.map((criterion) => criterion.id));
    expect(contract.approvedSource.digest).toBe(contractDigest(plan));
    expect(Object.isFrozen(contract.criteria)).toBe(true);
  });

  test("rejects stale source digests, unspecified phases, ambiguous headings and placeholders", () => {
    const f = fixture();
    const source = f.contract().approvedSource;
    const base = { ...source, text: plan };
    expect(() => f.contract({ source: { ...base, text: `${plan}\nchanged` } })).toThrow("host_authority");
    expect(() => f.contract({ source: { ...base, phaseHeading: undefined } })).toThrow("explicit_phase");
    const ambiguous = `${plan}\n## Phase One\n### Requirements\n- Other criterion.`;
    f.sources.set(contractDigest(ambiguous), ambiguous);
    expect(() => f.contract({ source: { ...base, text: ambiguous, digest: contractDigest(ambiguous) } })).toThrow("ambiguous");
    const placeholder = "## Phase One\n### Requirements\n- TODO";
    f.sources.set(contractDigest(placeholder), placeholder);
    expect(() => f.contract({ source: { ...base, text: placeholder, digest: contractDigest(placeholder) } })).toThrow("placeholder");
  });

  test("a valid source hash is not approval of kind, scope or commands", () => {
    const f = fixture();
    expect(() => f.contract({ taskKind: "research" })).toThrow("host_authority");
    expect(() => f.contract({ allowedMutationScope: { paths: ["**"], operations: ["delete"] } })).toThrow("host_authority");
    expect(() => f.contract({ approvedCommandIds: ["unapproved-command"] })).toThrow("host_authority");
    expect(() => f.contract({ originalUserRequest: { ...request, entryId: "forged" } })).toThrow("host_authority");
  });

  test("non-plan work binds actual original request without generic code/test criteria", () => {
    const f = fixture();
    f.sources.set(contractDigest(requestText), requestText);
    const contract = f.contract({ source: { kind: "user_request", path: "plans/approved.md", text: requestText, digest: contractDigest(requestText), approval: request } });
    expect(contract.criteria).toHaveLength(1);
    expect(contract.criteria[0]).toMatchObject({ kind: "original_request", text: requestText });
  });

  test("delegated native work binds exact host creation, not a copy of the whole user objective", () => {
    const f = fixture();
    const reference = projectContractHistory(f.entries, f.context).incarnations[0];
    const parentCriterion = f.contract().criteria[0];
    const parentRequirements = [{ parentContractId: "original-user-objectives", criterionId: parentCriterion.id, source: parentCriterion.source }];
    const source: CreateTaskContractInput["source"] = { kind: "native_task",
      path: nativeTaskSourceUri(reference.creation, reference.target), text: reference.target.content,
      digest: contractDigest(reference.target.content), nativeBinding: { creation: reference.creation, target: reference.target }, approval: request };
    const authority: ContractAuthority = { ...f.authority, validateProposal: (input) => input.source.kind === "native_task"
      && input.source.path === source.path && input.source.text === reference.target.content
      && canonicalDigest(input.source.nativeBinding) === canonicalDigest(source.nativeBinding)
      && canonicalDigest(input.originalUserRequest) === canonicalDigest(request)
      && canonicalDigest(input.parentRequirements) === canonicalDigest(parentRequirements)
      && canonicalDigest(input.allowedMutationScope) === canonicalDigest(scope)
      && input.approvedCommandIds.every((id) => id === "affected-tests") };
    const contract = f.contract({ source, authority, parentRequirements });
    expect(contract.criteria.map((criterion) => criterion.text)).toEqual(["A"]);
    expect(contract.criteria[0].kind).toBe("native_task");
    expect(contract.originalUserRequest).toEqual(request);
    expect(contract.parentRequirements).toEqual(parentRequirements);
    expect(contract.criteria.some((criterion) => criterion.text === requestText)).toBe(false);
    f.persist(contract);
    const projection = projectContractHistory(f.entries, { ...f.context,
      validateSourceSpan: (span) => f.context.validateSourceSpan(span) || span.path === source.path
        && span.digest === source.digest && span.text === reference.target.content && span.startLine === 1 && span.endLine === 1 });
    expect(projection.contracts[0]?.approvedSource.nativeBinding).toEqual(source.nativeBinding);
    expect(() => f.contract({ source: { ...source, text: "Declare the entire global goal complete", digest: contractDigest("Declare the entire global goal complete") },
      authority, parentRequirements })).toThrow("host_authority");
    expect(() => f.contract({ source: { ...source, nativeBinding: undefined }, authority, parentRequirements })).toThrow("native_source_binding");
    const forgedCreation = { ...reference.creation, callId: "forged-native-creation" };
    expect(() => f.contract({ source: { ...source, nativeBinding: { creation: forgedCreation, target: reference.target } },
      creation: forgedCreation, authority, parentRequirements })).toThrow("host_authority");
  });

  test("duplicate phase and task names have distinct exact ordinal incarnations", () => {
    const f = fixture();
    f.native("duplicates", { op: "view" }, [
      { name: "same", tasks: [{ content: "A", status: "pending" }, { content: "A", status: "pending" }] },
      { name: "same", tasks: [{ content: "A", status: "pending" }] },
    ]);
    const references = projectContractHistory(f.entries, f.context).incarnations;
    expect(new Set(references.map((reference) => reference.incarnationId)).size).toBe(3);
    expect(references.map((reference) => [reference.target.phaseOrdinal, reference.target.ordinal])).toEqual([[0, 0], [0, 1], [1, 0]]);
    expect(references.every((reference) => !reference.creationKnown)).toBe(true);
  });

  test("same text reappended cannot inherit an earlier contract", () => {
    const f = fixture();
    const original = f.contract();
    f.persist(original);
    f.native("remove", { op: "rm", task: "A" }, [{ name: "P", tasks: [] }]);
    f.native("append", { op: "append", phase: "P", items: ["A"] }, [{ name: "P", tasks: [{ content: "A", status: "pending" }] }]);
    const projection = projectContractHistory(f.entries, f.context);
    expect(projection.incarnations[0].incarnationId).not.toBe(original.incarnationId);
    expect(projection.incarnations[0].creationKnown).toBe(true);
    expect(projection.contracts).toEqual([]);
  });

  test("amendments retain prior unmet criteria and parent obligations by default", () => {
    const f = fixture();
    const parent = { parentContractId: "parent", criterionId: "integration", source: f.contract().criteria[0].source };
    const original = f.contract({ parentRequirements: [parent] });
    const text = "## Phase One\n### Requirements\n- Add a real integration check.";
    f.sources.set(contractDigest(text), text);
    f.approveAmendment();
    const revised = reviseTaskContract(original, { source: { ...original.approvedSource, text, digest: contractDigest(text), approval: amendment },
      amendment, authority: f.authority, validateAmendment: () => true });
    expect(revised.criteria.map((criterion) => criterion.id)).toEqual(expect.arrayContaining(original.criteria.map((criterion) => criterion.id)));
    expect(revised.parentRequirements).toEqual([parent]);
    expect(revised.revision).toBe(2);
    expect(revised.incarnationId).toBe(original.incarnationId);
    expect(revised.previousRevisionId).toBe(original.revisionId);
  });

  test("model proposals cannot self-amend or remove obligations using flags", () => {
    const f = fixture();
    const original = f.contract();
    f.approveAmendment();
    const input = { source: { ...original.approvedSource, text: plan }, amendment, authority: f.authority,
      removeCriterionIds: [original.criteria[0].id], authorized: true, isHuman: true, validateAmendment: () => false };
    expect(() => reviseTaskContract(original, input)).toThrow("authentic_amendment");
    expect(() => reviseTaskContract(original, { ...input, amendment: { ...amendment, entryId: "model-proposal" }, validateAmendment: () => true })).toThrow("authentic_amendment");
    const revised = reviseTaskContract(original, { ...input, validateAmendment: () => true });
    // The same criterion remains in the explicitly supplied source; dropping it from an ID list is not enough.
    expect(revised.criteria.some((criterion) => criterion.text === original.criteria[0].text)).toBe(true);
  });

  test("fenced examples and continuation prompts cannot manufacture original obligations", () => {
    const f = fixture();
    const text = "## Phase One\n### Requirements\n- Real requirement.\n```md\n## Phase One\n### Requirements\n- Fake code example.\n```";
    f.sources.set(contractDigest(text), text);
    const contract = f.contract({ source: { ...f.contract().approvedSource, text, digest: contractDigest(text) } });
    expect(contract.criteria.map((criterion) => criterion.text)).toEqual(["Real requirement."]);
    f.sources.set(contractDigest("Continue"), "Continue");
    expect(() => f.contract({ source: { kind: "user_request", path: "plans/approved.md", text: "Continue", digest: contractDigest("Continue"), approval: request } })).toThrow("original_request");
  });

  test("explicit human removal requires authentic authority again when history replays", () => {
    const f = fixture();
    const original = f.contract();
    f.persist(original);
    f.approveAmendment();
    const text = "## Phase One\n### Success Criteria\n- Never export private thinking.";
    f.sources.set(contractDigest(text), text);
    const revised = reviseTaskContract(original, { source: { ...original.approvedSource, text, digest: contractDigest(text), approval: amendment },
      amendment, authority: f.authority, removeCriterionIds: [original.criteria[0].id], validateAmendment: () => true });
    expect(revised.criteria.some((criterion) => criterion.id === original.criteria[0].id)).toBe(false);
    f.persist(revised, "contract-2");
    const denied = projectContractHistory(f.entries, f.context);
    expect(denied.contracts[0].revision).toBe(1);
    expect(denied.rejected.some((entry) => entry.reason === "contract_obligation_reduction_unauthorized")).toBe(true);
    const accepted = projectContractHistory(f.entries, { ...f.context, validateAmendment: (before, after) =>
      before.revisionId === original.revisionId && after.amendments.at(-1)?.entryId === amendment.entryId });
    expect(accepted.contracts[0].revision).toBe(2);
  });
});

describe("actual native history and restart projection", () => {
  test("a genuine view snapshot preserves completed lifecycle without inventing JEV approval", () => {
    const f = fixture();
    f.native("view", { op: "view" }, [{ name: "P", tasks: [{ content: "A", status: "completed" }] }]);
    const projection = projectContractHistory(f.entries, f.context);
    expect(projection.nativePhases?.[0].tasks[0].status).toBe("completed");
    expect(projection.nativeStateEntryId).toBe("result-view");
    expect(projection.nativeSuccesses.at(-1)?.operation).toBe("view");
    expect("approvals" in projection).toBe(false);
    expect(projection.contracts).toEqual([]);
  });

  test("view-only partial history observes state but cannot fabricate task creation", () => {
    const f = fixture();
    f.native("view", { op: "view" }, [{ name: "P", tasks: [{ content: "A", status: "completed" }] }]);
    const partial = f.entries.slice(-2);
    const projection = projectContractHistory(partial, f.context);
    expect(projection.nativePhases?.[0].tasks[0].status).toBe("completed");
    expect(projection.incarnations[0].creationKnown).toBe(false);
  });

  test("restart reprojects contracts and unresolved debt, never portable staged approvals", () => {
    const f = fixture();
    const contract = f.contract();
    f.persist(contract);
    const debt = { debtId: "debt-1", contract: { contractId: contract.contractId, revisionId: contract.revisionId, incarnationId: contract.incarnationId },
      criterionIds: [contract.criteria[0].id], reason: "proof still missing", sourceEntryId: "result-init" };
    f.entries.push({ id: "debt-entry", parentId: "contract-1", type: "custom", customType: "omp.typesafe.contract.v1",
      data: createContractHistoryRecord(f.context, "record-debt", "result-init", { kind: "debt", debt }) });
    f.hostEntries.add("debt-entry");
    const first = projectContractHistory(f.entries, f.context);
    const restarted = projectContractHistory(structuredClone(f.entries), f.context);
    expect(restarted).toEqual(first);
    expect(restarted.contracts[0].incarnationId).toBe(contract.incarnationId);
    expect(restarted.debt).toEqual([debt]);
    expect("stagedCalls" in restarted).toBe(false);
    const unavailable = projectContractHistory(f.entries, { ...f.context, validateSourceSpan: () => false });
    expect(unavailable.contracts).toEqual([]);
    expect(unavailable.debt).toEqual([debt]);
  });

  test("fork after creation retains ancestral obligations; fork before creation cannot import them", () => {
    const f = fixture();
    const contract = f.contract();
    f.persist(contract);
    const fork = { ...f.context, branchId: "fork", resolveCreationBranchId: () => "origin",
      acceptsOriginBranch: (branch: string, source: string) => branch === "origin" && f.entries.some((entry) => entry.id === source) };
    expect(projectContractHistory(f.entries, fork).contracts[0]?.incarnationId).toBe(contract.incarnationId);
    expect(projectContractHistory(f.entries.slice(0, 1), fork).contracts).toEqual([]);
    expect(projectContractHistory(f.entries, { ...f.context, sessionId: "foreign-session" }).contracts).toEqual([]);
  });

  test("untrusted registry JSON and forged source spans cannot register live contracts", () => {
    const f = fixture();
    const contract = f.contract();
    f.persist(contract);
    expect(projectContractHistory(f.entries, { ...f.context, isHostOwnedEntry: () => false }).contracts).toEqual([]);
    const forged = structuredClone(contract);
    forged.criteria[0].source.text = "forged report acceptance\n  forged continuation";
    forged.criteria[0].text = "forged report acceptance\nforged continuation";
    const criterion = forged.criteria[0];
    criterion.id = canonicalDigest({ path: criterion.source.path, digest: criterion.source.digest, kind: criterion.kind,
      start: criterion.source.startLine - 1, end: criterion.source.endLine - 1, text: criterion.text });
    const { revisionId: _old, ...body } = forged;
    const changed = { ...body, revisionId: contractRevisionDigest(body) };
    f.entries.pop();
    f.persist(changed);
    expect(projectContractHistory(f.entries, f.context).contracts).toEqual([]);
  });

  test("rejects unmatched results, duplicate call identities and malformed native snapshots", () => {
    const f = fixture();
    const orphan = f.entries.slice(-1);
    expect(projectContractHistory(orphan, f.context).nativePhases).toBeUndefined();
    const bad = structuredClone(f.entries);
    bad[2].message = { role: "toolResult", toolName: "todo", toolCallId: "init", isError: false, details: { op: "init", phases: [{ name: "P", tasks: [{ content: "A", status: "made_up" }] }] } };
    expect(projectContractHistory(bad, f.context).nativePhases).toBeUndefined();
    f.native("init", { op: "view" }, [{ name: "P", tasks: [{ content: "A", status: "completed" }] }]);
    expect(projectContractHistory(f.entries, f.context).nativePhases).toBeUndefined();
  });

  test("stale revision records and disconnected branches do not hydrate authority", () => {
    const f = fixture();
    f.persist(f.contract());
    f.persist(f.contract(), "replayed-contract");
    const projection = projectContractHistory(f.entries, f.context);
    expect(projection.contracts).toHaveLength(1);
    expect(projection.rejected.some((entry) => entry.reason === "stale_or_forged_contract")).toBe(true);
    const disconnected = structuredClone(f.entries);
    disconnected[1].parentId = "other-branch";
    expect(projectContractHistory(disconnected, f.context).contracts).toEqual([]);
  });

  test("malformed latest native state is retained only as observation, not current authority", () => {
    const f = fixture();
    f.persist(f.contract());
    f.native("bad-view", { op: "view" }, [{ name: "P", tasks: [{ content: "A", status: "completed" }] }]);
    const result = f.entries[f.entries.length - 1];
    result.message = { role: "toolResult", toolName: "todo", toolCallId: "bad-view", isError: false,
      details: { op: "view", phases: "malformed" } };
    const projection = projectContractHistory(f.entries, f.context);
    expect(projection.nativePhases?.[0].tasks[0].status).toBe("in_progress");
    expect(projection.nativeStateReliable).toBe(false);
    expect(projection.contracts).toEqual([]);
  });

  test("portable staged approval fields cannot be persisted as contract records", () => {
    const f = fixture();
    const contract = { ...f.contract(), stagedApproval: { outcome: "APPROVED_PENDING_COMMIT" } };
    expect(() => f.persist(contract)).toThrow("nonportable_field");
  });

  test("legacy failed done rehydrates only exact unclassified incarnation debt provenance", () => {
    const f = fixture();
    const incarnation = projectContractHistory(f.entries, f.context).incarnations[0].incarnationId;
    f.native("failed-done", { op: "done", task: "A", phase: "P" }, [{ name: "P", tasks: [{ content: "A", status: "pending" }] }]);
    f.entries[f.entries.length - 1].message = { role: "toolResult", toolName: "todo", toolCallId: "failed-done", isError: true,
      details: { error: "Legacy native rejection" }, content: [{ type: "text", text: "REJECTED confidence=0.99" }] };
    const failed = projectContractHistory(f.entries, f.context);
    expect(failed.nativeFailures).toHaveLength(1);
    expect(failed.nativeFailures[0]).toMatchObject({ classification: "unclassified-native-failure", callId: "failed-done",
      callEntryId: "call-failed-done", resultEntryId: "result-failed-done", operation: "done" });
    expect(failed.nativeFailures[0].targets[0].before?.incarnationId).toBe(incarnation);
    expect(failed.nativeFailures[0].targets[0].after?.incarnationId).toBe(incarnation);
    expect("confidence" in failed.nativeFailures[0]).toBe(false);
    expect(failed.nativePhases?.[0].tasks[0].status).toBe("in_progress");
    f.native("real-done", { op: "done", task: "A", phase: "P" }, [{ name: "P", tasks: [{ content: "A", status: "completed" }] }]);
    const result = f.entries[f.entries.length - 1].message;
    if (!result) throw new Error("Fixture result missing");
    result.details = { op: "done", phases: [{ name: "P", tasks: [{ content: "A", status: "completed" }] }],
      completedTasks: [{ phase: "P", content: "A" }] };
    const success = projectContractHistory(f.entries, f.context).nativeSuccesses.at(-1);
    expect(success?.targets[0]).toMatchObject({ beforeStatus: "in_progress", afterStatus: "completed", completionReported: true });
    expect(success?.targets[0].after?.incarnationId).toBe(incarnation);
  });

  test("failed absent, malformed or mismatching targets never spread debt across all tasks", () => {
    const f = fixture();
    const inputs = [{ op: "done" }, { op: "done", task: 123 }, { op: "done", task: "missing" },
      { op: "done", task: "A", phase: "other" }, { op: "done", task: "A", ops: [] }];
    inputs.forEach((input, index) => {
      const id = `bad-failure-${index}`;
      f.native(id, input, []);
      f.entries[f.entries.length - 1].message = { role: "toolResult", toolName: "todo", toolCallId: id, isError: true };
    });
    const projection = projectContractHistory(f.entries, f.context);
    expect(projection.nativeFailures).toEqual([]);
    expect(projection.nativePhases?.[0].tasks[0].status).toBe("in_progress");
  });

  test("late failed results cannot attach old incarnation debt to a reinitialized same-text task", () => {
    const f = fixture();
    f.native("late-failure", { op: "done", task: "A" }, []);
    const result = f.entries.pop();
    if (!result) throw new Error("Fixture result missing");
    f.native("recreated", { op: "init", phase: "P", items: ["A"] }, [{ name: "P", tasks: [{ content: "A", status: "pending" }] }]);
    result.parentId = f.entries[f.entries.length - 1].id;
    result.message = { role: "toolResult", toolName: "todo", toolCallId: "late-failure", isError: true };
    f.entries.push(result);
    expect(projectContractHistory(f.entries, f.context).nativeFailures).toEqual([]);
  });

  test("late successful done/view results cannot overwrite a newer native incarnation", () => {
    for (const operation of ["done", "view"]) {
      const f = fixture();
      f.native("late-success", { op: operation, task: "A" }, [{ name: "P", tasks: [{ content: "A", status: "completed" }] }]);
      const result = f.entries.pop();
      if (!result) throw new Error("Fixture result missing");
      f.native("new-init", { op: "init", phase: "P", items: ["A"] }, [{ name: "P", tasks: [{ content: "A", status: "pending" }] }]);
      const current = projectContractHistory(f.entries, f.context).incarnations[0].incarnationId;
      result.parentId = f.entries[f.entries.length - 1].id;
      f.entries.push(result);
      const projection = projectContractHistory(f.entries, f.context);
      expect(projection.nativeStateReliable).toBe(true);
      expect(projection.nativePhases?.[0].tasks[0].status).toBe("in_progress");
      expect(projection.incarnations[0].incarnationId).toBe(current);
      expect(projection.nativeSuccesses.at(-1)?.callId).toBe("new-init");
      expect(projection.rejected.some((entry) => entry.reason === "native_result_state_revised")).toBe(true);
    }
  });

  test("a partial duplicate-name removal cannot inherit the removed ordinal's contract", () => {
    const f = fixture();
    const contract = f.contract();
    f.persist(contract);
    f.native("legacy-duplicate-view", { op: "view" }, [{ name: "P", tasks: [
      { content: "A", status: "pending" }, { content: "A", status: "pending" },
    ] }]);
    f.native("partial-remove", { op: "rm", task: "A" }, [{ name: "P", tasks: [{ content: "A", status: "pending" }] }]);
    const projection = projectContractHistory(f.entries, f.context);
    expect(projection.nativePhases?.[0].tasks).toHaveLength(1);
    expect(projection.incarnations[0].creationKnown).toBe(false);
    expect(projection.incarnations[0].incarnationId).not.toBe(contract.incarnationId);
    expect(projection.contracts).toEqual([]);
  });
});

describe("consultation, task, parent and shadow review separation", () => {
  test("consultation requires an actual host request and has no native authority", () => {
    const contract = fixture().contract();
    const context = { ...reviewContext(contract), purpose: "consultation" as const };
    const binding: ReviewBinding = { purpose: "consultation", request, provenance: context.expectedProvenance, authorizedScope: scope };
    expect(validateReviewBinding(binding, context)).toMatchObject({ valid: true, authority: "none" });
    expect(validateReviewBinding({ ...binding, contract: { contractId: "fake-todo" } }, context).valid).toBe(false);
    expect(validateReviewBinding({ ...binding, request: { ...request, entryId: "model-text" } }, context).valid).toBe(false);
  });

  test("task review binds exact incarnation, target, operation, policy and dispatch result", () => {
    const contract = fixture().contract();
    const context = reviewContext(contract);
    const binding = taskBinding(contract, context);
    expect(validateReviewBinding(binding, context)).toMatchObject({ valid: true, authority: "task_bound" });
    expect(validateReviewBinding({ ...binding, target: { ...contract.target, ordinal: 1 } }, context).valid).toBe(false);
    expect(validateReviewBinding({ ...binding, logicalOperationId: "replayed-done" }, context).valid).toBe(false);
    expect(validateReviewBinding({ ...binding, provenance: { ...binding.provenance, resultCallId: "wrong-call" } }, context).valid).toBe(false);
    expect(validateReviewBinding(binding, { ...context, branchId: "foreign" }).valid).toBe(false);
  });

  test("parent review requires frozen parent obligations and exact applicable receipts", () => {
    const contract = fixture().contract();
    const context: ReviewBindingContext = { ...reviewContext(contract), purpose: "parent_review", parentObligationIds: ["integration"], childReceiptIds: ["child-proof"], integrationReceiptIds: ["parent-proof"] };
    const base = taskBinding(contract);
    const binding = { ...base, purpose: "parent_review", parentObligationIds: ["integration"], childReceiptIds: ["child-proof"], integrationReceiptIds: ["parent-proof"] };
    expect(validateReviewBinding(binding, context).valid).toBe(true);
    expect(validateReviewBinding({ ...binding, integrationReceiptIds: [] }, context).valid).toBe(false);
  });

  test("a frozen shadow corpus can be evaluated but cannot become live task authority", () => {
    const contract = fixture().contract();
    const corpus = { corpusId: "frozen-corpus", caseId: "case-one", contractDigest: contractDigest("corpus-contract") };
    const context: ReviewBindingContext = { ...reviewContext(contract), purpose: "shadow", corpus };
    const binding: ReviewBinding = { purpose: "shadow", corpus, provenance: context.expectedProvenance, authorizedScope: scope };
    expect(validateReviewBinding(binding, context)).toMatchObject({ valid: true, authority: "none" });
    expect(validateReviewBinding(binding, reviewContext(contract)).valid).toBe(false);
    expect(validateReviewBinding({ ...binding, target: contract.target }, context).valid).toBe(false);
  });
});

describe("canonical native operation effects", () => {
  test("init enforces exact list, unique targets and the documented active pointer", () => {
    const input = { op: "init", items: ["A", "B"] };
    const phases: ProjectedNativePhase[] = [{ name: "Tasks", tasks: [{ content: "A", status: "in_progress" }, { content: "B", status: "pending" }] }];
    expect(validateNativeTodoTransition(undefined, input, phases, { op: "init" }).valid).toBe(true);
    expect(validateNativeTodoTransition(undefined, input, [{ ...phases[0], name: "invented" }], { op: "init" }).valid).toBe(false);
    expect(validateNativeTodoTransition(undefined, { op: "init", items: ["A", "A"] }, phases, { op: "init" }).valid).toBe(false);
    const unnormalized: ProjectedNativePhase[] = [{ name: "Tasks", tasks: [{ content: "A", status: "pending" }, { content: "B", status: "pending" }] }];
    expect(validateNativeTodoTransition(undefined, input, unnormalized, { op: "init" }).valid).toBe(false);
  });

  test("start permits only its exact task plus documented active-task demotion", () => {
    const before: ProjectedNativePhase[] = [{ name: "P", tasks: [{ content: "A", status: "in_progress" }, { content: "B", status: "pending" }] }];
    const after: ProjectedNativePhase[] = [{ name: "P", tasks: [{ content: "A", status: "pending" }, { content: "B", status: "in_progress" }] }];
    expect(validateNativeTodoTransition(before, { op: "start", task: "B" }, after, { op: "start" }).valid).toBe(true);
    expect(validateNativeTodoTransition(before, { op: "start", task: "A" }, after, { op: "start" }).valid).toBe(false);
    expect(validateNativeTodoTransition(before, { op: "start", task: "B", phase: "foreign" }, after, { op: "start" }).valid).toBe(false);
    expect(validateNativeTodoTransition(before, { op: "start", phase: "P" }, after, { op: "start" }).valid).toBe(false);
  });

  test("phase done preserves prior completions and requires only genuine newly completed transitions", () => {
    const before: ProjectedNativePhase[] = [
      { name: "P", tasks: [{ content: "original-completed", status: "completed" }, { content: "A", status: "in_progress" }, { content: "B", status: "pending" }] },
      { name: "Q", tasks: [{ content: "C", status: "pending" }] },
    ];
    const after: ProjectedNativePhase[] = [
      { name: "P", tasks: [{ content: "original-completed", status: "completed" }, { content: "A", status: "completed" }, { content: "B", status: "completed" }] },
      { name: "Q", tasks: [{ content: "C", status: "in_progress" }] },
    ];
    const completedTasks = [{ phase: "P", content: "A" }, { phase: "P", content: "B" }];
    expect(validateNativeTodoTransition(before, { op: "done", phase: "P" }, after, { op: "done", completedTasks }).valid).toBe(true);
    expect(validateNativeTodoTransition(before, { op: "done", phase: "P" }, after, { op: "done" }).valid).toBe(false);
    expect(validateNativeTodoTransition(before, { op: "done", phase: "P" }, after, { op: "done",
      completedTasks: [{ phase: "P", content: "original-completed" }, ...completedTasks] }).valid).toBe(false);
    const unrelated = structuredClone(after);
    unrelated[1].tasks[0].status = "completed";
    expect(validateNativeTodoTransition(before, { op: "done", phase: "P" }, unrelated, { op: "done", completedTasks }).valid).toBe(false);
  });

  test("block/unblock preserve finished tasks, normalize blocker text and move only the active pointer", () => {
    const before: ProjectedNativePhase[] = [{ name: "P", tasks: [
      { content: "A", status: "in_progress" }, { content: "B", status: "pending" }, { content: "closed", status: "completed" },
    ] }];
    const blocked: ProjectedNativePhase[] = [{ name: "P", tasks: [
      { content: "A", status: "blocked", blocker: "wait for input" }, { content: "B", status: "in_progress" }, { content: "closed", status: "completed" },
    ] }];
    expect(validateNativeTodoTransition(before, { op: "block", task: "A", reason: " wait\n for input " }, blocked, { op: "block" }).valid).toBe(true);
    const unblocked: ProjectedNativePhase[] = [{ name: "P", tasks: [
      { content: "A", status: "pending" }, { content: "B", status: "in_progress" }, { content: "closed", status: "completed" },
    ] }];
    expect(validateNativeTodoTransition(blocked, { op: "unblock", task: "A" }, unblocked, { op: "unblock" }).valid).toBe(true);
    const phaseBlocked: ProjectedNativePhase[] = [{ name: "P", tasks: [
      { content: "A", status: "blocked" }, { content: "B", status: "blocked" }, { content: "closed", status: "completed" },
    ] }];
    expect(validateNativeTodoTransition(before, { op: "block", phase: "P" }, phaseBlocked, { op: "block" }).valid).toBe(true);
    phaseBlocked[0].tasks[2].status = "blocked";
    expect(validateNativeTodoTransition(before, { op: "block", phase: "P" }, phaseBlocked, { op: "block" }).valid).toBe(false);
  });

  test("append rejects duplicates atomically and rm preserves emptied phases and unrelated work", () => {
    const before: ProjectedNativePhase[] = [{ name: "P", tasks: [{ content: "A", status: "in_progress" }, { content: "B", status: "pending" }] }];
    const appended: ProjectedNativePhase[] = [{ name: "P", tasks: [...before[0].tasks, { content: "C", status: "pending" }] }];
    expect(validateNativeTodoTransition(before, { op: "append", phase: "P", items: ["C"] }, appended, { op: "append" }).valid).toBe(true);
    expect(validateNativeTodoTransition(before, { op: "append", phase: "P", items: ["B"] }, before, { op: "append" }).valid).toBe(false);
    expect(validateNativeTodoTransition(before, { op: "append", items: ["C"] }, appended, { op: "append" }).valid).toBe(false);
    const removed: ProjectedNativePhase[] = [{ name: "P", tasks: [{ content: "B", status: "in_progress" }] }];
    expect(validateNativeTodoTransition(before, { op: "rm", task: "A" }, removed, { op: "rm" }).valid).toBe(true);
    expect(validateNativeTodoTransition(before, { op: "rm", task: "A" }, [{ name: "P", tasks: [] }], { op: "rm" }).valid).toBe(false);
    expect(validateNativeTodoTransition(before, { op: "rm", phase: "P" }, [{ name: "P", tasks: [] }], { op: "rm" }).valid).toBe(true);
    expect(validateNativeTodoTransition(before, { op: "rm", phase: "P" }, [], { op: "rm" }).valid).toBe(false);
  });

  test("view remains read-only observation and never normalizes a snapshot into mutation authority", () => {
    const phases: ProjectedNativePhase[] = [{ name: "P", tasks: [{ content: "A", status: "pending" }, { content: "B", status: "pending" }] }];
    const validation = validateNativeTodoTransition(undefined, { op: "view" }, phases, { op: "view" });
    expect(validation).toMatchObject({ valid: true, observationOnly: true });
    if (validation.valid) expect(validation.phases[0].tasks[0].status).toBe("pending");
  });

  test("matched wrong-op, wrong-target and unrelated mutation results cannot rehydrate through history", () => {
    const cases: Array<{ phases: ProjectedNativePhase[]; resultOp?: string }> = [
      { phases: [{ name: "P", tasks: [{ content: "wrong-target", status: "in_progress" }, { content: "B", status: "pending" }] }] },
      { phases: [{ name: "P", tasks: [{ content: "A", status: "in_progress" }, { content: "B", status: "completed" }] }] },
      { phases: [{ name: "P", tasks: [{ content: "A", status: "in_progress" }] }] },
      { phases: [{ name: "P", tasks: [{ content: "A", status: "in_progress" }, { content: "B", status: "pending" }] }], resultOp: "drop" },
    ];
    for (const entry of cases) {
      const f = fixture();
      f.native("append-B", { op: "append", phase: "P", items: ["B"] }, [{ name: "P", tasks: [
        { content: "A", status: "in_progress" }, { content: "B", status: "pending" },
      ] }]);
      f.native("wrong-effect", { op: "start", task: "A" }, entry.phases);
      if (entry.resultOp) {
        const result = f.entries[f.entries.length - 1].message;
        if (!result) throw new Error("Fixture result missing");
        result.details = { op: entry.resultOp, phases: entry.phases };
      }
      const projection = projectContractHistory(f.entries, f.context);
      expect(projection.nativeStateReliable).toBe(false);
      expect(projection.nativePhases?.[0].tasks).toEqual([{ content: "A", status: "in_progress" }, { content: "B", status: "pending" }]);
      expect(projection.nativeSuccesses.some((result) => result.callId === "wrong-effect")).toBe(false);
    }
  });
});

describe("observed nullable native host wire", () => {
  test("normalizes nullable optionals once and excludes only transport intent from semantic hashing", () => {
    const wire = { i: "Tracking authorized work", op: "append", list: null, task: null,
      phase: "Authorized master implementation", items: ["A", "B"], reason: null };
    const semantic = { op: "append", phase: "Authorized master implementation", items: ["A", "B"] };
    expect(normalizeNativeTodoInput(wire)).toEqual({ valid: true, input: semantic });
    expect(nativeTodoInputDigest(wire)).toBe(nativeTodoInputDigest(semantic));
    expect(nativeTodoInputDigest({ ...wire, i: "Different public transport intent" })).toBe(nativeTodoInputDigest(wire));
    expect(readNativeTodoOperation(wire)).toBe("append");
    const preserved = { op: "view", list: [], items: [], task: "", phase: "", reason: "" };
    expect(normalizeNativeTodoInput(preserved)).toEqual({ valid: true, input: preserved });
    expect(nativeTodoInputDigest(preserved)).not.toBe(nativeTodoInputDigest({ op: "view" }));
    const normalized = normalizeNativeTodoInput(wire);
    wire.items.push("later mutation");
    if (!normalized.valid) throw new Error("Fixture normalization failed");
    expect(normalized.input.items).toEqual(["A", "B"]);
  });

  test("nullable wire never enables aliases, batch ops, authority flags or malformed schema repair", () => {
    for (const wire of [
      { op: null }, { op: "done", ops: [] }, { op: "done", task: "A", authorized: true },
      { op: "done", task: "A", isHuman: true }, { op: "append", phase: "P", items: [123] },
      { op: "block", task: "A", reason: 123 }, { action: "done", target: "A" },
    ]) {
      expect(normalizeNativeTodoInput(wire).valid).toBe(false);
      expect(() => nativeTodoInputDigest(wire)).toThrow();
    }
    expect(readNativeTodoOperation({ items: ["A"], list: null, phase: null, task: null, reason: null }, [])).toBe("init");
    expect(readNativeTodoOperation({ items: ["A"], list: null, phase: null, task: null, reason: null },
      [{ name: "Existing", tasks: [] }])).toBeUndefined();
  });

  test("full nullable init/done/append history retains all 31 targets and the original three completions", () => {
    const f = fixture();
    const sourcePhase = "Source review and root-cause verification";
    const implementationPhase = "Authorized master implementation";
    // These three public labels are preserved as fixtures; reports confer no runtime authority.
    const originals = [
      "Repair research-report applicability and task-aware evidence delivery without weakening acceptance or changing runtime deployment.",
      "Verify authorized plumbing changes with preserved competition assertions, full affected modules and actual callback smoke.",
      "Map source callsites and verify workspace/runtime identity for TypeSafe judge and todo gates.",
    ];
    const originalOpen = Array.from({ length: 20 }, (_, index) => `Fixture original unfinished obligation ${index + 1}`);
    const initialItems = [...originals, ...originalOpen];
    const initWire = { i: "Tracking original scoped obligations", op: "init", list: [{ phase: sourcePhase, items: initialItems }],
      task: null, phase: null, items: null, reason: null };
    f.native("nullable-init-23", initWire, [{ name: sourcePhase, tasks: initialItems.map((content) => ({ content, status: "pending" })) }]);
    const originalIncarnations = projectContractHistory(f.entries, f.context).incarnations.map((reference) => reference.incarnationId);
    for (const [index, task] of originals.entries()) {
      const phases = projectContractHistory(f.entries, f.context).nativePhases;
      if (!phases) throw new Error("Fixture native state missing");
      const next = structuredClone(phases);
      next[0].tasks[index].status = "completed";
      const doneWire = { i: "Evaluating scoped source delivery", op: "done", list: null,
        task, phase: sourcePhase, items: null, reason: null };
      f.native(`nullable-original-done-${index}`, doneWire, next);
      const success = projectContractHistory(f.entries, f.context).nativeSuccesses.at(-1);
      expect(success?.inputDigest).toBe(nativeTodoInputDigest({ op: "done", task, phase: sourcePhase }));
      expect(success?.targets[index]).toMatchObject({ afterStatus: "completed", completionReported: true });
    }
    const addedItems = Array.from({ length: 8 }, (_, index) => `Fixture authorized implementation obligation ${index + 1}`);
    const appendWire = { i: "Tracking authorized workspace implementation", op: "append", list: null, task: null,
      phase: implementationPhase, items: addedItems, reason: null };
    const phases = projectContractHistory(f.entries, f.context).nativePhases;
    if (!phases) throw new Error("Fixture native state missing");
    f.native("nullable-append-31", appendWire, [...phases,
      { name: implementationPhase, tasks: addedItems.map((content) => ({ content, status: "pending" })) }]);
    const projection = projectContractHistory(f.entries, f.context);
    const tasks = projection.nativePhases?.flatMap((phase) => phase.tasks) ?? [];
    expect(projection.nativeStateReliable).toBe(true);
    expect(tasks).toHaveLength(31);
    expect(tasks.filter((task) => task.status === "completed").map((task) => task.content)).toEqual(originals);
    expect(tasks.filter((task) => task.status !== "completed")).toHaveLength(28);
    expect(projection.incarnations.slice(0, 23).map((reference) => reference.incarnationId)).toEqual(originalIncarnations);
    expect(projection.incarnations.every((reference) => reference.creationKnown)).toBe(true);
    expect(projection.nativeSuccesses.at(-1)?.inputDigest).toBe(nativeTodoInputDigest(appendWire));
    const rawCall = f.entries.find((entry) => entry.id === "call-nullable-append-31")?.message?.content?.[0];
    expect(rawCall).toMatchObject({ type: "toolCall", arguments: { i: appendWire.i, list: null, task: null, reason: null, items: addedItems } });
  });
});
