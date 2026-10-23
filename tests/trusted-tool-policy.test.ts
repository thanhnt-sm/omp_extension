import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const api = require("../src/typesafe-api-client.cjs");
const policies = require("../src/typesafe-policy-client.cjs");
const numeric = { type: "noul", instructions: "Assess the full evidence" };
const request = (count = 1) => ({ state: "Public evidence", questions: Object.fromEntries(
  Array.from({ length: count }, (_, index) => [`q${index}`, numeric]),
) });
const hostPolicy = (cap = 128) => ({ maxQuestionsPerRequest: cap,
  provider: { allowedModels: ["jev-latest"] } });
const action = (criteria: Record<string, string> = { auto: "Automatic", review: "Review", block: "Block" }) => ({
  type: "choice", instructions: "Select the required routing action", criteria,
});
type Packet = { id: string; criteria: readonly string[] };
type Job = {
  signal: AbortSignal;
  manifest: readonly Packet[];
  admitPacket: (id: string) => { ok: boolean; code?: string };
  markCovered: (id: string) => void;
  beforeDispatch: () => { ok: boolean; code?: string };
};
const manifest = [{ id: "packet-a", criteria: ["criterion-a"] }];

describe("trusted purpose policies and canonical preparation", () => {
  test("validates count before inspecting question definitions", () => {
    const questions = Object.fromEntries(Array.from({ length: 129 }, (_, i) => [`q${i}`, numeric]));
    Object.defineProperty(questions, "q0", { enumerable: true, get() { throw new Error("must not inspect over-cap fanout"); } });
    expect(api.validateInput({ state: "Public", questions })).toMatchObject({ ok: false, code: "question_limit_exceeded" });
    expect(api.validateQuestionCount(0)).toMatchObject({ ok: false });
    expect(api.validateQuestionCount(128)).toEqual({ ok: true });
    expect(api.validateQuestionCount(129)).toMatchObject({ ok: false, code: "question_limit_exceeded" });
    expect(api.prepareRequest(request(128)).ok).toBe(true);
  });

  test("lower trusted cap permits two and rejects three without dispatch", async () => {
    const bound = policies.resolveTrustedToolPolicy("multi", hostPolicy(2));
    let calls = 0;
    const fetchImpl = async (_url: string, init: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ answers: Object.fromEntries(
        Object.keys(body.questions).map((key) => [key, { noul: 0.9 }]),
      ) }));
    };
    expect((await policies.judgeWithPolicy({ purpose: "multi", trustedPolicy: bound,
      args: request(2), apiKey: "count", fetchImpl })).ok).toBe(true);
    expect(await policies.judgeWithPolicy({ purpose: "multi", trustedPolicy: bound,
      args: request(3), apiKey: "count", fetchImpl })).toMatchObject({ ok: false, code: "question_limit_exceeded" });
    expect(calls).toBe(1);
  });

  test("invalid supplied policies fail locally, including null and malformed routing/provider", async () => {
    const invalid = [null, ...[NaN, 0, -1, 1.5, 129].map(hostPolicy),
      { ...hostPolicy(), provider: { allowedModels: [] } },
      { ...hostPolicy(), routing: { baseline: "absent", lattice: ["low", "high"] } },
      { ...hostPolicy(), routing: { baseline: "low", lattice: ["low", "low"] } },
      { ...hostPolicy(), semanticReviewLimits: { maxDispatches: 385 } },
      { ...hostPolicy(), semanticReviewLimits: null },
      { ...hostPolicy(), semanticReviewLimits: { maxDispatches: null } },
      { ...hostPolicy(), semanticReviewLimits: { unknownLimit: 1 } },
      { ...hostPolicy(), provider: { allowedModels: ["jev-latest"], endpoint: "https://untrusted.invalid" } },
      { maxQuestionsPerRequest: 128, get provider() { throw new Error("invalid initialization accessor"); } }];
    let calls = 0;
    for (const trustedPolicy of invalid) {
      const result = await api.judgeTypeSafe({ purpose: "judge", trustedPolicy,
        args: request(), apiKey: "invalid", fetchImpl: async () => { calls++; throw new Error("must not dispatch"); } });
      expect(result).toMatchObject({ ok: false, code: "policy_invalid" });
    }
    expect(calls).toBe(0);
  });

  test("a malformed registration entry disables only its own purpose", () => {
    const overrides = Object.defineProperty({}, "expert", {
      get() { throw new Error("invalid expert initialization"); },
    });
    const resolved = policies.resolveToolPolicies(overrides);
    expect(resolved.expert).toMatchObject({ ok: false, code: "policy_invalid" });
    expect(resolved.judge.ok).toBe(true);
    expect(resolved.rerank.ok).toBe(true);
  });

  test("projects typed assistant fields and drops unapproved private roles", () => {
    const privateText = "internal thought details not public";
    const prepared = api.prepareRequest({ ...request(), state: {
      thinking: "Inventory planning concept",
      messages: [
        { role: "user", content: "Private user prompt", thinking: "Private user context" },
        { role: "assistant", content: "Public assistant text", thinking: privateText, reasoning_content: privateText },
      ],
    } });
    expect(prepared.ok).toBe(true);
    const state = JSON.parse(prepared.body).state;
    expect(state.thinking).toBe("Inventory planning concept");
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].content).toBe("Public assistant text");
    expect(prepared.body).not.toContain(privateText);
    expect(prepared.body).not.toContain("Private user prompt");
    expect(prepared.body).not.toContain("Private user context");
  });

  test("snapshots nested configuration and isolates registrations and purposes", () => {
    const original = { ...hostPolicy(2), routing: {
      baseline: "review", lattice: ["auto", "review", "block"], questionKeys: ["route"],
    } };
    const first = policies.resolveToolPolicies({ judge: original });
    const second = policies.resolveToolPolicies({ judge: { ...hostPolicy(3), routing: {
      baseline: "block", lattice: ["auto", "review", "block"], questionKeys: ["decision"],
    } } });
    original.maxQuestionsPerRequest = 128;
    original.provider.allowedModels.push("untrusted-model");
    original.routing.baseline = "auto";
    original.routing.lattice[0] = "bypass";
    original.routing.questionKeys[0] = "unrelated";
    expect(first.judge.maxQuestionsPerRequest).toBe(2);
    expect(first.judge.routing.baseline).toBe("review");
    expect(first.judge.routing.questionKeys).toEqual(["route"]);
    expect(first.judge.provider.allowedModels).toEqual(["jev-latest"]);
    expect(Object.isFrozen(first.judge.routing.lattice)).toBe(true);
    expect(second.judge.routing.baseline).toBe("block");
    expect(first.judge.policyIdentity).not.toBe(second.judge.policyIdentity);
    expect(first.expert.routing).toBeUndefined();
    expect(policies.resolveTrustedToolPolicy("expert", first.judge)).toMatchObject({ ok: false });
  });

  test("forged argument and response policies cannot loosen a keyed action lattice", async () => {
    const bound = policies.resolveTrustedToolPolicy("judge", { ...hostPolicy(), routing: {
      baseline: "review", lattice: ["auto", "review", "block"], questionKeys: ["route"],
    } });
    const args = { state: { policy: { baseline: "auto" }, maxQuestions: 9000 },
      questions: { unrelated: { type: "choice", instructions: "Categorize", criteria: { cat: "Cat", dog: "Dog" } }, route: action() },
      policy: { baseline: "auto" }, provider: { allowedModels: ["anything"] }, maxQuestionsPerRequest: 9000 };
    const judgeFn = async () => ({ answers: { unrelated: { choice: "cat", confidence: 0.9 },
      route: { choice: "auto", confidence: 0.99 } }, policy: { baseline: "auto" } });
    expect(await policies.judgeWithPolicy({ args, trustedPolicy: bound, judgeFn })).toMatchObject({
      ok: false, code: "lattice-violation",
    });
    for (const choice of ["review", "block"]) {
      expect((await policies.judgeWithPolicy({ args, trustedPolicy: bound, judgeFn: async () => ({
        answers: { unrelated: { choice: "cat", confidence: 0.8 }, route: { choice, confidence: 0.8 } },
      }) })).ok).toBe(true);
    }
  });

  test("mixed known/unknown actions and missing keyed questions fail before injected judge", async () => {
    let calls = 0;
    const judgeFn = async () => { calls++; return {}; };
    expect(await policies.judgeWithPolicy({ args: { state: "Public", questions: {
      route: action({ auto: "Automatic", review: "Review", escape: "Bypass" }),
    } }, judgeFn })).toMatchObject({ ok: false, code: "unknown-choice" });
    const bound = policies.resolveTrustedToolPolicy("decision", { ...hostPolicy(), routing: {
      baseline: "triage", lattice: ["allow", "triage", "deny"], questionKeys: ["risk_route"],
    } });
    expect(await policies.judgeWithPolicy({ purpose: "decision", trustedPolicy: bound,
      args: request(), judgeFn })).toMatchObject({ ok: false, code: "routing_question_invalid" });
    expect(calls).toBe(0);
  });

  test("numeric, arbitrary expert rubric and structured binary requests remain valid", async () => {
    const cases = [
      { purpose: "judge", questions: { numeric } },
      { purpose: "expert", questions: { rubric: { type: "choice", instructions: "Grade the evidence",
        criteria: { COMPLETE: "All fulfilled", PARTIAL: "Missing evidence" } } } },
      { purpose: "multi", questions: { binary: { type: "choice", instructions: "Check dimension",
        criteria: { yes: "Present", no: "Absent" } } } },
      { purpose: "plan", questions: { rubric: { type: "score", instructions: "Grade the complete plan",
        criteria: ["Incomplete", "Complete"] } } },
      { purpose: "judge", questions: { route: action() } },
    ];
    for (const entry of cases) {
      let sent = false;
      const result = await policies.judgeWithPolicy({ purpose: entry.purpose,
        args: { state: "Public evidence", questions: entry.questions }, apiKey: "positive",
        fetchImpl: async (url: string, init: RequestInit) => {
          sent = true;
          expect(url).toBe("https://api.typesafe.ai/v1/systemone");
          const body = JSON.parse(String(init.body));
          const answers: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(body.questions)) {
            const question = value as { type: string; criteria?: Record<string, string> };
            answers[key] = question.type === "noul" ? { noul: 0.9 } : question.type === "score"
              ? { score: 1, confidence: 0.9 } : { choice: question.criteria?.review !== undefined
                ? "review" : Object.keys(question.criteria ?? {})[0], confidence: 0.9 };
          }
          return new Response(JSON.stringify({ answers }));
        } });
      expect(sent).toBe(true);
      expect(result.ok).toBe(true);
      expect(Object.keys(result.answers)).toEqual(Object.keys(entry.questions));
      expect(result.metadata.resolvedModel).toBeUndefined();
      expect(result.metadata.usage).toBeUndefined();
      expect(result.metadata.attempts).toBe(1);
    }
  });

  test("enforces requested provider model and preserves actual model/usage metadata", async () => {
    const bound = policies.resolveTrustedToolPolicy("evaluation", hostPolicy());
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return new Response(JSON.stringify({ model: "jev-resolved", usage: { input_tokens: 9 }, answers: { q0: { noul: 0.8 } } }));
    };
    expect(await policies.judgeWithPolicy({ purpose: "evaluation", trustedPolicy: bound,
      args: { ...request(), model: "unapproved" }, apiKey: "models", fetchImpl })).toMatchObject({ ok: false, code: "model_not_allowed" });
    expect(calls).toBe(0);
    const result = await policies.judgeWithPolicy({ purpose: "evaluation", trustedPolicy: bound,
      args: request(), apiKey: "models", fetchImpl });
    expect(result.metadata).toMatchObject({ resolvedModel: "jev-resolved", usage: { input_tokens: 9 },
      questionIds: ["q0"], questionCount: 1, maxQuestionsPerRequest: 128, attempts: 1, policyIdentity: bound.policyIdentity });
  });

  test("measures exact final UTF-8 bytes including escaping, identifiers, model and redaction expansion", () => {
    const args = { state: '漢字"\\\n', model: "jev-latest", questions: {
      ["question_" + "identifier_".repeat(40)]: { type: "noul", instructions: "Keep every instruction" },
    } };
    const base = api.prepareRequest(args);
    expect(base.ok).toBe(true);
    args.state += "x".repeat(32768 - base.bodyBytes);
    const exact = api.prepareRequest(args);
    expect(exact).toMatchObject({ ok: true, bodyBytes: 32768, questionCount: 1 });
    expect(Buffer.byteLength(exact.body, "utf8")).toBe(32768);
    expect(exact.bodyDigest).toBe(createHash("sha256").update(exact.body).digest("hex"));
    expect(api.prepareRequest({ ...args, state: args.state + "x" })).toMatchObject({ ok: false });
    const expansion = { ...request(), state: "short-secret ".repeat(1800) };
    expect(Buffer.byteLength(JSON.stringify(expansion), "utf8")).toBeLessThan(32768);
    expect(api.prepareRequest(expansion, undefined, { apiKey: "short-secret" })).toMatchObject({ ok: false });
  });

  test("never trims mandatory evidence or instruction meaning and rejects secret choice identifiers", async () => {
    let calls = 0;
    const args = { ...request(), state: { deliverable_artifacts: "mandatory evidence ".repeat(3000) } };
    expect(await api.judgeTypeSafe({ args, apiKey: "no-trim", fetchImpl: async () => { calls++; return new Response(); } })).toMatchObject({ ok: false });
    expect(calls).toBe(0);
    expect(api.prepareRequest({ ...request(), questions: {
      q0: { type: "choice", instructions: "Classify", criteria: { "short-secret": "A", safe: "B" } },
    } }, undefined, { apiKey: "short-secret" })).toMatchObject({ ok: false, code: "payload rejected: secret in key" });
  });

  test("uses actual numeric yes-probability and never confidence or an invented default", () => {
    for (const noul of [undefined, "0.9", NaN, Infinity, -0.01, 1.01]) {
      expect(api.sanitizeAnswers({ q0: numeric }, { q0: { noul, confidence: 0.99 } })).toBeNull();
    }
    for (const noul of [0, 0.37, 1]) {
      expect(api.sanitizeAnswers({ q0: numeric }, { q0: { noul, confidence: 0.01 } })).toEqual({ q0: { noul } });
    }
  });

  test("missing bundled policy capabilities are visibly unavailable and never dispatch", () => {
    const clientPath = require.resolve("../src/typesafe-api-client.cjs");
    const policyPath = require.resolve("../src/typesafe-policy-client.cjs");
    const script = `
      const api = require(${JSON.stringify(clientPath)});
      const policyPath = ${JSON.stringify(policyPath)};
      require(policyPath);
      require.cache[policyPath].exports = {};
      let calls = 0;
      api.judgeTypeSafe({apiKey:'fixture',args:{state:'Public',questions:{q0:{type:'noul',instructions:'Assess'}}},
        fetchImpl:async()=>{calls++;return new Response('{}')}})
        .then(result=>process.stdout.write(JSON.stringify({result,calls})));
    `;
    const child = spawnSync(process.execPath, ["-e", script], { env: {}, encoding: "utf8", timeout: 5000 });
    expect(child.status).toBe(0);
    expect(JSON.parse(child.stdout)).toMatchObject({ result: { ok: false, code: "policy_client_missing" }, calls: 0 });
  });

  test("trusted final evidence validation sees the sole immutable prepared body on real and injected paths", async () => {
    const expected = "Full mandatory public artifact";
    for (const injected of [false, true]) {
      let callbacks = 0;
      let dispatches = 0;
      const result = await policies.judgeWithPolicy({
        args: { ...request(), state: { deliverableArtifacts: expected } }, apiKey: "validator",
        validatePrepared: (prepared: { body: string; bodyDigest: string; questions: object }) => {
          callbacks++;
          expect(Object.isFrozen(prepared)).toBe(true);
          expect(Object.isFrozen(prepared.questions)).toBe(true);
          expect(Reflect.set(prepared, "body", "replacement")).toBe(false);
          expect(prepared.bodyDigest).toBe(createHash("sha256").update(prepared.body).digest("hex"));
          return JSON.parse(prepared.body).state.deliverableArtifacts === expected
            ? { ok: true } : { ok: false, code: "EVIDENCE_REQUIRED" };
        },
        ...(injected ? { judgeFn: async () => { dispatches++; return { answers: { q0: { noul: 0.9 } } }; } }
          : { fetchImpl: async () => { dispatches++; return new Response(JSON.stringify({ answers: { q0: { noul: 0.9 } } })); } }),
      });
      expect(result.ok).toBe(true);
      expect(callbacks).toBe(1);
      expect(dispatches).toBe(1);
    }
  });

  test("mandatory redaction loss and validator errors stop every backend before judgment", async () => {
    const artifact = "Proof containing opaque-secret must survive in full";
    let dispatches = 0;
    for (const injected of [false, true]) {
      const result = await policies.judgeWithPolicy({
        args: { ...request(), state: { deliverableArtifacts: artifact } }, apiKey: "opaque-secret",
        validatePrepared: (prepared: { body: string }) => ({
          ok: JSON.parse(prepared.body).state.deliverableArtifacts === artifact, code: "EVIDENCE_REQUIRED",
        }),
        ...(injected ? { judgeFn: async () => { dispatches++; return {}; } }
          : { fetchImpl: async () => { dispatches++; return new Response(); } }),
      });
      expect(result).toMatchObject({ ok: false, code: "EVIDENCE_REQUIRED" });
    }
    expect(await policies.judgeWithPolicy({
      args: request(), validatePrepared: () => { throw new Error("private validation failure"); },
      judgeFn: async () => { dispatches++; return {}; },
    })).toMatchObject({ ok: false, code: "prepared_validation_failed" });
    expect(dispatches).toBe(0);
  });

  test("a trusted callback cannot override count policy and tool arguments cannot supply the callback", async () => {
    let callbacks = 0;
    let dispatches = 0;
    expect(await policies.judgeWithPolicy({
      args: request(129), validatePrepared: () => { callbacks++; return { ok: true }; },
      judgeFn: async () => { dispatches++; return {}; },
    })).toMatchObject({ ok: false, code: "question_limit_exceeded" });
    expect(callbacks).toBe(0);
    const result = await policies.judgeWithPolicy({
      args: { ...request(), validatePrepared: () => { throw new Error("not host policy"); } },
      judgeFn: async () => { dispatches++; return { answers: { q0: { noul: 0.9 } } }; },
    });
    expect(result.ok).toBe(true);
    expect(dispatches).toBe(1);
  });
});

