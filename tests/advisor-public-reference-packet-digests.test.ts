// Task-bound Advisor public references must accept host-recomputed packet digests (diff/span) and still refuse forged ones.
import { afterEach, describe, expect, test } from "bun:test";
import { prepareAdvisorPublicContext } from "../src/advisor-public-context";
import { digestBytes } from "../src/evidence-workspace";
import type { JudgeEvidencePacket } from "../src/judge-evidence-packet";
import type { TaskEvidenceRecord } from "../src/task-evidence-runtime";
import { createSemanticApprovalPolicy } from "../src/semantic-approval-policy";
import { createTaskVerificationRuntime } from "../src/task-verification-runtime";
import { readonlyVerificationFixture, type ReadonlyVerificationFixture } from "./task-verification-fixture";

const API_KEY = "synthetic-private-test-key";
const REFUSED = "advisor_public_reference_redaction_required";
const disposables: ReadonlyVerificationFixture[] = [];
afterEach(async () => { while (disposables.length) await disposables.pop()!.dispose(); });

async function fixture(): Promise<ReadonlyVerificationFixture> {
  const host = await readonlyVerificationFixture();
  disposables.push(host);
  return host;
}
const filesOf = (record: TaskEvidenceRecord) => record.authorizedSources.map(file => ({ path: file.path, sha256: file.sha256 }));
function prepare(record: TaskEvidenceRecord, packet: JudgeEvidencePacket, apiKey = API_KEY) {
  const files = filesOf(record);
  return prepareAdvisorPublicContext(packet, { contract: record.contract, evidenceManifest: record.packetSet.manifest, question: "q", apiKey, authorizedFiles: files,
    isAuthorizedSource: (path, sha256) => files.some(file => file.path === path && file.sha256 === sha256) });
}
/** Re-collect with an explicit span selection; the span digest is host-computed from the accepted source text. */
async function collectSpanSelected(host: ReadonlyVerificationFixture): Promise<TaskEvidenceRecord> {
  const selection = { criterionIds: host.record.contract.criteria.map(criterion => criterion.id),
    sources: filesOf(host.record).map(file => ({ path: file.path, fullFileDigest: file.sha256, spans: [{ startLine: 1, endLine: 1 }] })) };
  const params = { task: host.task, phase: "Investigation", artifactPaths: ["reports/cause.md"], selections: [selection] };
  host.appendCall("typesafe_collect_evidence", "collect-spans", params);
  const collected = await host.invocations.run(host.context, "typesafe_collect_evidence", "collect-spans", params, () => host.evidence.collect(host.context, "collect-spans", params));
  host.appendResult("typesafe_collect_evidence", "collect-spans", { status: collected.status });
  if (!collected.record) throw new Error(`span collection prerequisite: ${collected.status}`);
  return collected.record;
}
/** Replace every occurrence of `from` inside the packet's obligation evidence ids (simulating a forged or altered id). */
function withObligationIds(packet: JudgeEvidencePacket, map: (id: string) => string): JudgeEvidencePacket {
  return { ...packet, obligations: packet.obligations.map(obligation => ({ ...obligation, evidenceIds: obligation.evidenceIds.map(map) })) };
}

