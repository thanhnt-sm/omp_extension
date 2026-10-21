import { describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createContractRuntime, type ContractBindingOutcome, type ContractBindingProposal, type ContractRuntime, type ContractSourceJournalRecord } from "../src/contract-runtime";
import { contractDigest, normalizeNativeTodoPointer, type ProjectedNativePhase } from "../src/task-contract";
import { findProjectToolCall, readHostBranch, validateProjectToolInvocationJoin, type HostHistoryEntry } from "../src/host-history";
import { createHostToolInvocationRuntime, HOST_TOOL_INVOCATION_ENTRY } from "../src/host-tool-invocation";
import { readCookInputObservations } from "../src/task-contract-cook-input";

const REVIEW = "Review src/parser.ts for input validation; report findings.";
const IMPLEMENT = "Implement the source CLI contract and its focused regressions.";
const PHASE_PATH = "plans/approved/phase-01-source-cli.md";
const MASTER_PATH = "plans/approved/plan.md";
const GOLD_PATH = "plans/approved/phase-02-parent-gold.md";
const PHASE_TEXT = "---\nphase: 1\nstatus: pending\n---\n# Source CLI\n## Requirements\n- Implement the source CLI boundary.\n## Success Criteria\n- Independent human gold must be available before parent adoption.\n## Related Code Files\n- `src/source-cli.ts`\n- `tests/source-cli.test.ts`\n";
const MASTER_TEXT = "# Approved master\n## Phases\n- [Source CLI](./phase-01-source-cli.md)\n- [Parent gold](./phase-02-parent-gold.md)\n";
const POLICY = contractDigest("fixed host policy");
const CONFIRM = { hasUI: true, ui: { async confirm() { return true; } } };

class RuntimeHost {
  entries: HostHistoryEntry[] = [];
  readonly sessionId = "contract-runtime-fixture";
  private sequence = 0;
  private phases: ProjectedNativePhase[] = [];
  readonly invocations = createHostToolInvocationRuntime((customType, data) => { this.append({ type: "custom", customType, data }); });
  constructor(readonly cwd: string) {}
  append(value: Omit<HostHistoryEntry, "id" | "parentId">): string {
    const id = `entry-${++this.sequence}`;
    this.entries.push({ ...structuredClone(value), id, parentId: this.entries.at(-1)?.id ?? null });
    return id;
  }
  user(text: string): string { return this.append({ type: "message", message: { role: "user", content: [{ type: "text", text }] } }); }
  call(id: string, name: string, args: unknown): string {
    return this.append({ type: "message", message: { role: "assistant", content: [
      { type: "thinking", text: "PRIVATE_HOST_REASONING_MUST_NOT_ENTER_SOURCE_RECORDS" },
      { type: "toolCall", id, name, arguments: structuredClone(args) },
    ] } });
  }
  result(id: string, name: string): void {
    this.append({ type: "message", message: { role: "toolResult", toolName: name, toolCallId: id, isError: false, content: [{ type: "text", text: "Fixture host result" }] } });
  }
  native(id: string, input: Record<string, unknown>, phases: ProjectedNativePhase[], omitErrorFlag = false): void {
    this.call(id, "todo", input);
    const snapshot = structuredClone(phases);
    if (input.op !== "view") normalizeNativeTodoPointer(snapshot);
    const completedTasks = input.op === "view" ? [] : snapshot.flatMap((phase) => phase.tasks.flatMap((task) => {
      const previous = this.phases.find((candidate) => candidate.name === phase.name)?.tasks.find((candidate) => candidate.content === task.content);
      return task.status === "completed" && previous && previous.status !== "completed" ? [{ phase: phase.name, content: task.content }] : [];
    }));
    this.append({ type: "message", message: { role: "toolResult", toolName: "todo", toolCallId: id,
      ...(omitErrorFlag ? {} : { isError: false }), details: { op: input.op, phases: snapshot, ...(completedTasks.length ? { completedTasks } : {}) } } });
    this.phases = snapshot;
  }
  context(extra: Record<string, unknown> = {}) {
    return { cwd: this.cwd, sessionManager: { getBranch: () => this.entries, getSessionId: () => this.sessionId }, ...extra };
  }
  runtime(): ContractRuntime {
    return createContractRuntime({ appendEntry: (customType, data) => { this.append({ type: "custom", customType, data }); },
      policyDigest: POLICY, approvedCommandIds: ["affected-tests"], invocations: this.invocations });
  }
  async bind(runtime: ContractRuntime, id: string, proposal: ContractBindingProposal, extra: Record<string, unknown> = {}, wrapper = false): Promise<ContractBindingOutcome> {
    this.call(id, wrapper ? "write" : "typesafe_bind_task", wrapper ? { i: "Binding the actual task", path: "xd://typesafe_bind_task", content: JSON.stringify(proposal) } : proposal);
    const ctx = this.context(extra);
    const outcome = await this.invocations.run(ctx, "typesafe_bind_task", id, proposal, () => runtime.bind(ctx, id, proposal));
    this.result(id, wrapper ? "write" : "typesafe_bind_task");
    return outcome;
  }
  bindingFacts(): HostHistoryEntry[] {
    return this.entries.filter((entry) => entry.type === "custom" && entry.customType !== HOST_TOOL_INVOCATION_ENTRY
      && !(entry.data && typeof entry.data === "object" && "kind" in entry.data && entry.data.kind === "cook_input_observation"));
  }
}

