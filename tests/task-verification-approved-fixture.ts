// Offline fixture that drives the real runtime to a bicameral-approved native preflight.
// The M answers are non-authoritative parser stimuli and the Advisor receipt is built from the real request factory;
// no provider, child, test command, or native-completion proof is fabricated for production use.
import { createTaskVerificationRuntime, type TaskVerificationRuntime, type TaskVerificationRuntimeOptions } from "../src/task-verification-runtime";
import { createSemanticApprovalPolicy } from "../src/semantic-approval-policy";
import { makeAdvisorReceipt, type AdvisorAssessment, type AdvisorRequest } from "../src/advisor-protocol";
import { canonicalDigest } from "../src/task-contract-source";
import type { AdvisorHostReview } from "../src/advisor-host";
import type { ExpertJudgeResponse } from "../src/cook-expert-judge";
import { readonlyVerificationFixture, type ReadonlyVerificationFixture } from "./task-verification-fixture";

export interface ApprovedPreflightHarness {
  host: ReadonlyVerificationFixture;
  runtime: TaskVerificationRuntime;
  target: { task: string; phase: string };
  /** Counters for work that native preflight must never trigger. */
  counters: { judgeClients: number; evidenceCollections: number; baselineCaptures: number };
  /** Replace what the host reports as settled Advisor reviews (e.g. to simulate invalidation). */
  setReviews(reviews: readonly AdvisorHostReview[]): void;
  /** The real, settled Advisor review for the reviewed task. */
  review: AdvisorHostReview;
}

export async function approvedPreflightHarness(): Promise<ApprovedPreflightHarness> {
  const host = await readonlyVerificationFixture();
  // Default unselected collection: its `diff:<sha256>` evidence id is authorized because the host recomputes it (see advisor-public-context).
  const counters = { judgeClients: 0, evidenceCollections: 0, baselineCaptures: 0 };
  let reviews: readonly AdvisorHostReview[] = [];
  const evidence = { ...host.evidence,
    collect: (...args: Parameters<typeof host.evidence.collect>) => { counters.evidenceCollections++; return host.evidence.collect(...args); },
    captureBaseline: (...args: Parameters<typeof host.evidence.captureBaseline>) => { counters.baselineCaptures++; return host.evidence.captureBaseline(...args); } };
  const options: TaskVerificationRuntimeOptions = { contracts: host.contracts, evidence, invocations: host.invocations, policyDigest: host.policyDigest,
    approvalPolicy: createSemanticApprovalPolicy({}), privacy: { apiKey: "synthetic-private-test-key" }, appendEntry: host.appendEntry, getAdvisorReviews: async () => reviews,
    createClient() {
      counters.judgeClients++;
      return { async evaluate(request): Promise<ExpertJudgeResponse> {
        const answers: Record<string, unknown> = { deliverables_verdict: { choice: "APPROVE", confidence: 0.7 }, meets_criteria: { noul: 0.85 }, architectural_drift: { choice: "no_drift" }, scope_mode: { choice: "HOLD" } };
        for (const key of Object.keys(request.questions)) if (key.startsWith("criterion_")) answers[key] = { choice: "satisfied" };
        return { answers };
      } };
    } };
  const runtime = createTaskVerificationRuntime(options);
  const target = { task: host.task, phase: "Investigation" };
  // 1. Real outside-preflight review: M favorable, but no Advisor receipt yet.
  const outcome = await host.invocations.run(host.context, "typesafe_review_task", "review-1", target, () => runtime.review(host.context, "review-1", target));
  host.appendCall("typesafe_review_task", "review-1", target);
  host.appendResult("typesafe_review_task", "review-1", outcome);
  if (outcome.status !== "REVIEW_REQUIRED") throw new Error(`approved fixture prerequisite: expected REVIEW_REQUIRED, got ${JSON.stringify(outcome)}`);
  // 2. Real task-bound Advisor request through the runtime's own services, wrapped like advisor-host-dispatch does.
  const services = runtime.advisorServices; const params = { ...target };
  const draft = await services.prepareReview(params, host.context, "task");
  if ("status" in draft) throw new Error(`approved fixture prerequisite: prepareReview ${JSON.stringify(draft)}`);
  const publicPrompt = JSON.stringify({ reviewHandle: "fixture-token", publicReview: draft.publicPrompt });
  const wrapped = { ...draft, publicPrompt, scope: { ...draft.scope, publicContextDigest: canonicalDigest([{ role: "user", content: publicPrompt }]) } };
  const request = await services.createTaskRequest(params, host.context, "advisor-task-call", { token: "fixture-token", mode: "task", draft: wrapped, itemIndex: 0 });
  if (!("requestId" in request)) throw new Error(`approved fixture prerequisite: createTaskRequest ${JSON.stringify(request)}`);
  const advisorRequest: AdvisorRequest = request;
  const assessment: AdvisorAssessment = { verdict: "proceed", recommendation: "Offline fixture assessment; not provider evidence.", confidence: 0.9,
    rankedOptions: [{ option: "Accept", rationale: "Offline fixture", rank: 1 }], findings: [], openQuestions: [],
    criterionCoverage: advisorRequest.criterionIds.map(criterionId => ({ criterionId, status: "covered" as const, evidenceRefs: [advisorRequest.evidenceRefs[0]] })),
    parentIntegration: { status: "not_applicable", criterionIds: [], evidenceRefs: [] } };
  const receipt = makeAdvisorReceipt(advisorRequest, assessment, "fixture-child", "a".repeat(64));
  const review: AdvisorHostReview = { request: advisorRequest, receipt };
  reviews = [review];
  return { host, runtime, target, counters, review, setReviews(next) { reviews = next; } };
}