describe("advisor public references: host-recomputed packet digests", () => {
  test("default unselected flow prepares an Advisor draft and keeps the diff digest verbatim", async () => {
    const host = await fixture();
    const packet = host.record.packetSet.packets[0].packet;
    expect(packet.scope).toBeUndefined();
    const runtime = createTaskVerificationRuntime({ contracts: host.contracts, evidence: host.evidence, invocations: host.invocations, policyDigest: host.policyDigest,
      approvalPolicy: createSemanticApprovalPolicy({}), privacy: { apiKey: API_KEY }, appendEntry: host.appendEntry, getAdvisorReviews: async () => [],
      createClient() {
        return { async evaluate(request) {
          const answers: Record<string, unknown> = { deliverables_verdict: { choice: "APPROVE", confidence: 0.7 }, meets_criteria: { noul: 0.85 }, architectural_drift: { choice: "no_drift" }, scope_mode: { choice: "HOLD" } };
          for (const key of Object.keys(request.questions)) if (key.startsWith("criterion_")) answers[key] = { choice: "satisfied" };
          return { answers };
        } };
      } });
    const target = { task: host.task, phase: "Investigation" };
    const review = await host.invocations.run(host.context, "typesafe_review_task", "review-1", target, () => runtime.review(host.context, "review-1", target));
    host.appendCall("typesafe_review_task", "review-1", target);
    host.appendResult("typesafe_review_task", "review-1", review);
    expect(review.status).toBe("REVIEW_REQUIRED");
    const draft = await runtime.advisorServices.prepareReview({ ...target }, host.context, "task");
    expect("status" in draft).toBe(false);
    if ("status" in draft) return;
    expect(draft.evidenceRefs).toContain(`diff:${host.record.packetSet.manifest.diff.digest}`);
  });

  test("span selection is accepted and the span digest stays in the evidence reference", async () => {
    const host = await fixture();
    const record = await collectSpanSelected(host);
    const packet = record.packetSet.packets[0].packet;
    const span = packet.source.flatMap(item => item.spans ?? [])[0];
    expect(span).toBeDefined();
    const prepared = prepare(record, packet);
    const files = filesOf(record);
    expect(prepared.evidenceRefs).toContain(`source:${files[0].path}:${files[0].sha256}:lines:1-1:${span.digest}`);
  });

  test("a forged diff:<random 64 hex> id is still refused", async () => {
    const host = await fixture();
    const packet = host.record.packetSet.packets[0].packet;
    const forged = digestBytes("not the diff");
    expect(forged).not.toBe(digestBytes(packet.diff));
    const tampered = withObligationIds(packet, id => id.startsWith("diff:") ? `diff:${forged}` : id);
    expect(() => prepare(host.record, tampered)).toThrow(REFUSED);
  });

  test("a diff digest that differs from the host-built manifest is not trusted", async () => {
    const host = await fixture();
    const packet = host.record.packetSet.packets[0].packet;
    const altered: JudgeEvidencePacket = { ...packet, diff: `${packet.diff}\n+injected` };
    const injected = withObligationIds(altered, id => id.startsWith("diff:") ? `diff:${digestBytes(altered.diff)}` : id);
    expect(() => prepare(host.record, injected)).toThrow(REFUSED);
  });

  test("a span whose digest does not match its text is refused", async () => {
    const host = await fixture();
    const record = await collectSpanSelected(host);
    const packet = record.packetSet.packets[0].packet;
    const original = packet.source.flatMap(item => item.spans ?? [])[0].digest;
    const forged = digestBytes("different text");
    const tampered: JudgeEvidencePacket = { ...withObligationIds(packet, id => id.replace(original, forged)),
      source: packet.source.map(item => ({ ...item, spans: item.spans?.map(span => ({ ...span, digest: forged })) })) };
    expect(() => prepare(record, tampered)).toThrow(REFUSED);
  });

  test("a self-consistent span (digest matches its text) that the host manifest does not list is refused", async () => {
    const host = await fixture();
    const record = await collectSpanSelected(host);
    const packet = record.packetSet.packets[0].packet;
    const original = packet.source.flatMap(item => item.spans ?? [])[0].digest;
    const manifestDigests = record.packetSet.manifest.packets.flatMap(entry => entry.source.flatMap(source => (source.spans ?? []).map(span => span.digest)));
    expect(manifestDigests).toContain(original);
    const text = "attacker-chosen span text";
    const forged = digestBytes(text);
    expect(manifestDigests).not.toContain(forged);
    const tampered: JudgeEvidencePacket = { ...withObligationIds(packet, id => id.replace(original, forged)),
      source: packet.source.map(item => ({ ...item, spans: item.spans?.map(span => ({ ...span, text, digest: forged })) })) };
    expect(() => prepare(record, tampered)).toThrow(REFUSED);
  });

  test("a secret equal to the diff digest is refused", async () => {
    const host = await fixture();
    const packet = host.record.packetSet.packets[0].packet;
    expect(() => prepare(host.record, packet, digestBytes(packet.diff))).toThrow(REFUSED);
  });

  test("an API-key-shaped secret adjacent to the diff digest is refused", async () => {
    const host = await fixture();
    const packet = host.record.packetSet.packets[0].packet;
    const digest = digestBytes(packet.diff);
    const secret = "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdEfGhIjKlMnOp";
    const smuggled = withObligationIds(packet, id => id.startsWith("diff:") ? `diff:${digest}:${secret}` : id);
    expect(() => prepare(host.record, smuggled)).toThrow(REFUSED);
  });
});
