import { createRequire } from "node:module";
import { afterEach, describe, expect, test } from "bun:test";
import { evaluateMonolithicTask } from "../src/task-verification-macro";
import { runPhaseMacroCheck, VISUAL_EVIDENCE_QUESTION_KEY, type ExpertJudgeClient, type ExpertJudgeResponse, type MacroCheckContext } from "../src/cook-expert-judge";
import { createSemanticApprovalPolicy } from "../src/semantic-approval-policy";
import { buildJudgeEvidencePacketSet, createEvidenceStateValidator, type JudgeEvidencePacketSetResult, type SystemOneImageAsset } from "../src/judge-evidence-packet";
import { detectUIVisualEvidence, type TaskEvidenceRecord } from "../src/task-evidence-runtime";
import type { TaskVerificationRuntimeOptions } from "../src/task-verification-types";
import type { FrozenContractSourceContext } from "../src/contract-runtime";
import type { TaskContract } from "../src/types/verification";
import { buildPng, createUiRepo, type UiRepo } from "./helpers/visual-evidence-fixture";

interface Api {
  judgeTypeSafe(options: Record<string, unknown>): Promise<{ ok: boolean; code?: string; answers?: Record<string, unknown>; metadata?: unknown }>;
  prepareRequest(args: Record<string, unknown>, policy: unknown, options: Record<string, unknown>): { ok: boolean; code?: string; body: string };
}
const require_ = createRequire(import.meta.url);
const api = require_("../src/typesafe-api-client.cjs") as Api;
const policy = (require_("../src/typesafe-policy-client.cjs") as { resolveTrustedToolPolicy(purpose: string): unknown }).resolveTrustedToolPolicy("native_done");
const KEY = "synthetic-private-test-key";
const approvalPolicy = createSemanticApprovalPolicy({});
const repos: UiRepo[] = [];
afterEach(async () => { await Promise.all(repos.splice(0).map((repo) => repo.dispose())); });