describe("bounded lazy semantic review jobs", () => {
  test("counts real runner attempts and leaves undispatched coverage insufficient", async () => {
    const bound = policies.resolveTrustedToolPolicy("evaluation", { ...hostPolicy(), semanticReviewLimits: { maxDispatches: 1 } });
    const scheduler = policies.createSemanticReviewScheduler(bound);
    let calls = 0;
    let receipt: unknown;
    const result = await scheduler.run(manifest, async (job: Job) => {
      expect(job.admitPacket("packet-a")).toEqual({ ok: true });
      receipt = await policies.judgeWithPolicy({ purpose: "evaluation", trustedPolicy: bound,
        args: request(), reviewJob: job, apiKey: "dispatch-budget", rateLimitState: {},
        randomImpl: () => 0, sleepImpl: async () => {},
        fetchImpl: async () => { calls++; return new Response("", { status: 529 }); } });
      return receipt;
    });
    expect(calls).toBe(1);
    expect(receipt).toMatchObject({ ok: false, code: "review_dispatch_limit", metadata: { attempts: 1 } });
    expect(result).toMatchObject({ ok: false, code: "EVIDENCE_REQUIRED", coverage: {
      dispatches: 1, packetCount: 1, covered: [], uncovered: manifest,
    } });
  });

  test("freezes coverage and admits bodies lazily, with a bounded queue and cancellation", async () => {
    const scheduler = policies.createSemanticReviewScheduler(policies.resolveTrustedToolPolicy("evaluation"));
    const active = new AbortController();
    const queued = new AbortController();
    const worker = Promise.withResolvers<{ ok: boolean }>();
    let entered = 0;
    const first = scheduler.run(manifest, async (job: Job) => {
      entered++;
      expect(Object.isFrozen(job.manifest[0].criteria)).toBe(true);
      job.admitPacket("packet-a");
      return worker.promise;
    }, { signal: active.signal });
    await Promise.resolve();
    const second = scheduler.run(manifest, async () => { entered++; return { ok: true }; }, { signal: queued.signal });
    expect(await scheduler.run(manifest, async () => { entered++; return { ok: true }; })).toMatchObject({ ok: false, code: "review_queue_full" });
    expect(entered).toBe(1);
    queued.abort();
    expect(await second).toMatchObject({ ok: false, code: "cancelled", coverage: { uncovered: manifest } });
    active.abort();
    expect(await first).toMatchObject({ ok: false, code: "cancelled" });
    worker.resolve({ ok: true });
    expect(entered).toBe(1);
  });

  test("job cancellation reaches the active fetch rather than only a provider timer", async () => {
    const bound = policies.resolveTrustedToolPolicy("evaluation");
    const scheduler = policies.createSemanticReviewScheduler(bound);
    const controller = new AbortController();
    let observedAbort = false;
    const started = Promise.withResolvers<void>();
    const run = scheduler.run(manifest, async (job: Job) => {
      job.admitPacket("packet-a");
      return policies.judgeWithPolicy({ purpose: "evaluation", trustedPolicy: bound, args: request(),
        reviewJob: job, apiKey: "cancel-fetch", fetchImpl: async (_url: string, init: RequestInit) => {
          init.signal?.addEventListener("abort", () => { observedAbort = true; }, { once: true });
          started.resolve();
          return Promise.withResolvers<Response>().promise;
        } });
    }, { signal: controller.signal });
    await started.promise;
    controller.abort();
    expect(await run).toMatchObject({ ok: false, code: "cancelled" });
    expect(observedAbort).toBe(true);
  });

  test("deadline covers admission through terminal and preserves uncovered criteria", async () => {
    const bound = policies.resolveTrustedToolPolicy("evaluation", { ...hostPolicy(), semanticReviewLimits: { deadlineMs: 5 } });
    let fire!: () => void;
    const scheduler = policies.createSemanticReviewScheduler(bound, { nowImpl: () => 0,
      setTimeoutImpl: (callback: () => void) => { fire = callback; return 1; }, clearTimeoutImpl: () => {} });
    const run = scheduler.run(manifest, async () => Promise.withResolvers<never>().promise);
    fire();
    expect(await run).toMatchObject({ ok: false, code: "review_deadline_exceeded", coverage: { uncovered: manifest } });
  });

  test("complete admitted coverage succeeds; over-cap manifests never start work", async () => {
    const scheduler = policies.createSemanticReviewScheduler(policies.resolveTrustedToolPolicy("evaluation", {
      ...hostPolicy(), semanticReviewLimits: { maxPackets: 1 },
    }));
    let workers = 0;
    expect(await scheduler.run([...manifest, { id: "packet-b", criteria: ["criterion-b"] }], async () => { workers++; })).toMatchObject({ ok: false, code: "review_packet_limit" });
    const result = await scheduler.run(manifest, async (job: Job) => {
      workers++;
      job.admitPacket("packet-a");
      job.markCovered("packet-a");
      return { ok: true };
    });
    expect(workers).toBe(1);
    expect(result).toMatchObject({ ok: true, coverage: { covered: manifest, uncovered: [] } });
  });

  test("cancelling immediately prevents even lazy worker construction", async () => {
    const scheduler = policies.createSemanticReviewScheduler(policies.resolveTrustedToolPolicy("evaluation"));
    const controller = new AbortController();
    let workers = 0;
    const result = scheduler.run(manifest, async () => { workers++; return { ok: true }; }, { signal: controller.signal });
    controller.abort();
    expect(await result).toMatchObject({ ok: false, code: "cancelled" });
    await Promise.resolve();
    expect(workers).toBe(0);
  });

  test("manifest snapshot work consumes the admission-to-terminal deadline", async () => {
    let now = 0;
    let workers = 0;
    const bound = policies.resolveTrustedToolPolicy("evaluation", { ...hostPolicy(), semanticReviewLimits: { deadlineMs: 5 } });
    const scheduler = policies.createSemanticReviewScheduler(bound, {
      nowImpl: () => now, setTimeoutImpl: () => 1, clearTimeoutImpl: () => {},
    });
    const slowManifest = [{ id: "packet-a", get criteria() { now = 10; return ["criterion-a"]; } }];
    const result = await scheduler.run(slowManifest, async () => { workers++; return { ok: true }; });
    expect(result).toMatchObject({ ok: false, code: "review_deadline_exceeded", coverage: { uncovered: manifest } });
    expect(workers).toBe(0);
  });
});