async function withHost(
  request: string, goal: string, run: (host: RuntimeHost, runtime: ContractRuntime, originalUserEntryId: string) => Promise<void>,
): Promise<void> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "contract-runtime-"));
  try {
    await fs.mkdir(path.join(cwd, "plans", "approved"), { recursive: true });
    await fs.writeFile(path.join(cwd, MASTER_PATH), MASTER_TEXT);
    await fs.writeFile(path.join(cwd, PHASE_PATH), PHASE_TEXT);
    await fs.writeFile(path.join(cwd, GOLD_PATH), "# Parent gold\n## Success Criteria\n- Validate independent parent gold before adoption.\n");
    const host = new RuntimeHost(cwd);
    const runtime = host.runtime();
    await runtime.captureCookInput(host.context(), { type: "input", text: request, source: "interactive" });
    const original = host.user(request);
    host.native("native-init", { i: "Tracking scoped work", op: "init", list: [{ phase: "P", items: [goal] }], task: null, phase: null, items: null, reason: null },
      [{ name: "P", tasks: [{ content: goal, status: "pending" }] }], true);
    await run(host, runtime, original);
  } finally { await fs.rm(cwd, { recursive: true, force: true }); }
}

function requireBound(outcome: ContractBindingOutcome) {
  if (outcome.status !== "BOUND") throw new Error(`Expected bound fixture: ${JSON.stringify(outcome)}`);
  return outcome;
}

