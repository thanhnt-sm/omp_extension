/**
 * Plan 261103 phase 04: edge-scenario gap tests (SC-01..SC-06).
 * Only gaps found by auditing the existing suites are asserted here; SC-04 is already
 * fully covered by tests/evidence-file-security.test.ts and is intentionally not repeated.
 * SC-07 was replaced by tests/h-authority-boundary.test.ts.
 * Hermetic: injected fetch/clock/sleep/random, per-test rateLimitState, no temp dirs or profile access.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { interceptAskCall, shouldAppendAdvisorRemediation, TECHNICAL_ASK_BLOCK_REASON } from "../src/anti-blocking-guards";
import { analyzeDiffForTestEvasion } from "../src/ast-analyzer";
import { createSemanticJudgeClient } from "../src/semantic-judge-client";
import { semanticFailureDisposition } from "../src/semantic-failure";
import { checkDeterministicPreconditions } from "../src/verification-gate";
import type { TaskEvidenceResult } from "../src/evidence-collector";

interface RetryOutcome {
  kind: string; status?: number; cooldown?: boolean; cooldownUntil?: number; attempts: number;
  attemptReceipts: Array<{ kind: string; status: number | null; error: string | null }>;
}
interface JudgeResult { ok: boolean; code?: string; metadata?: { attempts?: number; cooldown?: boolean; attemptReceipts?: RetryOutcome["attemptReceipts"] } }
const client = createRequire(import.meta.url)("../src/typesafe-api-client.cjs") as {
  RETRY_POLICY: Readonly<Record<string, unknown>>;
  requestWithRetry(options: Record<string, unknown>): Promise<RetryOutcome>;
  checkCredentialCooldown(apiKey: string, options: Record<string, unknown>): { cooldown?: boolean; until?: number } | null;
  judgeTypeSafe(options: Record<string, unknown>): Promise<JudgeResult>;
};
const QUESTIONS = { q1: { type: "noul", instructions: "Is the evidence sufficient?" } };
const respond = (status: number, headers: Record<string, string> = {}) => new Response("", { status, headers });
const judgeArgs = (state: unknown) => ({ model: "jev-latest", state, questions: QUESTIONS });

describe("SC-01 network drop / 503: real retry policy then fail-closed, no crash", () => {
  test("RETRY_POLICY is frozen and retries only 429/529 (the code does NOT retry 503)", () => {
    expect(Object.isFrozen(client.RETRY_POLICY)).toBe(true);
    expect(client.RETRY_POLICY).toMatchObject({ retryableStatus: [429, 529], maxAttempts: 3, totalBudgetMs: 15000, cooldownMs: 45000 });
  });

  test("persistent 529 backs off exponentially with a growing ceiling, then fails closed after 3 attempts", async () => {
    const delays: number[] = [];
    const result = await client.judgeTypeSafe({
      apiKey: "sc01-529-backoff", args: judgeArgs("backoff"), rateLimitState: {},
      fetchImpl: async () => respond(529),
      nowImpl: () => 0, wallNowImpl: () => 0, randomImpl: () => 0.999,
      sleepImpl: async (ms: number) => { delays.push(ms); },
    });
    expect(result).toMatchObject({ ok: false, code: "http_529" });
    expect(result.metadata?.attempts).toBe(3);
    expect(delays).toEqual([499, 999]); // floor(0.999 * min(4000, 500 * 2^(n-1)))
  });

  test("503 is returned as a fail-closed http_503 after one dispatch, never retried, never arms a cooldown", async () => {
    let calls = 0;
    const rateLimitState = {};
    const run = () => client.judgeTypeSafe({ apiKey: "sc01-503", args: judgeArgs("503"), rateLimitState,
      fetchImpl: async () => { calls++; return respond(503); }, nowImpl: () => 0 });
    expect(await run()).toMatchObject({ ok: false, code: "http_503", metadata: { attempts: 1 } });
    expect((await run()).metadata?.cooldown).toBeUndefined();
    expect(calls).toBe(2);
    expect(client.checkCredentialCooldown("sc01-503", { rateLimitState, nowImpl: () => 0 })).toBeNull();
  });

  test("a dropped connection resolves to network_error with a request_error receipt and leaks no transport detail", async () => {
    let calls = 0;
    const result = await client.judgeTypeSafe({ apiKey: "sc01-drop", args: judgeArgs("drop"), rateLimitState: {},
      fetchImpl: async () => { calls++; throw new Error("ECONNRESET 10.0.0.7 private-host"); } });
    expect(result).toMatchObject({ ok: false, code: "network_error" });
    expect(calls).toBe(1);
    expect(result.metadata?.attemptReceipts).toMatchObject([{ kind: "request_error", status: null, error: "network_error" }]);
    expect(JSON.stringify(result)).not.toContain("private-host");
  });

  describe("through the real semantic client", () => {
    const savedKey = process.env.TYPESAFE_API_KEY;
    beforeEach(() => { process.env.TYPESAFE_API_KEY = `sc01-semantic-${crypto.randomUUID()}`; });
    afterEach(() => { if (savedKey === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = savedKey; });

    test.each([
      ["503 response", async () => respond(503), "http_503"],
      ["dropped connection", async () => { throw new Error("offline"); }, "network_error"],
    ])("%s maps to UNAVAILABLE (not REJECTED) and owns no Advisor remediation", async (_name, fetchImpl, code) => {
      const semantic = createSemanticJudgeClient({ purpose: "expert", fetchImpl: fetchImpl as typeof fetch });
      const response = await semantic.evaluate({ state: "evidence", questions: { q1: { type: "noul", instructions: "Is the evidence sufficient?" } } });
      expect(response.error).toBe(code);
      expect(response.answers).toBeUndefined();
      const disposition = semanticFailureDisposition(response.error);
      expect(disposition.status).toBe("UNAVAILABLE");
      // Spec says an infrastructure outage should trigger Advisor diagnosis; the code deliberately routes it to the service operator.
      expect(shouldAppendAdvisorRemediation(disposition)).toBe(false);
    });
  });
});

describe("SC-02 429 + Retry-After: exact spacing, 45 s cooldown, credential isolation", () => {
  const base = (apiKey: string, extra: Record<string, unknown>) => ({
    apiKey, body: '{"sc02":true}', rateLimitState: {}, randomImpl: () => 0, wallNowImpl: () => 1_000_000, ...extra,
  });

  test("delta-seconds Retry-After is honoured as a floor plus bounded jitter, and an HTTP-date is converted via the wall clock", async () => {
    for (const [header, expected] of [["2", 2125], [new Date(1_003_000).toUTCString(), 3125]] as const) {
      const delays: number[] = [];
      let calls = 0;
      const outcome = await client.requestWithRetry(base(`sc02-${header}`, {
        randomImpl: () => 0.5, nowImpl: () => 0, sleepImpl: async (ms: number) => { delays.push(ms); },
        fetchImpl: async () => (++calls === 1 ? respond(429, { "retry-after": header }) : new Response(JSON.stringify({ answers: {} }), { status: 200 })),
      }));
      expect(outcome.kind).toBe("ok");
      expect(delays).toEqual([expected]);
    }
  });

  test("a Retry-After above the 5 s ceiling is not retried; cooldown lasts max(45 s, server value) and blocks dispatch until it ends", async () => {
    const state = {};
    let calls = 0;
    const fetchImpl = async () => { calls++; return respond(429, { "retry-after": "120" }); };
    const first = await client.requestWithRetry(base("sc02-long", { rateLimitState: state, nowImpl: () => 0, fetchImpl }));
    expect(first).toMatchObject({ kind: "http_error", status: 429, attempts: 1, cooldownUntil: 120_000 });
    const early = await client.requestWithRetry(base("sc02-long", { rateLimitState: state, nowImpl: () => 119_999, fetchImpl }));
    expect(early).toMatchObject({ cooldown: true, attempts: 0 });
    expect(calls).toBe(1);

    // Without a server hint the floor is exactly RETRY_POLICY.cooldownMs (45 s), end-exclusive.
    const plain = {};
    const plainFetch = async () => { calls++; return respond(429); };
    await client.requestWithRetry(base("sc02-plain", { rateLimitState: plain, nowImpl: () => 0, sleepImpl: async () => {}, fetchImpl: plainFetch }));
    expect(client.checkCredentialCooldown("sc02-plain", { rateLimitState: plain, nowImpl: () => 44_999 })).toMatchObject({ cooldown: true, until: 45_000 });
    expect(client.checkCredentialCooldown("sc02-plain", { rateLimitState: plain, nowImpl: () => 45_000 })).toBeNull();
  });

  test("state is keyed by SHA-256 digest (never the raw key) and a rotated-away cooldown survives A to B to A", async () => {
    const state: { entries?: Map<string, unknown> } = {};
    const fail = async () => respond(429, { "retry-after": "60" });
    await client.requestWithRetry(base("sc02-key-A", { rateLimitState: state, nowImpl: () => 0, maxAttempts: 1, fetchImpl: fail }));
    await client.requestWithRetry(base("sc02-key-B", { rateLimitState: state, nowImpl: () => 0, maxAttempts: 1, fetchImpl: async () => new Response(JSON.stringify({ answers: {} }), { status: 200 }) }));
    for (const key of state.entries!.keys()) expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect([...state.entries!.keys()].join()).not.toContain("sc02-key");
    expect(client.checkCredentialCooldown("sc02-key-A", { rateLimitState: state, nowImpl: () => 59_999 })).toMatchObject({ cooldown: true });
    expect(client.checkCredentialCooldown("sc02-key-B", { rateLimitState: state, nowImpl: () => 59_999 })).toBeNull();
  });
});

describe("SC-03 test-evasion: a green test run cannot launder weakened tests through Gate 1", () => {
  const evidence = (gitDiff: string): TaskEvidenceResult => ({
    gitStatus: "M tests/service.test.ts", gitDiff, testExitCode: 0, testOutput: "PASS",
    criteria: ["Implement service"], cleanWorkingTree: false, timestamp: "2026-11-11T00:00:00.000Z",
  });
  const patch = (...lines: string[]) => ["--- a/tests/service.test.ts", "+++ b/tests/service.test.ts", ...lines].join("\n");

  test.each([
    ["real assertion rewritten to expect(1).toBe(1)", patch("-  expect(total).toBe(42);", "+  expect(1).toBe(1);"), "Detected trivial tautology assertion (e.g., expect(true).toBe(true))."],
    ["real assertion rewritten to expect(0).toEqual(0)", patch("-  expect(total).toBe(42);", "+  expect(0).toEqual(0);"), "Detected trivial tautology assertion (e.g., expect(true).toBe(true))."],
    ["assertion deleted outright", patch("-  expect(total).toBe(42);", "   done();"), "Test evasion detected: git diff contains deleted assertions (expect/assert). Deleting tests to fake completion is prohibited."],
    ["suite disabled with .skip while assertions stay balanced", patch("-test(\"adds\", () => {", "+test.skip(\"adds\", () => {"), "Detected skipped or todo test suite in additions."],
  ])("%s is REJECTED at Gate 1 even with test exit code 0", (_name, diff, reason) => {
    expect(analyzeDiffForTestEvasion(diff).isSafe).toBe(false);
    const gate1 = checkDeterministicPreconditions(evidence(diff));
    expect(gate1).toMatchObject({ passed: false, testPassed: true, testEvasion: true });
    expect(gate1.reasons).toContain(reason);
    expect(gate1.outcome?.status).toBe("REJECTED");
  });

  test("an honest rewrite of an assertion with a real subject still passes Gate 1", () => {
    const diff = patch("-  expect(total).toBe(42);", "+  expect(total).toBe(43);");
    expect(checkDeterministicPreconditions(evidence(diff))).toMatchObject({ passed: true, testEvasion: false });
  });
});

describe("SC-05 secret leakage: redaction holds at the final wire body and keeps telemetry counts", () => {
  const SECRETS = ["sk-" + "ant-api03-" + "wiresecret12345678901234567890", "AKIA" + "IOSFODNN7EXAMPLE", "ghp_" + "abcdefghijklmnopqrstuvwxyz0123456789"];
  const RUNTIME_KEY = "sc05-runtime-credential-value-0001";

  async function captureWire(args: Record<string, unknown>): Promise<{ result: JudgeResult; bodies: string[] }> {
    const bodies: string[] = [];
    const result = await client.judgeTypeSafe({ apiKey: RUNTIME_KEY, args, rateLimitState: {}, maxAttempts: 1,
      fetchImpl: async (_url: string, init: RequestInit) => { bodies.push(String(init.body)); return new Response(JSON.stringify({ answers: { q1: { noul: 0.9 } } }), { status: 200 }); } });
    return { result, bodies };
  }

  test("secrets in state and question instructions, plus the runtime API key, never reach the wire; integer token counts do", async () => {
    const { result, bodies } = await captureWire({
      model: "jev-latest",
      state: { log: `token=${SECRETS[0]} aws=${SECRETS[1]} gh=${SECRETS[2]} runtime=${RUNTIME_KEY}`, usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 } },
      questions: { q1: { type: "noul", instructions: `Did ${SECRETS[0]} leak into ${SECRETS[2]}?` } },
    });
    expect(result.ok).toBe(true);
    expect(bodies).toHaveLength(1);
    for (const secret of [...SECRETS, RUNTIME_KEY]) expect(bodies[0]).not.toContain(secret);
    expect(bodies[0]).toContain("[REDACTED");
    const state = JSON.parse(bodies[0]).state as { usage: Record<string, number> };
    expect(state.usage).toEqual({ input_tokens: 10, output_tokens: 3, total_tokens: 13 });
  });

  test("a secret embedded in a question key is rejected before any dispatch", async () => {
    const { result, bodies } = await captureWire({ model: "jev-latest", state: "clean", questions: { [SECRETS[0]]: QUESTIONS.q1 } });
    expect(result).toMatchObject({ ok: false, code: "payload rejected: secret in key" });
    expect(bodies).toHaveLength(0);
  });
});

describe("SC-06 ask spam: every payload shape the host forwards to the gate is inspected", () => {
  const technical = "Tests are failing in auth.ts. How should I fix this?";
  const shapes: Array<[string, Record<string, unknown>]> = [
    ["questions array", { questions: [{ question: technical }] }],
    ["single question string", { question: technical }],
    ["short-form i string", { i: technical }],
    ["mixed shapes with a harmless first entry", { questions: [{ question: "Logo A or B?" }], i: technical }],
  ];

  test.each(shapes)("%s is blocked on every repeat (stateless, 25 identical asks)", (_name, input) => {
    for (let n = 0; n < 25; n++) expect(interceptAskCall(input)).toEqual({ blocked: true, reason: TECHNICAL_ASK_BLOCK_REASON });
  });

  test("the human-owned exemption applies to every shape; malformed payloads neither throw nor block", () => {
    for (const [, input] of shapes) expect(interceptAskCall(input, { humanOwned: true })).toEqual({ blocked: false });
    for (const input of [{}, { questions: "nope" }, { questions: [null, 7, { question: 5 }] }, { question: null, i: 42 }]) {
      expect(interceptAskCall(input as Record<string, unknown>)).toEqual({ blocked: false });
    }
  });
});
