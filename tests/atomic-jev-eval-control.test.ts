import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { canonicalDigest } from "../src/task-contract-source";
import {
  createAtomicJudge,
  validateAtomicReceipt,
  type AtomicInput,
  type PredicateSpec,
} from "../src/atomic-judge";
import {
  decideAtomicNoul,
  resolveAtomicDecisionPolicy,
  type AtomicPredicateDecisionPolicy,
} from "../src/atomic-decision-policy";
import { prepareAtomicInput } from "../src/atomic-preparation";
import { createAtomicParentPredicates } from "../src/atomic-parent";
import { createPairedReviewDriver } from "../src/atomic-evaluation";
import { DEFAULT_SEMANTIC_APPROVAL_POLICY } from "../src/semantic-approval-policy";
import { runMultiPersonaDebate } from "../src/debate-evaluator";
import { advisorFixture } from "./advisor-fixtures";
import { AdvisorHostFixture, advisorValue, object } from "./advisor-host-fixture";
import { createAdvisorRequest, makeAdvisorReceipt } from "../src/advisor-protocol";
import { shadowAdvisorDispatchId, type NativeAdvisorReview } from "../src/advisor-shadow";
const { judgeTypeSafe, redactEvidenceState } = createRequire(import.meta.url)("../src/typesafe-api-client.cjs") as {
  judgeTypeSafe(options: Record<string, unknown>): Promise<{
    ok: boolean;
    code?: string;
    answers?: Record<string, { noul?: number; choice?: string; score?: number; confidence?: number }>;
    metadata?: { resolvedModel?: string; usage?: Record<string, unknown>; policyIdentity?: string };
  }>;
  redactEvidenceState(state: unknown, options?: { apiKey?: string }): Record<string, unknown>;
};

function makeAtomicInput(): AtomicInput {
  const { request, contract, packetSet } = advisorFixture("shadow");
  return prepareAtomicInput({
    contract,
    packetSet,
    binding: request.binding,
    snapshot: request.snapshot,
    model: "jev-latest",
  });
}