describe("real host contract runtime", () => {
  test("binds genuine readonly delegation without commands, synthetic todo or private thinking", async () => {
    await withHost("Review source only and report findings; do not change runtime code.", REVIEW, async (host, runtime, original) => {
      host.user("Continue");
      host.user("An unrelated later public report does not replace the original task.");
      const bound = requireBound(await host.bind(runtime, "bind-review", { task: REVIEW, phase: "P" }));
      expect(bound.contract.taskKind).toBe("review");
      expect(bound.contract.criteria.map((criterion) => criterion.text)).toEqual([REVIEW]);
      expect(bound.contract.originalUserRequest.entryId).toBe(original);
      expect(bound.contract.parentRequirements).toEqual([]);
      expect(bound.contract.allowedMutationScope).toEqual({ paths: ["**"], operations: ["read"] });
      expect(bound.contract.approvedCommandIds).toEqual([]);
      expect(bound.sourceContext.authorization).toEqual({ kind: "readonly" });
      expect(bound.sourceContext.readScope).toEqual(["**"]);
      expect(JSON.stringify(host.entries.filter((entry) => entry.type === "custom"))).not.toContain("PRIVATE_HOST_REASONING");
      const projection = runtime.projection(host.context());
      expect(projection?.nativeSuccesses).toHaveLength(1);
      expect(projection?.nativePhases?.[0].tasks[0].status).toBe("in_progress");
      expect(projection?.contracts).toHaveLength(1);
    });
  });

  test("hydrates host facts after restart and supports the actual write-device call wrapper", async () => {
    await withHost("Review the parser and retain all findings.", REVIEW, async (host, runtime) => {
      const bound = requireBound(await host.bind(runtime, "bind-device", { task: REVIEW, phase: "P" }, {}, true));
      const branch = readHostBranch(host.context());
      if (!branch) throw new Error("Fixture branch missing");
      expect(findProjectToolCall(branch, "bind-device", "typesafe_bind_task")?.params).toEqual({ task: REVIEW, phase: "P" });
      const restarted = host.runtime();
      const contract = restarted.contractFor(host.context(), { task: REVIEW, phase: "P" });
      expect(contract?.revisionId).toBe(bound.contract.revisionId);
      if (!contract) throw new Error("Fixture contract missing");
      expect(restarted.sourceContext(contract)).toEqual(bound.sourceContext);
      const again = requireBound(await host.bind(restarted, "bind-again", { task: REVIEW, phase: "P" }));
      expect(again.contract.revisionId).toBe(bound.contract.revisionId);
      expect(host.entries.filter((entry) => entry.customType === "omp.typesafe.contract.source.v1")).toHaveLength(1);
    });
  });

  test("actual registered execution binds before async assistant publication without synthetic SDK rows", async () => {
    await withHost("Review source only and preserve its actual provenance.", REVIEW, async (host, runtime) => {
      const proposal = { task: REVIEW, phase: "P" };
      const ctx = host.context();
      const bound = requireBound(await host.invocations.run(ctx, "typesafe_bind_task", "bind-before-publication", proposal,
        () => runtime.bind(ctx, "bind-before-publication", proposal)));
      const source = host.entries.find((entry) => entry.customType === "omp.typesafe.contract.source.v1")?.data as ContractSourceJournalRecord | undefined;
      let branch = readHostBranch(ctx);
      if (!source || !branch) throw new Error("Actual binding source observation missing");
      expect(branch.byId.get(source.callEntryId)?.customType).toBe(HOST_TOOL_INVOCATION_ENTRY);
      expect(source.callEntryId).toBe(source.invocation.entryId);
      expect(findProjectToolCall(branch, "bind-before-publication", "typesafe_bind_task")).toBeUndefined();
      expect(validateProjectToolInvocationJoin(branch, source.invocation)).toBe(true);
      expect(validateProjectToolInvocationJoin(branch, source.invocation, true)).toBe(false);
      const restarted = host.runtime();
      expect(restarted.contractFor(ctx, proposal)?.revisionId).toBe(bound.contract.revisionId);
      host.call("bind-before-publication", "typesafe_bind_task", proposal);
      branch = readHostBranch(ctx);
      if (!branch) throw new Error("Published assistant branch missing");
      expect(validateProjectToolInvocationJoin(branch, source.invocation, true)).toBe(false);
      host.result("bind-before-publication", "typesafe_bind_task");
      branch = readHostBranch(ctx);
      if (!branch) throw new Error("Published result branch missing");
      expect(validateProjectToolInvocationJoin(branch, source.invocation, true)).toBe(true);
      expect(restarted.contractFor(ctx, proposal)?.revisionId).toBe(bound.contract.revisionId);
      expect(restarted.sourceContext(bound.contract)).toEqual(bound.sourceContext);
    });
  });

  test("an invocation witness cannot be borrowed for rewritten binding parameters", async () => {
    await withHost("Review source only.", REVIEW, async (host, runtime) => {
      const actual = { task: REVIEW, phase: "P" };
      const ctx = host.context();
      const result = await host.invocations.run(ctx, "typesafe_bind_task", "bind-rewritten", actual,
        () => runtime.bind(ctx, "bind-rewritten", { ...actual, planPath: PHASE_PATH }));
      expect(result.status).toBe("UNAVAILABLE");
      expect(host.bindingFacts()).toEqual([]);
    });
  });

  test("future mismatched public call or transport result invalidates source facts without erasing native state", async () => {
    await withHost("Review source only.", REVIEW, async (host, runtime) => {
      const proposal = { task: REVIEW, phase: "P" };
      const ctx = host.context();
      requireBound(await host.invocations.run(ctx, "typesafe_bind_task", "bind-wrong-transport", proposal,
        () => runtime.bind(ctx, "bind-wrong-transport", proposal)));
      expect(runtime.contractFor(ctx, proposal)).toBeDefined();
      host.call("bind-wrong-transport", "typesafe_bind_task", proposal);
      host.result("bind-wrong-transport", "write");
      expect(runtime.contractFor(ctx, proposal)).toBeUndefined();
      expect(runtime.projection(ctx)?.nativePhases?.[0].tasks[0].status).toBe("in_progress");
    });
    await withHost("Review source only.", REVIEW, async (host, runtime) => {
      const proposal = { task: REVIEW, phase: "P" };
      const ctx = host.context();
      requireBound(await host.invocations.run(ctx, "typesafe_bind_task", "bind-wrong-input", proposal,
        () => runtime.bind(ctx, "bind-wrong-input", proposal)));
      host.call("bind-wrong-input", "typesafe_bind_task", { ...proposal, phase: "Different phase" });
      host.result("bind-wrong-input", "typesafe_bind_task");
      expect(runtime.contractFor(ctx, proposal)).toBeUndefined();
      expect(runtime.projection(ctx)?.nativeStateReliable).toBe(true);
    });
  });

  test("cached projections reject changed source payloads even when all actual entry IDs stay unchanged", async () => {
    await withHost("Review source only.", REVIEW, async (host, runtime) => {
      const proposal = { task: REVIEW, phase: "P" };
      requireBound(await host.bind(runtime, "bind-cached-source", proposal));
      const ctx = host.context();
      expect(runtime.contractFor(ctx, proposal)).toBeDefined();
      const ids = host.entries.map((entry) => entry.id);
      const source = host.entries.find((entry) => entry.customType === "omp.typesafe.contract.source.v1")?.data as ContractSourceJournalRecord | undefined;
      if (!source) throw new Error("Binding source missing");
      source.invocationInput.task = "A forged replacement cannot rewrite the genuine native goal.";
      expect(host.entries.map((entry) => entry.id)).toEqual(ids);
      expect(runtime.contractFor(ctx, proposal)).toBeUndefined();
      expect(runtime.projection(ctx)?.nativeStateReliable).toBe(true);
    });
  });

  test("model-created implementation goals and context flags are not execution permission", async () => {
    await withHost("Research the current source without changing implementation.", IMPLEMENT, async (host, runtime) => {
      const outcome = await host.bind(runtime, "bind-unauthorized", { task: IMPLEMENT, phase: "P" }, { isHuman: true, authorized: true, hasUI: true });
      expect(outcome.status).toBe("HUMAN_REQUIRED");
      expect(runtime.contractFor(host.context(), { task: IMPLEMENT, phase: "P" })).toBeUndefined();
      expect(host.bindingFacts()).toEqual([]);
    });
  });

  test("cook input freezes all linked sources but only actual UI grants bounded material scope", async () => {
    await withHost(`/ck:cook --auto ${MASTER_PATH}`, IMPLEMENT, async (host, runtime) => {
      expect((await host.bind(runtime, "bind-cook-without-ui", { task: IMPLEMENT, phase: "P", planPath: PHASE_PATH })).status).toBe("HUMAN_REQUIRED");
      const bound = requireBound(await host.bind(runtime, "bind-cook", { task: IMPLEMENT, phase: "P", planPath: PHASE_PATH }, CONFIRM));
      expect(bound.contract.taskKind).toBe("implementation");
      expect(bound.contract.criteria.map((criterion) => criterion.text)).toEqual([IMPLEMENT]);
      expect(bound.contract.parentRequirements).toEqual([]);
      expect(bound.sourceContext.parentSource?.criteria.some((criterion) => criterion.text.includes("Independent human gold"))).toBe(true);
      expect(bound.sourceContext.parentSource?.master?.path).toBe(MASTER_PATH);
      expect(bound.sourceContext.authorization.kind).toBe("host_confirmation");
      expect(bound.contract.approvedSource.approval.kind).toBe("host_confirmation");
      expect(bound.sourceContext.observedCookInput?.documents.map((document) => document.path)).toEqual([MASTER_PATH, PHASE_PATH, GOLD_PATH]);
      expect(bound.contract.allowedMutationScope.paths).toEqual(expect.arrayContaining(["src/**", "tests/**", PHASE_PATH]));
      expect(bound.contract.approvedCommandIds).toEqual(["affected-tests"]);
      expect(bound.contract.allowedMutationScope.operations).toContain("modify");
    });
  });

  test("extension inputs, skill messages and ambiguous future-user joins remain non-authoritative", async () => {
    await withHost("Review source only.", REVIEW, async (host, runtime) => {
      const ctx = host.context();
      const prompt = `ck:cook --auto ${MASTER_PATH}`;
      const before = host.entries.length;
      await runtime.captureCookInput(ctx, { type: "input", text: prompt, source: "extension" });
      expect(host.entries).toHaveLength(before);
      await runtime.captureCookInput(ctx, { type: "input", text: prompt, source: "interactive" });
      host.append({ type: "custom_message", customType: "skill-prompt", content: prompt });
      let branch = readHostBranch(ctx);
      if (!branch) throw new Error("Input observation branch missing");
      expect(readCookInputObservations(branch, host.cwd)).toEqual([]);
      await runtime.captureCookInput(ctx, { type: "input", text: prompt, source: "rpc" });
      host.user(prompt);
      branch = readHostBranch(ctx);
      if (!branch) throw new Error("Future user branch missing");
      expect(readCookInputObservations(branch, host.cwd)).toEqual([]);
      expect((await host.bind(runtime, "bind-observation-only", { task: REVIEW, phase: "P", planPath: PHASE_PATH })).status).toBe("HUMAN_REQUIRED");
    });
  });

  test("unverified skill help, quoted commands and unlinked phases cannot confer source authority", async () => {
    await withHost("Review source; implementation has not been approved.", IMPLEMENT, async (host, runtime) => {
      host.append({ type: "custom_message", customType: "skill-prompt", content: `# Cook help\nExample /ck:cook --auto ${MASTER_PATH}\nUser: --auto ${MASTER_PATH}` });
      host.user(`Example only; do not execute this:\n/ck:cook --auto ${MASTER_PATH}`);
      expect((await host.bind(runtime, "bind-fake-cook", { task: IMPLEMENT, phase: "P", planPath: PHASE_PATH })).status).toBe("HUMAN_REQUIRED");
      await fs.writeFile(path.join(host.cwd, MASTER_PATH), "# Approved master\n[Another](./phase-99-other.md)\n");
      host.user(`/ck:cook --auto ${MASTER_PATH}`);
      expect((await host.bind(runtime, "bind-unlinked", { task: IMPLEMENT, phase: "P", planPath: PHASE_PATH })).status).toBe("HUMAN_REQUIRED");
      expect(runtime.projection(host.context())?.contracts).toEqual([]);
    });
  });

  test("only actual precise UI confirmation authorizes a source execution grant", async () => {
    await withHost("Investigate the source first.", IMPLEMENT, async (host, runtime) => {
      const prompts: string[] = [];
      const bound = requireBound(await host.bind(runtime, "bind-ui", { task: IMPLEMENT, phase: "P" }, {
        hasUI: true, ui: { async confirm(_title: string, message: string) { prompts.push(message); return true; } },
      }));
      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toContain(IMPLEMENT);
      expect(prompts[0]).toContain("affected-tests");
      expect(prompts[0]).toContain("does not approve completion");
      expect(bound.sourceContext.authorization).toMatchObject({ kind: "host_confirmation", execution: true });
      expect(host.entries.some((entry) => entry.customType === "omp.typesafe.contract.confirmation.v1")).toBe(true);
      expect(JSON.stringify(host.entries.filter((entry) => entry.type === "custom"))).not.toContain("APPROVED_PENDING_COMMIT");
    });
  });

  test("declined confirmation or a branch/incarnation change during UI never writes approval facts", async () => {
    await withHost("Inspect source before proposing implementation.", IMPLEMENT, async (host, runtime) => {
      expect((await host.bind(runtime, "bind-declined", { task: IMPLEMENT, phase: "P" }, {
        hasUI: true, ui: { async confirm() { return false; } },
      })).status).toBe("HUMAN_REQUIRED");
      expect(host.bindingFacts()).toEqual([]);
      const outcome = await host.bind(runtime, "bind-raced", { task: IMPLEMENT, phase: "P" }, {
        hasUI: true, ui: { async confirm() {
          host.native("replace-during-confirm", { op: "init", list: [{ phase: "P", items: [IMPLEMENT] }] }, [{ name: "P", tasks: [{ content: IMPLEMENT, status: "pending" }] }]);
          return true;
        } },
      });
      expect(outcome.status).toBe("EVIDENCE_REQUIRED");
      expect(host.bindingFacts()).toEqual([]);
    });
  });

  test("frozen approved spans survive incidental status edits and retain unmet parent criteria", async () => {
    await withHost(`/ck:cook --auto ${MASTER_PATH}`, IMPLEMENT, async (host, runtime) => {
      const first = requireBound(await host.bind(runtime, "bind-freeze", { task: IMPLEMENT, phase: "P", planPath: PHASE_PATH }, CONFIRM));
      const criterion = first.sourceContext.parentSource?.criteria[1];
      if (!criterion) throw new Error("Fixture parent criterion missing");
      await fs.writeFile(path.join(host.cwd, PHASE_PATH), PHASE_TEXT.replace("status: pending", "status: in_progress"));
      const restarted = host.runtime();
      expect(restarted.contractFor(host.context(), { task: IMPLEMENT, phase: "P" })?.revisionId).toBe(first.contract.revisionId);
      expect(restarted.validators(host.context()).validateSourceSpan(criterion.source)).toBe(true);
      const again = requireBound(await host.bind(restarted, "bind-status-only", { task: IMPLEMENT, phase: "P", planPath: PHASE_PATH }));
      expect(again.contract.revisionId).toBe(first.contract.revisionId);
      expect(again.sourceContext.parentSource?.digest).toBe(first.sourceContext.parentSource?.digest);
      await fs.writeFile(path.join(host.cwd, PHASE_PATH), PHASE_TEXT.replace("- Independent human gold must be available before parent adoption.\n", ""));
      expect((await host.bind(restarted, "bind-unapproved-reduction", { task: IMPLEMENT, phase: "P", planPath: PHASE_PATH })).status).toBe("HUMAN_REQUIRED");
      expect(restarted.sourceContext(first.contract)?.parentSource?.criteria).toEqual(first.sourceContext.parentSource?.criteria);
    });
  });

  test("genuine scope amendment preserves readonly kind and child goal and exposes authenticated prior revisions", async () => {
    await withHost("Review source only and report all findings.", REVIEW, async (host, runtime) => {
      const first = requireBound(await host.bind(runtime, "bind-before-approval", { task: REVIEW, phase: "P" }));
      host.user(`/ck:cook --auto ${MASTER_PATH}`);
      const amended = requireBound(await host.bind(runtime, "bind-real-amendment", { task: REVIEW, phase: "P", planPath: PHASE_PATH }, CONFIRM));
      expect(amended.contract.taskKind).toBe("review");
      expect(amended.contract.revision).toBe(2);
      expect(amended.contract.incarnationId).toBe(first.contract.incarnationId);
      expect(amended.contract.criteria).toEqual(first.contract.criteria);
      expect(amended.contract.parentRequirements).toEqual([]);
      const projection = runtime.projection(host.context());
      expect(projection?.contractRevisions.map((contract) => contract.revision)).toEqual([1, 2]);
      expect(runtime.validators(host.context()).validateAmendment?.(first.contract, amended.contract)).toBe(true);
      expect(runtime.sourceContext(first.contract)?.originalUserRequest.text).toBe("Review source only and report all findings.");
    });
  });

  test("stale calls, proposed approval flags and non-ancestor records cannot bind authority", async () => {
    await withHost("Review source only.", REVIEW, async (host, runtime) => {
      const proposal = { task: REVIEW, phase: "P" };
      expect((await runtime.bind(host.context(), "invented", proposal)).status).toBe("UNAVAILABLE");
      const flagged = { ...proposal, authorized: true, taskKind: "implementation" };
      host.call("flagged", "typesafe_bind_task", flagged);
      const flaggedContext = host.context();
      expect((await host.invocations.run(flaggedContext, "typesafe_bind_task", "flagged", flagged,
        () => runtime.bind(flaggedContext, "flagged", flagged))).status).toBe("REJECTED");
      host.call("stale", "typesafe_bind_task", proposal);
      host.result("stale", "typesafe_bind_task");
      const staleContext = host.context();
      expect((await host.invocations.run(staleContext, "typesafe_bind_task", "different-actual-call", proposal,
        () => runtime.bind(staleContext, "stale", proposal))).status).toBe("UNAVAILABLE");
      const bound = requireBound(await host.bind(runtime, "bind-ancestor", proposal));
      const originalBranch = host.entries;
      host.entries = originalBranch.slice(0, 1);
      expect(runtime.projection(host.context())?.contracts).toEqual([]);
      expect(runtime.sourceContext(bound.contract)).toBeUndefined();
      host.entries = originalBranch;
      expect(runtime.contractFor(host.context(), proposal)?.incarnationId).toBe(bound.contract.incarnationId);
    });
  });

  test("same text reappended cannot inherit the prior incarnation's contract", async () => {
    await withHost("Review source only and retain obligations.", REVIEW, async (host, runtime) => {
      const original = requireBound(await host.bind(runtime, "bind-original", { task: REVIEW, phase: "P" }));
      host.native("remove-original", { op: "rm", task: REVIEW }, [{ name: "P", tasks: [] }]);
      host.native("append-new", { i: "Tracking a new incarnation", op: "append", list: null, task: null, phase: "P", items: [REVIEW], reason: null },
        [{ name: "P", tasks: [{ content: REVIEW, status: "pending" }] }]);
      expect(runtime.contractFor(host.context(), { task: REVIEW, phase: "P" })).toBeUndefined();
      const next = requireBound(await host.bind(runtime, "bind-new", { task: REVIEW, phase: "P" }));
      expect(next.contract.incarnationId).not.toBe(original.contract.incarnationId);
      expect(runtime.projection(host.context())?.nativePhases?.[0].tasks[0].status).toBe("in_progress");
    });
  });
});
