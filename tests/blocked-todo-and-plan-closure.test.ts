import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { canonicalDigest } from "../src/task-contract-source";
import { createTodoLifecycleAuthority, type RecoveryHandoff } from "../src/todo-lifecycle-authority";
import { historicalDebtCatalogue } from "../src/task-verification-debt";
import { assertScopedPlanClosure, parsePlanCliCheck, phaseFileForCheck, PlanClosurePrerequisiteError } from "../src/plan-closure";
import type { HostHistoryEntry } from "../src/host-history";
import type { ContractHistoryProjection, NativeIncarnationReference, TaskContract } from "../src/types/verification";
import type { ContractRuntime } from "../src/contract-runtime";
import type { TaskVerificationRuntime } from "../src/task-verification-runtime";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeTempWorkspace(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "blocked-todo-plan-closure-"));
  tempDirs.push(dir);
  return dir;
}

const validHandoff: RecoveryHandoff = {
  owner: "platform-team",
  nextAction: "Provision upstream staging database credentials and re-run collectVerificationReceipt.",
  unblockCondition: "Staging database responds on port 5432 and integration test exits 0.",
  resumeCommand: "todo unblock task=\"Migrate staging schema\"",
};

describe("Blocked Todo Lifecycle & Debt Persistence Verification", () => {
  test("block preparation rejects missing reason or incomplete RecoveryHandoff fields with EVIDENCE_REQUIRED before UI prompt", async () => {
    const cwd = makeTempWorkspace();
    const entries: HostHistoryEntry[] = [{ id: "e1", parentId: null, type: "message", message: { role: "user", content: "Task A" } }];
    const targetRef: NativeIncarnationReference = {
      incarnationId: canonicalDigest("inc-A"),
      creation: { sessionId: "sess-1", branchId: "e1", entryId: "e1", callId: "init-1" },
      target: { phase: "Phase 1", phaseOrdinal: 0, content: "Migrate staging schema", ordinal: 0 },
      creationKnown: true,
    };
    const projection: ContractHistoryProjection = {
      sessionId: "sess-1",
      branchId: "e1",
      nativeStateReliable: true,
      nativePhases: [{ name: "Phase 1", tasks: [{ content: "Migrate staging schema", status: "in_progress" }] }],
      incarnations: [targetRef],
      contracts: [],
      contractRevisions: [],
      debt: [],
      nativeSuccesses: [],
      nativeFailures: [],
      issues: [],
    };
    let uiCalled = false;
    const ctx = {
      cwd,
      hasUI: true,
      ui: { confirm: async () => { uiCalled = true; return true; } },
      sessionManager: { getSessionId: () => "sess-1", getBranch: () => entries },
    };
    const authority = createTodoLifecycleAuthority({
      appendEntry(customType, data) {
        entries.push({ id: `e-${entries.length + 1}`, parentId: entries.at(-1)!.id, type: "custom", customType, data });
      },
      project: () => projection,
      hasDebt: () => false,
    });

    // Missing reason
    const noReason = await authority.prepare(ctx, {
      input: { op: "block", task: "Migrate staging schema" },
      handoff: validHandoff,
    });
    expect(noReason.status).toBe("EVIDENCE_REQUIRED");
    expect(uiCalled).toBe(false);

    // Incomplete handoff (missing each required key)
    for (const missingKey of ["owner", "nextAction", "unblockCondition", "resumeCommand"] as const) {
      const partial = { ...validHandoff, [missingKey]: "   " };
      const res = await authority.prepare(ctx, {
        input: { op: "block", task: "Migrate staging schema", reason: "Staging DB offline" },
        handoff: partial,
      });
      expect(res.status).toBe("EVIDENCE_REQUIRED");
      expect(uiCalled).toBe(false);
    }
  });

  test("prepared block grant is single-use and immediately invalidated if target state changes before consume", async () => {
    const cwd = makeTempWorkspace();
    const entries: HostHistoryEntry[] = [{ id: "e1", parentId: null, type: "message", message: { role: "user", content: "Task A" } }];
    const targetRef: NativeIncarnationReference = {
      incarnationId: canonicalDigest("inc-A"),
      creation: { sessionId: "sess-1", branchId: "e1", entryId: "e1", callId: "init-1" },
      target: { phase: "Phase 1", phaseOrdinal: 0, content: "Migrate staging schema", ordinal: 0 },
      creationKnown: true,
    };
    let currentStatus: "in_progress" | "blocked" | "pending" = "in_progress";
    let debtFlag = false;
    const projection = (): ContractHistoryProjection => ({
      sessionId: "sess-1",
      branchId: entries.at(-1)!.id,
      nativeStateReliable: true,
      nativePhases: [{ name: "Phase 1", tasks: [{ content: "Migrate staging schema", status: currentStatus }] }],
      incarnations: [targetRef],
      contracts: [],
      contractRevisions: [],
      debt: [],
      nativeSuccesses: [],
      nativeFailures: [],
      issues: [],
    });
    const ctx = {
      cwd,
      hasUI: true,
      ui: { confirm: async () => true },
      sessionManager: { getSessionId: () => "sess-1", getBranch: () => entries },
    };
    const authority = createTodoLifecycleAuthority({
      appendEntry(customType, data) {
        entries.push({ id: `e-${entries.length + 1}`, parentId: entries.at(-1)!.id, type: "custom", customType, data });
      },
      project: projection,
      hasDebt: () => debtFlag,
    });

    const input = { op: "block", task: "Migrate staging schema", reason: "Staging DB offline" };
    const prepared = await authority.prepare(ctx, { input, handoff: validHandoff });
    expect(prepared.status).toBe("PREPARED");

    // First consume succeeds
    const firstConsume = await authority.consume(ctx, input);
    expect(firstConsume.allowed).toBe(true);

    // Second consume with identical input fails (single-use grant)
    const secondConsume = await authority.consume(ctx, input);
    expect(secondConsume.allowed).toBe(false);

    // Re-prepare, then mutate debt state before consume -> targetDigest mismatch blocks consume
    const prepared2 = await authority.prepare(ctx, { input, handoff: validHandoff });
    expect(prepared2.status).toBe("PREPARED");
    debtFlag = true;
    const mutatedConsume = await authority.consume(ctx, input);
    expect(mutatedConsume.allowed).toBe(false);
  });

  test("historicalDebtCatalogue retains semantic_rejection, contract_debt, and unclassified_native_failure across blocked/open/abandoned states", () => {
    const incId = canonicalDigest("inc-debt-test");
    const creation = { sessionId: "sess-debt", branchId: "b1", entryId: "e-init", callId: "c-init" };
    const target = { phase: "Core", phaseOrdinal: 0, content: "Verify atomic invariant", ordinal: 0 };
    const contractRef = { contractId: "c1", revisionId: "r1", incarnationId: incId };
    const entries: HostHistoryEntry[] = [
      { id: "e-init", parentId: null, type: "message", message: { role: "toolResult", toolName: "todo", toolCallId: "c-init" } },
      { id: "e-fail", parentId: "e-init", type: "message", message: { role: "toolResult", toolName: "todo", toolCallId: "c-fail", isError: true } },
    ];
    const targetRef: NativeIncarnationReference = { incarnationId: incId, creation, target, creationKnown: true };

    const projection: ContractHistoryProjection = {
      sessionId: "sess-debt",
      branchId: "e-fail",
      nativeStateReliable: true,
      nativePhases: [{ name: "Core", tasks: [{ content: "Verify atomic invariant", status: "blocked", blocker: "Waiting on upstream" }] }],
      incarnations: [targetRef],
      contracts: [],
      contractRevisions: [],
      debt: [{
        debtId: "contract-debt-1",
        contract: contractRef,
        criterionIds: ["crit-1"],
        reason: "Unresolved amendment obligation",
        sourceEntryId: "e-init",
      }],
      nativeSuccesses: [],
      nativeFailures: [{
        callId: "c-fail",
        resultEntryId: "e-fail",
        operation: "done",
        inputDigest: canonicalDigest({ op: "done", task: "Verify atomic invariant" }),
        targets: [{ before: targetRef, after: targetRef, beforeStatus: "in_progress", afterStatus: "in_progress", completionReported: false }],
      }],
      issues: [],
    };

    const ctx = { sessionManager: { getSessionId: () => "sess-debt", getBranch: () => entries } };
    const runtimeOpts = {
      contracts: { projection: () => projection },
    } as unknown as Parameters<typeof historicalDebtCatalogue>[0];

    const catalogue = historicalDebtCatalogue(
      runtimeOpts,
      ctx,
      incId,
      [{
        status: "REJECTED",
        contract: contractRef,
        criterionIds: ["crit-1"],
        reasons: ["Criterion crit-1 not satisfied"],
        sourceEntryId: "e-init",
        callId: "rev-1",
        bindingDigest: canonicalDigest("bind-1"),
        progressDigest: canonicalDigest("prog-1"),
        semanticDispatch: true,
      }],
      () => false,
      () => false
    );

    expect(catalogue).toBeDefined();
    expect(catalogue!.lifecycle).toBe("open");
    expect(catalogue!.debts.map(d => d.kind).sort()).toEqual([
      "contract_debt",
      "semantic_rejection",
      "unclassified_native_failure",
    ]);
  });
});