interface Wire { url: string; headers: Record<string, string>; body: Record<string, unknown>; raw: string }
type VisualAnswer = unknown;
/** Approves every dimension; the visual answer is whatever the case under test supplies. */
function approvingAnswers(questions: Record<string, unknown>, visual: VisualAnswer): Record<string, unknown> {
  const answers: Record<string, unknown> = { deliverables_verdict: { choice: "APPROVE", confidence: 0.9 }, meets_criteria: { noul: 0.9 }, architectural_drift: { choice: "no_drift", confidence: 0.9 }, scope_mode: { choice: "HOLD", confidence: 0.9 } };
  for (const key of Object.keys(questions)) if (key.startsWith("criterion_")) answers[key] = { choice: "satisfied", confidence: 0.9 };
  if (Object.hasOwn(questions, VISUAL_EVIDENCE_QUESTION_KEY) && visual !== undefined) answers[VISUAL_EVIDENCE_QUESTION_KEY] = visual;
  return answers;
}
function harness(visual: VisualAnswer = { noul: 0.95 }) {
  const wires: Wire[] = []; const requests: Array<Record<string, unknown>> = []; let dispatches = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    wires.push({ url, headers: init.headers as Record<string, string>, body, raw: String(init.body) });
    return new Response(JSON.stringify({ answers: approvingAnswers(body.questions as Record<string, unknown>, visual), model: "jev-1.14.0" }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  const options = { privacy: { apiKey: KEY }, approvalPolicy,
    createClient: (_ctx: unknown, _purpose: string, validatePrepared: unknown) => ({ async evaluate(request: Record<string, unknown>): Promise<ExpertJudgeResponse> {
      dispatches++; requests.push(request);
      const outcome = await api.judgeTypeSafe({ apiKey: KEY, fetchImpl, args: request, purpose: "native_done", trustedPolicy: policy, validatePrepared });
      return outcome.ok ? { answers: outcome.answers } : { error: outcome.code };
    } }),
  } as unknown as TaskVerificationRuntimeOptions;
  return { options, wires, requests, dispatches: () => dispatches };
}
const source = { originalUserRequest: { text: "Build the button" } } as unknown as FrozenContractSourceContext;
async function uiRecord(binaries: Record<string, Buffer>, mutate?: (set: JudgeEvidencePacketSetResult) => JudgeEvidencePacketSetResult): Promise<{ record: TaskEvidenceRecord; repo: UiRepo; set: JudgeEvidencePacketSetResult }> {
  const repo = await createUiRepo(binaries); repos.push(repo);
  const { evidence, contract } = repo;
  const visualEvidence = detectUIVisualEvidence(evidence.changedFiles, evidence.sourceEvidence, evidence.snapshot, contract.allowedMutationScope.paths);
  const built = buildJudgeEvidencePacketSet({ contract, evidence, selections: [repo.selection], visualEvidence });
  const set = mutate ? mutate(built) : built;
  return { repo, set, record: { contract, evidence, packetSet: set, verificationReceipt: undefined } as unknown as TaskEvidenceRecord };
}
const header = (wire: Wire, name: string) => Object.entries(wire.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
const RED = () => buildPng({ redSquare: true, padToBytes: 5000 });
const BLUE = () => buildPng({ blueCircle: true, padToBytes: 5000 });

describe("assetPayload forwarding: record -> macro -> client -> wire", () => {
  for (const size of [100_000, 900_000]) test(`image present (${size} bytes, far beyond the 32 KiB text budget): client gets assets, wire has assets + Danger-Zone header + one visual noul question, base64 stays out of state`, async () => {
    const { record, set } = await uiRecord({ "assets/ui.png": buildPng({ redSquare: true, padToBytes: size }) });
    const h = harness();
    const { result } = await evaluateMonolithicTask(h.options, {}, record, source, 1);
    expect(result.error, JSON.stringify(result.reasons)).toBeUndefined();
    expect(result.approved).toBe(true);
    expect(h.dispatches()).toBe(1);
    const wire = h.wires[0]; const asset = set.assetPayload!.ui_visual_evidence;
    // The wire key is the fixed low-entropy name (a content-derived 32+ char key can be redacted away) and must be referenced as text exactly once (an unreferenced asset is HTTP 400 at System One).
    const [ref] = Object.keys(wire.body.assets as object);
    expect(ref).toBe("ui_visual_evidence");
    expect(h.requests[0].assets).toEqual({ [ref]: asset });
    expect(wire.body.assets).toEqual({ [ref]: asset });
    // The key is now fixed, so the packet's visualAssets metadata (key + sha256 binding the image identity) also carries it:
    // assets map key + visual question text + exactly one state metadata entry.
    expect(wire.raw.split(JSON.stringify(ref).slice(1, -1)).length - 1).toBe(3);
    const stateText = JSON.stringify(wire.body.state);
    expect(stateText.split(ref).length - 1).toBe(1);
    expect(stateText).toContain(`"key":"${ref}","format":"png"`);
    expect(JSON.stringify((wire.body.questions as Record<string, unknown>)[VISUAL_EVIDENCE_QUESTION_KEY])).toContain(ref);
    expect(header(wire, "TypeSafe-Danger-Zone-Images")).toBe("true");
    expect(wire.raw.split(asset.data_base64.slice(60, 260))).toHaveLength(2); // exactly once: inside assets
    expect(JSON.stringify(wire.body.state)).not.toContain(asset.data_base64.slice(60, 260));
    const questions = wire.body.questions as Record<string, { type: string }>;
    expect(Object.keys(questions).filter((key) => key === VISUAL_EVIDENCE_QUESTION_KEY)).toHaveLength(1);
    expect(questions[VISUAL_EVIDENCE_QUESTION_KEY].type).toBe("noul");
    expect(Object.keys(questions)).toHaveLength(4 + record.contract.criteria.length + 1);
  });

  test("no image: request has no assets property, no visual question, no header, and the body equals the pre-existing no-asset body", async () => {
    const { record } = await uiRecord({});
    expect(record.packetSet.assetPayload).toBeUndefined();
    const h = harness();
    const { result } = await evaluateMonolithicTask(h.options, {}, record, source, 1);
    expect(result.approved, JSON.stringify(result.reasons)).toBe(true);
    expect(Object.keys(h.requests[0])).toEqual(["state", "questions"]);
    const wire = h.wires[0];
    expect(header(wire, "TypeSafe-Danger-Zone-Images")).toBeUndefined();
    expect(Object.hasOwn(wire.body, "assets")).toBe(false);
    expect(Object.keys(wire.body.questions as object)).not.toContain(VISUAL_EVIDENCE_QUESTION_KEY);
    const legacy = api.prepareRequest({ state: h.requests[0].state, questions: h.requests[0].questions }, policy, { apiKey: KEY });
    expect(legacy.ok).toBe(true);
    expect(wire.raw).toBe(legacy.body);
  });

  test("prepared-body guard still validates the exact state when assets are attached", async () => {
    const { record } = await uiRecord({ "assets/ui.png": RED() });
    const h = harness();
    await evaluateMonolithicTask(h.options, {}, record, source, 1);
    const state = h.requests[0].state as Record<string, unknown>;
    expect(createEvidenceStateValidator(state, { apiKey: KEY })({ body: h.wires[0].raw })).toEqual({ ok: true });
  });
});

describe("fail closed at send: recomputed sha256/bytes must match packet visualAssets", () => {
  const tamper: Array<[string, (a: Record<string, SystemOneImageAsset>) => Record<string, SystemOneImageAsset> | undefined]> = [
    ["same-size different image bytes (sha256 differs)", () => ({ ui_visual_evidence: { type: "image", format: "png", data_base64: BLUE().toString("base64") } })],
    ["different size bytes", () => ({ ui_visual_evidence: { type: "image", format: "png", data_base64: buildPng({ size: 8 }).toString("base64") } })],
    ["format flipped", (a) => ({ ui_visual_evidence: { ...a.ui_visual_evidence, format: "jpeg" } })],
    ["payload dropped while metadata remains", () => undefined],
    ["extra unlisted asset smuggled in", (a) => ({ ...a, extra_image: a.ui_visual_evidence })],
  ];
  for (const [label, change] of tamper) {
    test(`${label}: nothing reaches the client and the result is a non-approval`, async () => {
      expect(RED().length).toBe(BLUE().length);
      const { record } = await uiRecord({ "assets/ui.png": RED() }, (set) => ({ ...set, assetPayload: change(set.assetPayload!) }));
      const h = harness();
      const { result } = await evaluateMonolithicTask(h.options, {}, record, source, 1);
      expect(h.dispatches()).toBe(0);
      expect(h.wires).toHaveLength(0);
      expect(result.approved).toBe(false);
      expect(result.outcome?.status).toBe("EVIDENCE_REQUIRED");
      expect(result.error).toBe("visual_asset_integrity_mismatch");
    });
  }
  test("an asset payload with no packet metadata is also refused", async () => {
    const { record } = await uiRecord({}, (set) => ({ ...set, assetPayload: { ui_visual_evidence: { type: "image", format: "png", data_base64: RED().toString("base64") } } }));
    const h = harness();
    const { result } = await evaluateMonolithicTask(h.options, {}, record, source, 1);
    expect(h.dispatches()).toBe(0);
    expect(result.approved).toBe(false);
  });
});

describe("visual noul question is tighten-only", () => {
  const criteria = (count: number) => ({ target: { content: "Deliver Button", phase: "UI" }, taskKind: "implementation", criteria: Array.from({ length: count }, (_, i) => ({ id: `c${i}`, kind: "acceptance", text: `criterion ${i}` })) }) as unknown as TaskContract;
  const ctx = (visual: boolean, count = 1): MacroCheckContext => ({ todoTask: "Deliver Button", planRequirements: [], diffSummary: "M src/button.tsx", unifiedDiff: "+x", testSummary: "ok", contract: criteria(count), ...(visual ? { visualAssets: { ui_visual_evidence: { type: "image" as const, format: "png" as const, data_base64: buildPng({ size: 8 }).toString("base64") } } } : {}) });
  const run = (visual: boolean, answers: (q: Record<string, unknown>) => Record<string, unknown>, count = 1) => {
    const asked: Array<Record<string, unknown>> = [];
    const client: ExpertJudgeClient = { async evaluate({ questions }) { asked.push(questions); return { answers: answers(questions) }; } };
    return runPhaseMacroCheck(ctx(visual, count), client, { approvalPolicy }).then((result) => ({ result, asked }));
  };
  const ok = (visual?: VisualAnswer) => (q: Record<string, unknown>) => approvingAnswers(q, visual);

  test("question is asked only when an image is present, exactly once, as noul", async () => {
    const withImage = await run(true, ok({ noul: 0.9 })); const without = await run(false, ok({ noul: 0.9 }));
    expect(Object.keys(withImage.asked[0]).filter((key) => key === VISUAL_EVIDENCE_QUESTION_KEY)).toHaveLength(1);
    expect((withImage.asked[0][VISUAL_EVIDENCE_QUESTION_KEY] as { type: string }).type).toBe("noul");
    expect(Object.keys(withImage.asked[0])).toHaveLength(Object.keys(without.asked[0]).length + 1);
    expect(Object.keys(without.asked[0])).not.toContain(VISUAL_EVIDENCE_QUESTION_KEY);
    expect(withImage.result.approved).toBe(true); expect(without.result.approved).toBe(true);
  });

  for (const [label, answer, status] of [
    ["negative 0.1", { noul: 0.1 }, "REJECTED"], ["boundary 0.5 under the default comparator", { noul: 0.5 }, "REJECTED"],
    ["missing", undefined, "EVIDENCE_REQUIRED"], ["null", null, "EVIDENCE_REQUIRED"], ["string probability", { noul: "0.9" }, "EVIDENCE_REQUIRED"],
    ["out of range", { noul: 1.5 }, "EVIDENCE_REQUIRED"], ["NaN", { noul: Number.NaN }, "EVIDENCE_REQUIRED"], ["wrong primitive", { choice: "yes" }, "EVIDENCE_REQUIRED"],
  ] as const) {
    test(`all other questions pass but visual ${label} -> not approved (${status})`, async () => {
      const { result } = await run(true, ok(answer));
      expect(result.approved).toBe(false);
      expect(result.outcome?.status).toBe(status);
      expect(result.reasons.join(" ")).toMatch(/visual/i);
      expect(result.deliverablesVerdict).toBe("APPROVE"); // other dimensions are reported unchanged
    });
  }

  test("a positive visual answer cannot rescue any failing question", async () => {
    const failing: Array<[string, Record<string, unknown>]> = [
      ["deliverables_verdict", { deliverables_verdict: { choice: "REJECT", confidence: 0.9 } }], ["meets_criteria", { meets_criteria: { noul: 0.1 } }],
      ["architectural_drift", { architectural_drift: { choice: "scope_creep" } }], ["scope_mode", { scope_mode: { choice: "REDUCTION" } }], ["criterion", { criterion_0: { choice: "violated" } }],
    ];
    for (const [label, override] of failing) {
      const { result } = await run(true, (q) => ({ ...approvingAnswers(q, { noul: 0.99 }), ...override }));
      expect(result.approved, label).toBe(false);
      expect(result.reasons.join(" "), label).not.toMatch(/visual/i);
    }
  });

  test("a negative visual answer does not hide other failures", async () => {
    const { result } = await run(true, (q) => ({ ...approvingAnswers(q, { noul: 0.1 }), scope_mode: { choice: "REDUCTION" } }));
    expect(result.approved).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/scope_mode/);
    expect(result.reasons.join(" ")).toMatch(/visual/i);
  });

  test("an unsolicited visual answer is ignored when no image was sent", async () => {
    const { result } = await run(false, (q) => ({ ...approvingAnswers(q, undefined), [VISUAL_EVIDENCE_QUESTION_KEY]: { noul: 0 } }));
    expect(result.approved).toBe(true);
  });

  test("the per-request question limit still applies: the extra question counts and is never dropped", async () => {
    // A trusted policy with a small cap makes the boundary reachable (128 questions would exceed the 32 KiB text budget first).
    const limit = 7; const base = 4; // deliverables, meets_criteria, drift, scope; plus one question per criterion
    const capped = (require_("../src/typesafe-policy-client.cjs") as { resolveTrustedToolPolicy(purpose: string, supplied: unknown): unknown })
      .resolveTrustedToolPolicy("native_done", { maxQuestionsPerRequest: limit, provider: { allowedModels: ["jev-latest"] } });
    const send = async (visual: boolean, count: number) => {
      const client: ExpertJudgeClient = { async evaluate({ questions }) {
        const prepared = api.prepareRequest({ state: "s", questions }, capped, { apiKey: KEY });
        return prepared.ok ? { answers: approvingAnswers(questions, { noul: 0.9 }) } : { error: prepared.code };
      } };
      return runPhaseMacroCheck(ctx(visual, count), client, { approvalPolicy });
    };
    const fits = await send(true, limit - base - 1); // exactly at the cap with the visual question
    expect(fits.approved, JSON.stringify(fits.reasons)).toBe(true);
    expect((await send(false, limit - base)).approved).toBe(true); // exactly at the cap without it
    const over = await send(true, limit - base); // one over the cap only because of the visual question
    expect(over.approved).toBe(false);
    expect(over.outcome?.status).toBe("EVIDENCE_REQUIRED");
    expect(over.error).toBeDefined();
  });
});
