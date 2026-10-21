import { describe, expect, test } from "bun:test";
import { canonicalDigest } from "../src/task-contract-source";
import { createAtomicJudge, validateAtomicReceipt, type AtomicInput } from "../src/atomic-judge";
import { prepareAtomicInput } from "../src/atomic-preparation";
import { createPairedReviewDriver } from "../src/atomic-evaluation";
import { advisorFixture } from "./advisor-fixtures";

function inputFixture(): AtomicInput {
  const { request, contract, packetSet } = advisorFixture("shadow");
  return prepareAtomicInput({ contract, packetSet, binding: request.binding, snapshot: request.snapshot, model: "jev-latest" });
}
function transportFixture(bodies: Record<string, unknown>[], relation: "supports" | "contradicts" | "insufficient" = "supports"): typeof fetch {
  return (async (_input: unknown, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body)) as Record<string, unknown>; bodies.push(body);
    const questions = body.questions as Record<string, { type: string }>;
    const answers = Object.fromEntries(Object.entries(questions).map(([key, q]) => [key, q.type === "noul" ? { noul: 0.99 } : { choice: relation, confidence: 0.8 }]));
    return new Response(JSON.stringify({ answers, model: "jev-latest", usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
describe("bounded real atomic packet driver", () => {
  test("coherent independent predicates share a request and full evidence stays structured", async () => {
    const input = structuredClone(inputFixture()); const first = input.predicates[0];
    input.predicates = [first, { ...first, id: `q_${canonicalDigest("second").slice(0, 32)}`, claim: "Additional relation for the original criterion" }];
    const bodies: Record<string, unknown>[] = [];
    const receipt = await createAtomicJudge({ apiKey: "fixture-key", fetchImpl: transportFixture(bodies) }).review(input);
    expect(bodies).toHaveLength(1); expect(Object.keys(bodies[0].questions as object)).toHaveLength(2);
    expect((bodies[0].state as Record<string, unknown>).evidence_packet).toEqual(input.packetSet.packets[0].packet);
    expect(receipt.status).toBe("supported"); expect(receipt.uncoveredCriterionIds).toEqual([]);
    expect(validateAtomicReceipt(receipt, { binding: input.binding, snapshot: input.snapshot, criterionIds: input.criteria.map(c => c.id) })).toBe(true);
    expect(Object.isFrozen(receipt.outcomes)).toBe(true);
  });
  test("dependent predicates get a distinct packet bound to previous typed outcomes", async () => {
    const input = structuredClone(inputFixture()); const first = input.predicates[0];
    input.predicates = [first, { ...first, id: `q_${canonicalDigest("dependent").slice(0, 32)}`, dependsOn: [first.id] }];
    const bodies: Record<string, unknown>[] = [];
    const receipt = await createAtomicJudge({ apiKey: "fixture-key", fetchImpl: transportFixture(bodies) }).review(input);
    expect(bodies).toHaveLength(2); expect(receipt.manifest).toHaveLength(2);
    const state = bodies[1].state as { dependencies: unknown[]; dependencyDigest: string };
    expect(state.dependencies).toHaveLength(1); expect(state.dependencyDigest).toBe(canonicalDigest(state.dependencies));
  });
  test("deterministic failed exit is not delegated or averaged away by all semantic passes", async () => {
    const input = structuredClone(inputFixture()); input.deterministicChecks = [{ id: "test-exit", criterionId: input.criteria[0].id, kind: "exit_status", actual: 1, expected: 0 }];
    const bodies: Record<string, unknown>[] = [];
    const receipt = await createAtomicJudge({ apiKey: "fixture-key", fetchImpl: transportFixture(bodies) }).review(input);
    expect(receipt.status).toBe("contradicted"); expect(receipt.contradictedCriterionIds).toEqual([input.criteria[0].id]);
    expect(Object.keys(bodies[0].questions as object)).toHaveLength(1);
  });
  test("a deterministic equality alone never substitutes for an unmapped original semantic obligation", async () => {
    const input = structuredClone(inputFixture()); input.predicates = []; input.deterministicChecks = [{ id: "equality", criterionId: input.criteria[0].id, kind: "exact", actual: true, expected: true }];
    let calls = 0; const fetchImpl = (async () => { calls++; throw new Error("unexpected dispatch"); }) as unknown as typeof fetch;
    const receipt = await createAtomicJudge({ apiKey: "fixture-key", fetchImpl }).review(input);
    expect(calls).toBe(0); expect(receipt.status).toBe("insufficient"); expect(receipt.uncoveredCriterionIds).toEqual([input.criteria[0].id]);
  });
  test("raw Noul remains distinct and cannot silently become categorical support", async () => {
    const input = structuredClone(inputFixture()); input.predicates = [{ ...input.predicates[0], answerType: "noul" }];
    const receipt = await createAtomicJudge({ apiKey: "fixture-key", fetchImpl: transportFixture([]) }).review(input);
    expect(receipt.outcomes[0].probability).toBe(0.99); expect(receipt.outcomes[0].relation).toBe("insufficient"); expect(receipt.status).toBe("insufficient");
  });
  test("contradicted proof and explicit insufficient proof preserve uncovered criteria", async () => {
    for (const relation of ["contradicts", "insufficient"] as const) {
      const input = inputFixture(); const receipt = await createAtomicJudge({ apiKey: "fixture-key", fetchImpl: transportFixture([], relation) }).review(input);
      expect(receipt.uncoveredCriterionIds).toEqual([input.criteria[0].id]); expect(receipt.status).toBe(relation === "contradicts" ? "contradicted" : "insufficient");
    }
  });
  test("manifest packet budget rejects before any provider allocation", async () => {
    const input = structuredClone(inputFixture()); const first = input.predicates[0]; input.predicates = [first, { ...first, id: `q_${canonicalDigest("different-state").slice(0, 32)}`, groupKey: "independent-state" }];
    const bodies: Record<string, unknown>[] = [];
    const receipt = await createAtomicJudge({ apiKey: "fixture-key", fetchImpl: transportFixture(bodies), trustedPolicy: { maxQuestionsPerRequest: 128, provider: { allowedModels: ["jev-latest"] }, semanticReviewLimits: { maxPackets: 1 } } }).review(input);
    expect(bodies).toHaveLength(0); expect(receipt.failureCode).toBe("review_packet_limit"); expect(receipt.uncoveredCriterionIds).toHaveLength(1);
  });
  test("cancelled job preserves uncovered obligations without dispatch", async () => {
    const input = inputFixture(); const signal = AbortSignal.abort(); const bodies: Record<string, unknown>[] = [];
    const receipt = await createAtomicJudge({ apiKey: "fixture-key", fetchImpl: transportFixture(bodies) }).review(input, signal);
    expect(bodies).toHaveLength(0); expect(receipt.uncoveredCriterionIds).toHaveLength(1); expect(receipt.status).toBe("unavailable");
  });
  test("foreign evidence refs, edited packet bytes and dependency cycles reject before dispatch", async () => {
    for (const kind of ["refs", "packet", "cycle"] as const) {
      const input = structuredClone(inputFixture());
      if (kind === "refs") input.predicates = [{ ...input.predicates[0], evidenceRefs: ["private:unapproved"] }];
      if (kind === "packet") input.packetSet.packets[0].packet.diff = "tampered after bound packet digest";
      if (kind === "cycle") input.predicates = [{ ...input.predicates[0], dependsOn: [input.predicates[0].id] }];
      await expect(createAtomicJudge({ apiKey: "fixture-key", fetchImpl: transportFixture([]) }).review(input)).rejects.toThrow();
    }
  });
  test("shadow driver reports missing genuine native host rather than fake H judgment", async () => {
    const { request, contract } = advisorFixture("shadow"); const atomic = inputFixture();
    const result = await createPairedReviewDriver().evaluate("H", { atomic, macro: { contract, todoTask: contract.target.content, planRequirements: contract.criteria.map(c => c.text), diffSummary: "", unifiedDiff: "", testSummary: "" }, advisorRequest: request }, { mode: "shadow", allowMutation: false, allowAuthorityReuse: false });
    expect(result.disposition).toBe("UNAVAILABLE"); expect(result.reasons).toEqual(["native_host_required"]); expect(result.attempts).toEqual([]);
    expect(result.mutationAllowed).toBe(false); expect(result.authorityReusable).toBe(false);
  });
});