describe("Blocked Plan & Scoped Plan Closure Verification (src/plan-closure.ts)", () => {
  test("parsePlanCliCheck strictly parses direct plan-cli check commands and rejects shell metacharacters", () => {
    expect(parsePlanCliCheck("node plan-cli.cjs check 1")).toEqual({ kind: "complete", phase: 1 });
    expect(parsePlanCliCheck("bun \"C:/tools/plan-cli.cjs\" check 3 --start")).toEqual({ kind: "start", phase: 3 });
    expect(parsePlanCliCheck("echo hello")).toEqual({ kind: "other" });

    for (const unsafe of [
      "node plan-cli.cjs check 1 && echo pwned",
      "node plan-cli.cjs check 1; rm -rf /",
      "node plan-cli.cjs check 0",
      "node plan-cli.cjs check -2",
      "node plan-cli.cjs check 1 --force",
      "node plan-cli.cjs check $( (1) )",
    ]) {
      expect(parsePlanCliCheck(unsafe)).toEqual({ kind: "unsupported" });
    }
  });

  test("phaseFileForCheck resolves unambiguous phase file and rejects traversal or duplicate phase matches", () => {
    const cwd = makeTempWorkspace();
    const planDir = path.join(cwd, "plans", "feature-x");
    mkdirSync(planDir, { recursive: true });
    writeFileSync(path.join(planDir, "phase-01-setup.md"), "# Phase 1\n", "utf8");

    expect(phaseFileForCheck(cwd, "plans/feature-x", 1)).toBe("plans/feature-x/phase-01-setup.md");
    expect(() => phaseFileForCheck(cwd, "../outside", 1)).toThrow(PlanClosurePrerequisiteError);
    expect(() => phaseFileForCheck(cwd, "plans/feature-x", 2)).toThrow(PlanClosurePrerequisiteError);

    // Ambiguous duplicate phase-1 files
    writeFileSync(path.join(planDir, "phase-1-duplicate.md"), "# Duplicate Phase 1\n", "utf8");
    expect(() => phaseFileForCheck(cwd, "plans/feature-x", 1)).toThrow(PlanClosurePrerequisiteError);
  });

  test("assertScopedPlanClosure blocks a plan whose own task is blocked/indebted, but allows closing an independent completed plan in the same session", async () => {
    const cwd = makeTempWorkspace();
    mkdirSync(path.join(cwd, "plans", "plan-alpha"), { recursive: true });
    mkdirSync(path.join(cwd, "plans", "plan-beta"), { recursive: true });
    writeFileSync(path.join(cwd, "plans", "plan-alpha", "plan.md"), "# Plan Alpha\n", "utf8");
    writeFileSync(path.join(cwd, "plans", "plan-beta", "plan.md"), "# Plan Beta\n", "utf8");

    const incAlpha = canonicalDigest("inc-alpha");
    const incBeta = canonicalDigest("inc-beta");

    const contractAlpha = {
      incarnationId: incAlpha,
      target: { phase: "Alpha", phaseOrdinal: 0, content: "Alpha blocked task", ordinal: 0 },
    } as unknown as TaskContract;
    const contractBeta = {
      incarnationId: incBeta,
      target: { phase: "Beta", phaseOrdinal: 1, content: "Beta completed task", ordinal: 0 },
    } as unknown as TaskContract;

    const projection: ContractHistoryProjection = {
      sessionId: "sess-plan",
      branchId: "b-1",
      nativeStateReliable: true,
      nativePhases: [
        { name: "Alpha", tasks: [{ content: "Alpha blocked task", status: "blocked", blocker: "External API down" }] },
        { name: "Beta", tasks: [{ content: "Beta completed task", status: "completed" }] },
      ],
      incarnations: [
        { incarnationId: incAlpha, creation: { sessionId: "sess-plan", branchId: "b-1", entryId: "e1", callId: "c1" }, target: contractAlpha.target, creationKnown: true },
        { incarnationId: incBeta, creation: { sessionId: "sess-plan", branchId: "b-1", entryId: "e1", callId: "c1" }, target: contractBeta.target, creationKnown: true },
      ],
      contracts: [contractAlpha, contractBeta],
      contractRevisions: [contractAlpha, contractBeta],
      debt: [],
      nativeSuccesses: [],
      nativeFailures: [],
      issues: [],
    };

    const contracts = {
      projection: () => projection,
      sourceContext(contract: TaskContract) {
        if (contract.incarnationId === incAlpha) {
          return { parentSource: { path: "plans/plan-alpha/plan.md", phaseHeading: "Phase 1" } };
        }
        return { parentSource: { path: "plans/plan-beta/plan.md", phaseHeading: "Phase 1" } };
      },
    } as unknown as ContractRuntime;

    let betaAdvisorReviewed = false;
    const verification = {
      hasDebt(_ctx: unknown, incarnationId: string) {
        return incarnationId === incAlpha;
      },
      async getCurrentPlanPhaseReview(_ctx: unknown, planPath: string) {
        return planPath === "plans/plan-beta/plan.md" && betaAdvisorReviewed;
      },
    } as unknown as TaskVerificationRuntime;

    // 1. Closing Plan Alpha fails because its bound task is blocked and has debt
    await expect(assertScopedPlanClosure(contracts, verification, {}, cwd, "plans/plan-alpha/plan.md"))
      .rejects.toThrow(/only this plan's bound obligations require recovery: Alpha blocked task/);

    // 2. Closing Plan Beta before independent Advisor plan-phase review fails with REVIEW_REQUIRED
    await expect(assertScopedPlanClosure(contracts, verification, {}, cwd, "plans/plan-beta/plan.md"))
      .rejects.toThrow(/REVIEW_REQUIRED: execute an actual independent typesafe_advisor plan-review/);

    // 3. Once Plan Beta has its Advisor plan-phase review, closing Plan Beta succeeds even though Plan Alpha remains blocked!
    betaAdvisorReviewed = true;
    await expect(assertScopedPlanClosure(contracts, verification, {}, cwd, "plans/plan-beta/plan.md"))
      .resolves.toBeUndefined();
  });
});