function createScriptedJevFetch(
  responder: (questionId: string, question: { type: string; instructions: string; criteria?: unknown }, body: Record<string, unknown>) => unknown,
  recordedBodies: Record<string, unknown>[] = []
): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    recordedBodies.push(body);
    const questions = body.questions as Record<string, { type: string; instructions: string; criteria?: unknown }>;
    const answers = Object.fromEntries(
      Object.entries(questions).map(([qId, q]) => [qId, responder(qId, q, body)])
    );
    return new Response(
      JSON.stringify({
        answers,
        model: "jev-1.14.0",
        usage: {
          input_tokens: 96,
          output_tokens: 32,
          total_tokens: 128,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;
}

describe("Atomic Noul Decision Policies & Micro-Task Control (src/atomic-decision-policy.ts & src/atomic-judge.ts)", () => {
  test("support_only policy maps JEV noul > threshold to supports and <= threshold (including 0.0) to insufficient (open-world)", async () => {
    const policy: AtomicPredicateDecisionPolicy = {
      schemaVersion: 1,
      categorical: "declared_relations",
      noul: {
        semanticMode: "support_only",
        orientation: "support_probability",
        supportsAbove: 0.8,
        uncertainty: "strict_boundary_or_missing_evidence_insufficient",
      },
    };
    const resolved = resolveAtomicDecisionPolicy(policy);
    expect(resolved.ok).toBe(true);

    for (const [score, expectedRelation, expectedStatus] of [
      [0.92, "supports", "supported"],
      [0.8, "insufficient", "insufficient"],
      [0.05, "insufficient", "insufficient"],
    ] as const) {
      const input = structuredClone(makeAtomicInput());
      input.predicates = [{
        ...input.predicates[0],
        answerType: "noul",
        semanticMode: "open_world_support",
      }];
      const receipt = await createAtomicJudge({
        apiKey: "test-key",
        predicateDecisionPolicy: policy,
        fetchImpl: createScriptedJevFetch(() => ({ noul: score })),
      }).review(input);

      expect(receipt.outcomes[0].probability).toBe(score);
      expect(receipt.outcomes[0].relation).toBe(expectedRelation);
      expect(receipt.status).toBe(expectedStatus);
    }
  });

  test("closed_world_boolean policy enforces supportsAbove, contradictsBelow, and strict uncertainty band", async () => {
    const policy: AtomicPredicateDecisionPolicy = {
      schemaVersion: 1,
      categorical: "declared_relations",
      noul: {
        semanticMode: "closed_world_boolean",
        orientation: "support_probability",
        supportsAbove: 0.75,
        contradictsBelow: 0.25,
        uncertainty: "strict_boundary_or_missing_evidence_insufficient",
      },
    };

    for (const [score, expectedRelation, expectedStatus] of [
      [0.88, "supports", "supported"],
      [0.5, "insufficient", "insufficient"],
      [0.75, "insufficient", "insufficient"],
      [0.25, "insufficient", "insufficient"],
      [0.12, "contradicts", "contradicted"],
    ] as const) {
      const input = structuredClone(makeAtomicInput());
      input.predicates = [{
        ...input.predicates[0],
        answerType: "noul",
        semanticMode: "closed_world_boolean",
      }];
      const receipt = await createAtomicJudge({
        apiKey: "test-key",
        predicateDecisionPolicy: policy,
        fetchImpl: createScriptedJevFetch(() => ({ noul: score })),
      }).review(input);

      expect(receipt.outcomes[0].relation).toBe(expectedRelation);
      expect(receipt.status).toBe(expectedStatus);
    }
  });

  test("counterevidence_only policy requires counterevidenceRefs and contradicts only above contradictsAbove", async () => {
    const policy: AtomicPredicateDecisionPolicy = {
      schemaVersion: 1,
      categorical: "declared_relations",
      noul: {
        semanticMode: "counterevidence_only",
        orientation: "contradiction_probability",
        contradictsAbove: 0.7,
        uncertainty: "strict_boundary_or_missing_evidence_insufficient",
      },
    };

    const baseInput = structuredClone(makeAtomicInput());
    baseInput.packetSet.packets[0].packet.counterevidence = ["counter:regression-log"];
    baseInput.packetSet.packets[0].digest = canonicalDigest(baseInput.packetSet.packets[0].packet);
    baseInput.packetSet.manifest.packets[0].digest = baseInput.packetSet.packets[0].digest;
    const packetDigest = baseInput.packetSet.packets[0].digest;

    const withCounter: PredicateSpec = {
      ...baseInput.predicates[0],
      packetDigest,
      answerType: "noul",
      semanticMode: "counterevidence",
      counterevidenceRefs: ["counter:regression-log"],
    };
    baseInput.predicates = [withCounter];
    baseInput.rubricDigest = canonicalDigest({ version: "atomic-relations-v1", predicates: baseInput.predicates });

    const contradictedReceipt = await createAtomicJudge({
      apiKey: "test-key",
      predicateDecisionPolicy: policy,
      fetchImpl: createScriptedJevFetch(() => ({ noul: 0.85 })),
    }).review(baseInput);
    expect(contradictedReceipt.outcomes[0].relation).toBe("contradicts");
    expect(contradictedReceipt.status).toBe("contradicted");

    // Without counterevidenceRefs, even noul=0.99 cannot contradict
    expect(
      decideAtomicNoul(
        0.99,
        { id: "p1", semanticMode: "counterevidence", applicability: "applicable", evidenceRefs: ["e1"], counterevidenceRefs: [] },
        policy
      )
    ).toBe("insufficient");
  });

  test("byPredicate policy controls heterogeneous micro-predicates in one batch and rejects semanticMode mismatch", async () => {
    const input = structuredClone(makeAtomicInput());
    const p1: PredicateSpec = {
      ...input.predicates[0],
      id: "q_micro_support",
      claim: "Micro-task 1: input validation returns clean integer",
      answerType: "noul",
      semanticMode: "open_world_support",
    };
    const p2: PredicateSpec = {
      ...input.predicates[0],
      id: "q_micro_boolean",
      claim: "Micro-task 2: boundary check rejects negative numbers",
      answerType: "noul",
      semanticMode: "closed_world_boolean",
    };
    input.predicates = [p1, p2];
    input.rubricDigest = canonicalDigest({ version: "atomic-relations-v1", predicates: input.predicates });

    const policy: AtomicPredicateDecisionPolicy = {
      schemaVersion: 1,
      categorical: "declared_relations",
      byPredicate: {
        q_micro_support: {
          semanticMode: "support_only",
          orientation: "support_probability",
          supportsAbove: 0.7,
          uncertainty: "strict_boundary_or_missing_evidence_insufficient",
        },
        q_micro_boolean: {
          semanticMode: "closed_world_boolean",
          orientation: "support_probability",
          supportsAbove: 0.8,
          contradictsBelow: 0.2,
          uncertainty: "strict_boundary_or_missing_evidence_insufficient",
        },
      },
    };

    const bodies: Record<string, unknown>[] = [];
    const receipt = await createAtomicJudge({
      apiKey: "test-key",
      predicateDecisionPolicy: policy,
      fetchImpl: createScriptedJevFetch((qId) => (qId === "q_micro_support" ? { noul: 0.78 } : { noul: 0.91 }), bodies),
    }).review(input);

    expect(bodies).toHaveLength(1);
    expect(receipt.status).toBe("supported");
    expect(receipt.outcomes.map(o => [o.predicateId, o.relation])).toEqual([
      ["q_micro_support", "supports"],
      ["q_micro_boolean", "supports"],
    ]);

    // Mismatched semanticMode (closed_world_boolean policy on open_world_support predicate) fails closed without HTTP dispatch
    const mismatchInput = structuredClone(input);
    mismatchInput.predicates = [{ ...p1, id: "q_micro_boolean" }];
    const mismatchBodies: Record<string, unknown>[] = [];
    const mismatchReceipt = await createAtomicJudge({
      apiKey: "test-key",
      predicateDecisionPolicy: policy,
      fetchImpl: createScriptedJevFetch(() => ({ noul: 0.99 }), mismatchBodies),
    }).review(mismatchInput);
    expect(mismatchBodies).toHaveLength(0);
    expect(mismatchReceipt.failureCode).toBe("atomic_noul_semantics_policy_mismatch");
    expect(mismatchReceipt.status).toBe("unavailable");
  });
});

describe("Atomic Parent Integration DAG & Multi-Wave Verification (src/atomic-parent.ts)", () => {
  test("all child micro-predicates supporting still fails overall task when parent integration predicate is contradicted or insufficient", async () => {
    const base = structuredClone(makeAtomicInput());
    const parentReq = {
      parentContractId: "parent-contract",
      criterionId: "parent-crit-1",
      source: {
        path: "plans/public-plan.md",
        digest: base.criteria[0].source.digest,
        startLine: 1,
        endLine: 1,
        text: "Child module outputs must wire into parent pipeline without type mismatch",
      },
    };
    base.packetSet.packets[0].packet.parentRequirements = [parentReq];
    base.packetSet.packets[0].packet.integrationReceipts = [{
      receiptId: "integration-receipt-1",
      parentContractId: "parent-contract",
      criterionId: "parent-crit-1",
      childIncarnationId: base.binding.purpose === "shadow" ? "incarnation" : base.binding.contract.incarnationId,
      digest: canonicalDigest("int-1"),
    }];
    base.packetSet.packets[0].digest = canonicalDigest(base.packetSet.packets[0].packet);
    base.packetSet.manifest.packets[0].digest = base.packetSet.packets[0].digest;
    base.packetSet.manifest.parentRequirements = [parentReq];

    const childPredicate: PredicateSpec = {
      ...base.predicates[0],
      packetDigest: base.packetSet.packets[0].digest,
    };
    const parentPredicates = createAtomicParentPredicates(base.packetSet, [childPredicate]);
    expect(parentPredicates).toHaveLength(1);
    expect(parentPredicates[0].dependsOn).toEqual([childPredicate.id]);

    base.predicates = [childPredicate, ...parentPredicates];
    base.rubricDigest = canonicalDigest({ version: "atomic-relations-v1", predicates: base.predicates });

    const bodies: Record<string, unknown>[] = [];
    const receipt = await createAtomicJudge({
      apiKey: "test-key",
      fetchImpl: createScriptedJevFetch((qId) => ({
        choice: qId.startsWith("parent_") ? "contradicts" : "supports",
        confidence: 0.95,
      }), bodies),
    }).review(base);

    expect(bodies).toHaveLength(2);
    expect((bodies[1].state as Record<string, unknown>).parent_integration).toBeDefined();
    expect(receipt.status).toBe("contradicted");
    expect(receipt.contradictedParentRequirementIds).toEqual(["parent:parent-contract:parent-crit-1"]);
    expect(receipt.uncoveredParentRequirementIds).toEqual(["parent:parent-contract:parent-crit-1"]);
  });
});

describe("Paired Review Driver M vs H (Atomic) Evaluation & Live JEV Integration", () => {
  test("createPairedReviewDriver approves both M and H arms when JEV + host-settled Shadow Advisor agree, and rejects synthetic unowned Advisor receipts", async () => {
    const { request, contract, packetSet, context: bindingContext } = advisorFixture("shadow");
    const atomic = prepareAtomicInput({
      contract,
      packetSet,
      binding: request.binding,
      snapshot: request.snapshot,
      model: "jev-latest",
    });
    const evalInput = {
      atomic,
      macro: {
        contract,
        todoTask: contract.target.content,
        planRequirements: contract.criteria.map(c => c.text),
        diffSummary: "1 file changed",
        unifiedDiff: "diff --git a/src/public.ts b/src/public.ts\n+export const ok = true;\n",
        testSummary: "1 pass",
      },
      advisorRequest: request,
    };

    // 1. Synthetic unowned Advisor receipt (not minted by AdvisorHost) is rejected with current_host_owned_native_review_required
    const syntheticDriver = createPairedReviewDriver({
      apiKey: "test-key",
      approvalPolicy: DEFAULT_SEMANTIC_APPROVAL_POLICY,
      fetchImpl: createScriptedJevFetch(() => ({ choice: "supports", confidence: 0.95 })),
      async dispatchAdvisor(req) {
        const receipt = makeAdvisorReceipt(
          req,
          {
            verdict: "proceed",
            recommendation: "Proceed",
            rankedOptions: [{ rank: 1, option: "Proceed", rationale: "Valid" }],
            findings: [],
            confidence: 0.9,
            openQuestions: [],
            criterionCoverage: [{ criterionId: req.criterionIds[0], status: "covered", evidenceRefs: [req.evidenceRefs[0]] }],
            parentIntegration: { status: "not_applicable", criterionIds: [], evidenceRefs: [] },
          },
          "synthetic-child",
          canonicalDigest("synthetic-terminal")
        );
        return { request: req, receipt };
      },
    });
    const unownedRes = await syntheticDriver.evaluate("H", evalInput, {
      mode: "shadow",
      allowMutation: false,
      allowAuthorityReuse: false,
      runId: "run-1",
      caseId: "case-1",
    });
    expect(unownedRes.disposition).toBe("UNAVAILABLE");
    expect(unownedRes.reasons).toEqual(["current_host_owned_native_review_required"]);

    // 2. Host-settled Shadow Advisor review via AdvisorHostFixture succeeds for both H and M arms
    for (const arm of ["H", "M"] as const) {
      const host = new AdvisorHostFixture(`shadow-session-${arm}`);
      host.finalize = (draft, ctx, id, itemIndex) =>
        createAdvisorRequest(
          { ...draft, parentToolCallId: id, itemIndex },
          { ...bindingContext, sessionId: ctx.sessionManager.getSessionId(), purpose: "shadow", expectedProvenance: draft.binding.provenance }
        );
      await host.start();

      const driver = createPairedReviewDriver({
        apiKey: "test-key",
        approvalPolicy: DEFAULT_SEMANTIC_APPROVAL_POLICY,
        fetchImpl: createScriptedJevFetch((qId, q) => {
          if (q.type === "noul") return { noul: 0.94 };
          if (qId === "deliverables_verdict") return { choice: "APPROVE", confidence: 0.95 };
          if (qId === "architectural_drift") return { choice: "no_drift", confidence: 0.95 };
          if (qId === "scope_mode") return { choice: "HOLD", confidence: 0.95 };
          if (qId.startsWith("criterion_")) return { choice: "satisfied", confidence: 0.95 };
          if (q.type === "score") return { score: 0, confidence: 0.9 };
          return { choice: "supports", confidence: 0.95 };
        }),
        async dispatchAdvisor(req, _signal, execution) {
          const prepared = advisorValue(
            await host.registration.prepareShadowReview(async (ctx) => {
              const { requestId: _id, requestDigest: _rd, bindingDigest: _bd, promptDigest: _pd, parentToolCallId: _call, itemIndex: _idx, ...draft } = req;
              return {
                ...draft,
                binding: {
                  ...draft.binding,
                  provenance: {
                    ...draft.binding.provenance,
                    sessionId: ctx.sessionManager.getSessionId(),
                    dispatchId: shadowAdvisorDispatchId(execution),
                  },
                },
                sessionEpoch: ctx.advisorSessionEpoch,
                parentAgentId: ctx.agent.id,
              };
            }, host.context)
          );
          const nativeOut = await host.nativeReview(object(prepared.parameters));
          host.persistNativeResult(nativeOut);
          const settled = await host.registration.settlement(String(prepared.token), host.context);
          if (!settled || settled.status !== "accepted") {
            return { status: "UNAVAILABLE", reasons: ["shadow_settlement_failed"] };
          }
          return settled.review;
        },
      });

      const result = await driver.evaluate(arm, evalInput, {
        mode: "shadow",
        allowMutation: false,
        allowAuthorityReuse: false,
        runId: "run-1",
        caseId: "case-1",
      });
      expect(result.disposition).toBe("APPROVE");
      expect(result.status).toBe("terminal");
      expect(result.mutationAllowed).toBe(false);
      expect(result.authorityReusable).toBe(false);
      expect(result.attempts.length).toBeGreaterThan(0);
    }
  });

  test("judgeTypeSafe & redactEvidenceState evaluate atomic micro-task primitives (noul, choice, score) and preserve numeric token telemetry", async () => {
    const liveKey = process.env.OMP_LIVE_TYPESAFE_TESTS === "1" ? process.env.TYPESAFE_API_KEY?.trim() : undefined;
    const recordedBodies: Record<string, unknown>[] = [];
    const fetchImpl = liveKey
      ? globalThis.fetch
      : createScriptedJevFetch((qId, q) => {
          if (q.type === "noul") return { noul: 0.98 };
          if (q.type === "choice") return { choice: "pure_function", confidence: 0.99 };
          return { score: 2, confidence: 0.92 };
        }, recordedBodies);

    const response = await judgeTypeSafe({
      apiKey: liveKey || "hermetic-test-key",
      fetchImpl,
      args: {
        state: {
          atomicTask: "Validate clamp(value, min, max) returns bounded integer",
          code: "export function clamp(v: number, min: number, max: number): number { return Math.min(max, Math.max(min, v)); }",
        },
        model: "jev-latest",
        questions: {
          enforces_bounds: {
            type: "noul",
            instructions: "Does clamp(v, min, max) strictly bound v within [min, max] when min <= max?",
          },
          function_purity: {
            type: "choice",
            instructions: "Classify the side-effect profile of clamp.",
            criteria: {
              pure_function: "Deterministic output with zero I/O or mutation",
              impure_io: "Performs I/O or mutates external state",
            },
          },
          atomic_quality: {
            type: "score",
            instructions: "Rate the implementation clarity of clamp.",
            criteria: [
              "Broken or incorrect bounds logic",
              "Partially bounds input",
              "Clean, exact, and minimal bounds implementation",
            ],
          },
        },
      },
    });

    expect(response.ok).toBe(true);
    expect(typeof response.answers?.enforces_bounds?.noul).toBe("number");
    expect(response.answers!.enforces_bounds!.noul!).toBeGreaterThan(0.8);
    expect(response.answers?.function_purity?.choice).toBe("pure_function");
    expect(typeof response.answers?.atomic_quality?.score).toBe("number");

    const redactedUsage = redactEvidenceState({
      usage: response.metadata?.usage ?? { input_tokens: 96, output_tokens: 32, total_tokens: 128 },
    });
    const usage = redactedUsage.usage as Record<string, unknown>;
    expect(typeof usage.input_tokens).toBe("number");
    expect(typeof usage.output_tokens).toBe("number");
  });

  test("validateAtomicReceipt rejects tampered receiptId, packetDigest, rubricDigest, or decisionPolicyDigest", async () => {
    const input = structuredClone(makeAtomicInput());
    const policy: AtomicPredicateDecisionPolicy = {
      schemaVersion: 1,
      categorical: "declared_relations",
      noul: {
        semanticMode: "support_only",
        orientation: "support_probability",
        supportsAbove: 0.7,
        uncertainty: "strict_boundary_or_missing_evidence_insufficient",
      },
    };
    const receipt = await createAtomicJudge({
      apiKey: "test-key",
      predicateDecisionPolicy: policy,
      fetchImpl: createScriptedJevFetch(() => ({ choice: "supports", confidence: 0.9 })),
    }).review(input);

    const expectation = {
      binding: input.binding,
      snapshot: input.snapshot,
      criterionIds: input.criteria.map(c => c.id),
      packetDigest: canonicalDigest(input.packetSet.manifest),
      rubricDigest: input.rubricDigest,
      decisionPolicyDigest: canonicalDigest(policy),
    };
    expect(validateAtomicReceipt(receipt, expectation)).toBe(true);
    expect(validateAtomicReceipt({ ...receipt, receiptId: "atomic:0000" }, expectation)).toBe(false);
    expect(validateAtomicReceipt(receipt, { ...expectation, packetDigest: canonicalDigest("other-packet") })).toBe(false);
    expect(validateAtomicReceipt(receipt, { ...expectation, rubricDigest: canonicalDigest("other-rubric") })).toBe(false);
    expect(validateAtomicReceipt(receipt, { ...expectation, decisionPolicyDigest: canonicalDigest("other-policy") })).toBe(false);
  });

  test("createPairedReviewDriver rejects reusing the same settled native Advisor receipt across two evaluations (shadow_native_receipt_reuse_forbidden)", async () => {
    const { request, contract, packetSet, context: bindingContext } = advisorFixture("shadow");
    const atomic = prepareAtomicInput({
      contract,
      packetSet,
      binding: request.binding,
      snapshot: request.snapshot,
      model: "jev-latest",
    });
    const evalInput = {
      atomic,
      macro: {
        contract,
        todoTask: contract.target.content,
        planRequirements: contract.criteria.map(c => c.text),
        diffSummary: "1 file changed",
        unifiedDiff: "diff --git a/src/public.ts b/src/public.ts\n+export const ok = true;\n",
        testSummary: "1 pass",
      },
      advisorRequest: request,
    };

    const host = new AdvisorHostFixture("shadow-reuse-session");
    host.finalize = (draft, ctx, id, itemIndex) =>
      createAdvisorRequest(
        { ...draft, parentToolCallId: id, itemIndex },
        { ...bindingContext, sessionId: ctx.sessionManager.getSessionId(), purpose: "shadow", expectedProvenance: draft.binding.provenance }
      );
    await host.start();

    let cachedReview: NativeAdvisorReview | undefined;
    const driver = createPairedReviewDriver({
      apiKey: "test-key",
      approvalPolicy: DEFAULT_SEMANTIC_APPROVAL_POLICY,
      fetchImpl: createScriptedJevFetch(() => ({ choice: "supports", confidence: 0.95 })),
      async dispatchAdvisor(req, _signal, execution) {
        if (!cachedReview) {
          const prepared = advisorValue(
            await host.registration.prepareShadowReview(async (ctx) => {
              const { requestId: _id, requestDigest: _rd, bindingDigest: _bd, promptDigest: _pd, parentToolCallId: _call, itemIndex: _idx, ...draft } = req;
              return {
                ...draft,
                binding: {
                  ...draft.binding,
                  provenance: {
                    ...draft.binding.provenance,
                    sessionId: ctx.sessionManager.getSessionId(),
                    dispatchId: shadowAdvisorDispatchId(execution),
                  },
                },
                sessionEpoch: ctx.advisorSessionEpoch,
                parentAgentId: ctx.agent.id,
              };
            }, host.context)
          );
          const nativeOut = await host.nativeReview(object(prepared.parameters));
          host.persistNativeResult(nativeOut);
          const settled = await host.registration.settlement(String(prepared.token), host.context);
          if (!settled || settled.status !== "accepted") {
            return { status: "UNAVAILABLE", reasons: ["shadow_settlement_failed"] };
          }
          cachedReview = settled.review;
        }
        return cachedReview;
      },
    });

    const firstRun = await driver.evaluate("H", evalInput, {
      mode: "shadow",
      allowMutation: false,
      allowAuthorityReuse: false,
      runId: "run-reuse",
      caseId: "case-reuse",
    });
    expect(firstRun.disposition).toBe("APPROVE");

    const secondRunReusingSameReceipt = await driver.evaluate("H", evalInput, {
      mode: "shadow",
      allowMutation: false,
      allowAuthorityReuse: false,
      runId: "run-reuse",
      caseId: "case-reuse",
    });
    expect(secondRunReusingSameReceipt.disposition).toBe("UNAVAILABLE");
    expect(secondRunReusingSameReceipt.reasons).toEqual(["shadow_native_receipt_reuse_forbidden"]);
  });

  test("live/hermetic multi-dimension atomic evaluation (purpose: multi), candidate reranking (purpose: rerank), 5-persona debate, and createAtomicJudge against api.typesafe.ai", async () => {
    const liveKey = process.env.OMP_LIVE_TYPESAFE_TESTS === "1" ? process.env.TYPESAFE_API_KEY?.trim() : undefined;
    const liveReceipts: Array<{ url: string; status: number; requestId: string | null; cfRay: string | null }> = [];
    const trackingLiveFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await globalThis.fetch(input, init);
      liveReceipts.push({
        url: String(input),
        status: res.status,
        requestId: res.headers.get("x-typesafe-request-id"),
        cfRay: res.headers.get("cf-ray"),
      });
      return res;
    }) as typeof fetch;
    const multiRes = await judgeTypeSafe({
      apiKey: liveKey || "hermetic-test-key",
      purpose: "multi",
      fetchImpl: liveKey ? trackingLiveFetch : createScriptedJevFetch(() => ({ noul: 0.95 })),
      args: {
        state: "export function isPositiveInt(n: unknown): n is number { return typeof n === 'number' && Number.isSafeInteger(n) && n > 0; }",
        model: "jev-latest",
        questions: {
          checks_type_number: { type: "noul", instructions: "Does isPositiveInt check typeof n === 'number'?" },
          checks_safe_integer: { type: "noul", instructions: "Does isPositiveInt check Number.isSafeInteger(n)?" },
          checks_positive_bound: { type: "noul", instructions: "Does isPositiveInt check n > 0?" },
        },
      },
    });
    expect(multiRes.ok).toBe(true);
    expect(multiRes.answers?.checks_type_number?.noul).toBeGreaterThan(0.8);
    expect(multiRes.answers?.checks_safe_integer?.noul).toBeGreaterThan(0.8);
    expect(multiRes.answers?.checks_positive_bound?.noul).toBeGreaterThan(0.8);

    const rerankRes = await judgeTypeSafe({
      apiKey: liveKey || "hermetic-test-key",
      purpose: "rerank",
      fetchImpl: liveKey
        ? trackingLiveFetch
        : createScriptedJevFetch((qId) => ({
            score: qId === "cand_0" ? 2 : 0,
            confidence: 0.99,
          })),
      args: {
        state: "Select the safest atomic path normalizer that rejects null bytes, traversal, and symlinks.",
        model: "jev-latest",
        questions: {
          cand_0: {
            type: "score",
            instructions: "Rate candidate 0: validates path segments and rejects null bytes, '../' traversal, and symlinks before open.",
            criteria: ["Unsafe", "Partial", "Fully hardened"],
          },
          cand_1: {
            type: "score",
            instructions: "Rate candidate 1: concatenates untrusted strings directly into fs.readFileSync without validation.",
            criteria: ["Unsafe", "Partial", "Fully hardened"],
          },
        },
      },
    });
    expect(rerankRes.ok).toBe(true);
    expect(rerankRes.answers!.cand_0!.score!).toBeGreaterThan(rerankRes.answers!.cand_1!.score!);

    // Live Call 3: createAtomicJudge evaluation over real AtomicInput relation packet
    const atomicInput = structuredClone(makeAtomicInput());
    const atomicReceipt = await createAtomicJudge({
      apiKey: liveKey || "hermetic-test-key",
      fetchImpl: liveKey ? trackingLiveFetch : createScriptedJevFetch(() => ({ choice: "supports", confidence: 0.95 })),
    }).review(atomicInput);
    expect(["supported", "insufficient", "contradicted"]).toContain(atomicReceipt.status);
    expect(atomicReceipt.attempts.length).toBe(1);

    // Live Call 4: createAtomicJudge with noul micro-predicates and byPredicate decision policies
    const noulAtomicInput = structuredClone(makeAtomicInput());
    noulAtomicInput.predicates = [
      {
        ...noulAtomicInput.predicates[0],
        id: "q_live_support",
        claim: "The evidence packet binds the public obligation to src/public.ts",
        answerType: "noul",
        semanticMode: "open_world_support",
      },
      {
        ...noulAtomicInput.predicates[0],
        id: "q_live_boolean",
        claim: "The evidence packet contains zero required omissions",
        answerType: "noul",
        semanticMode: "closed_world_boolean",
      },
    ];
    noulAtomicInput.rubricDigest = canonicalDigest({ version: "atomic-relations-v1", predicates: noulAtomicInput.predicates });
    const noulPolicy: AtomicPredicateDecisionPolicy = {
      schemaVersion: 1,
      categorical: "declared_relations",
      byPredicate: {
        q_live_support: {
          semanticMode: "support_only",
          orientation: "support_probability",
          supportsAbove: 0.5,
          uncertainty: "strict_boundary_or_missing_evidence_insufficient",
        },
        q_live_boolean: {
          semanticMode: "closed_world_boolean",
          orientation: "support_probability",
          supportsAbove: 0.5,
          contradictsBelow: 0.2,
          uncertainty: "strict_boundary_or_missing_evidence_insufficient",
        },
      },
    };
    const noulReceipt = await createAtomicJudge({
      apiKey: liveKey || "hermetic-test-key",
      predicateDecisionPolicy: noulPolicy,
      fetchImpl: liveKey ? trackingLiveFetch : createScriptedJevFetch(() => ({ noul: 0.94 })),
    }).review(noulAtomicInput);
    expect(noulReceipt.attempts.length).toBe(1);
    expect(typeof noulReceipt.outcomes[0].probability).toBe("number");
    expect(typeof noulReceipt.outcomes[1].probability).toBe("number");
    // Live Call 5: 5-Persona Multi-Persona Debate (runMultiPersonaDebate / ck:predict)
    const debateResult = await runMultiPersonaDebate(
      "Enforce scoped plan closure (assertScopedPlanClosure) and atomic predicate DAG verification via TypeSafe System One jev-latest.",
      {
        async evaluateDebate(params) {
          const r = await judgeTypeSafe({
            apiKey: liveKey || "hermetic-test-key",
            purpose: "debate",
            fetchImpl: liveKey ? trackingLiveFetch : createScriptedJevFetch(() => ({ score: 2, confidence: 0.9 })),
            args: params,
          });
          return r.ok ? { answers: r.answers, metadata: r.metadata } : { error: r.code };
        },
      }
    );
    expect(["approved", "rejected"]).toContain(debateResult.status);
    expect(typeof debateResult.consensusScore).toBe("number");

    if (liveKey) {
      expect(liveReceipts.length).toBe(5);
      for (const receipt of liveReceipts) {
        expect(receipt.url).toBe("https://api.typesafe.ai/v1/systemone");
        expect(receipt.status).toBe(200);
        expect(receipt.requestId).toMatch(/^req_[a-f0-9]+$/);
      }
      console.log(
        "[LIVE JEV API CALLS VERIFIED]",
        JSON.stringify({
          endpoint: "https://api.typesafe.ai/v1/systemone",
          liveCallsDispatched: liveReceipts.length,
          serverReceipts: liveReceipts,
          multiModel: multiRes.metadata?.resolvedModel,
          multiUsage: multiRes.metadata?.usage,
          rerankModel: rerankRes.metadata?.resolvedModel,
          rerankScores: { cand_0: rerankRes.answers?.cand_0?.score, cand_1: rerankRes.answers?.cand_1?.score },
          atomicRelationAttempt: {
            resolvedModel: atomicReceipt.attempts[0].resolvedModel,
            usage: atomicReceipt.attempts[0].usage,
            bodyBytes: atomicReceipt.attempts[0].bodyBytes,
          },
          atomicNoulAttempt: {
            resolvedModel: noulReceipt.attempts[0].resolvedModel,
            usage: noulReceipt.attempts[0].usage,
            outcomes: noulReceipt.outcomes.map(o => ({ id: o.predicateId, probability: o.probability, relation: o.relation })),
          },
          debateConsensus: {
            resolvedModel: debateResult.resolvedModel,
            consensusScore: debateResult.consensusScore,
            personas: debateResult.personas,
          },
        })
      );
    }
  }, 45_000);
});
