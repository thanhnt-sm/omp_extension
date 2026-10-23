import { describe, expect, test } from "bun:test";
import { runMultiPersonaDebate } from "../src/debate-evaluator";

const client = require("../src/typesafe-api-client.cjs");

describe("TypeSafe bounded prepared-body transport", () => {
  test("reuses one prepared body across a retry and honors retry-after", async () => {
    let calls = 0;
    const bodies: string[] = [];
    const delays: number[] = [];
    const outcome = await client.requestWithRetry({
      apiKey: "key-a",
      body: '{"prepared":true}',
      fetchImpl: async (_url: string, init: RequestInit) => {
        bodies.push(init.body as string);
        calls++;
        return calls === 1
          ? new Response("", { status: 529, headers: { "retry-after": "1" } })
          : new Response(JSON.stringify({ answers: {}, model: "jev-observed",
            usage: { input_tokens: 12 }, billing: { credits: 1 } }), { status: 200 });
      },
      nowImpl: () => 0,
      wallNowImpl: () => 0,
      sleepImpl: async (ms: number) => { delays.push(ms); },
      randomImpl: () => 0,
    });
    expect(outcome.kind).toBe("ok");
    expect(bodies).toEqual(['{"prepared":true}', '{"prepared":true}']);
    expect(delays).toEqual([1000]);
    expect(outcome.attempts).toBe(2);
    expect(outcome.attemptReceipts).toHaveLength(2);
    expect(new Set(outcome.attemptReceipts.map((receipt: { receiptId: string }) => receipt.receiptId)).size).toBe(2);
    expect(outcome.attemptReceipts[0]).toMatchObject({
      attempt: 1, status: 529, usage: null, usageUnavailableReason: "error_response_not_parsed",
      questionIds: null, questionCount: null,
    });
    expect(outcome.attemptReceipts[1]).toMatchObject({
      attempt: 2, status: 200, resolvedModel: "jev-observed", usage: { input_tokens: 12 }, billing: { credits: 1 },
    });
    expect(outcome.attemptReceipts[0].bodyDigest).toBe(outcome.attemptReceipts[1].bodyDigest);
    expect(outcome.attemptReceipts[0].bodyBytes).toBe(Buffer.byteLength(bodies[0], "utf8"));
  });

  test("caller abort prevents fetch and does not arm cooldown", async () => {
    const controller = new AbortController();
    controller.abort();
    const state = {};
    let calls = 0;
    await expect(client.requestWithRetry({
      apiKey: "key-abort",
      body: "{}",
      signal: controller.signal,
      rateLimitState: state,
      fetchImpl: async () => { calls++; return new Response("", { status: 429 }); },
    })).rejects.toThrow();
    expect(calls).toBe(0);
    expect(client.checkCredentialCooldown("key-abort", { rateLimitState: state, nowImpl: () => 0 })).toBeNull();
  });

  test("generation prevents stale A-B-A failure from mutating current A", async () => {
    const state = {};
    let resolveA!: (response: Response) => void;
    const oldA = client.requestWithRetry({
      apiKey: "A",
      body: "{}",
      rateLimitState: state,
      fetchImpl: () => new Promise<Response>((resolve) => { resolveA = resolve; }),
      timeoutMs: 10000,
      totalBudgetMs: 15000,
      maxAttempts: 1,
    });
    await client.requestWithRetry({ apiKey: "B", body: "{}", rateLimitState: state, maxAttempts: 1, fetchImpl: async () => new Response("", { status: 200 }) });
    await client.requestWithRetry({ apiKey: "A", body: "{}", rateLimitState: state, maxAttempts: 1, fetchImpl: async () => new Response("", { status: 200 }) });
    resolveA(new Response("", { status: 429 }));
    await oldA;
    expect(client.checkCredentialCooldown("A", { rateLimitState: state })).toBeNull();
  });

  test("A to B to A preserves A cooldown while stale completions remain rejected", async () => {
    const state = {};
    await client.requestWithRetry({ apiKey: "A-cooldown", body: "{}", rateLimitState: state, maxAttempts: 1,
      fetchImpl: async () => new Response("", { status: 429 }), nowImpl: () => 0 });
    await client.requestWithRetry({ apiKey: "B-cooldown", body: "{}", rateLimitState: state, maxAttempts: 1,
      fetchImpl: async () => new Response("", { status: 200 }) });
    let calls = 0;
    const aAgain = await client.requestWithRetry({ apiKey: "A-cooldown", body: "{}", rateLimitState: state,
      fetchImpl: async () => { calls++; return new Response("", { status: 200 }); }, nowImpl: () => 1 });
    expect(aAgain.cooldown).toBe(true);
    expect(calls).toBe(0);
    const isolated = {};
    expect(client.checkCredentialCooldown("A-cooldown", { rateLimitState: isolated, nowImpl: () => 1 })).toBeNull();
  });

  test("explicit caller rate-limit states remain isolated", async () => {
    const first = {};
    const second = {};
    await client.requestWithRetry({ apiKey: "isolated-callers", body: "{}", rateLimitState: first, maxAttempts: 1,
      fetchImpl: async () => new Response("", { status: 401 }) });
    expect(client.checkCredentialCooldown("isolated-callers", { rateLimitState: first })).toMatchObject({ authFailed: true, status: 401 });
    expect(client.checkCredentialCooldown("isolated-callers", { rateLimitState: second })).toBeNull();
  });
  test("bounded body cancellation resolves even when cancel stalls", async () => {
    const response = { body: { cancel: () => new Promise<void>(() => {}) } };
    await expect(client.cancelBodyBounded(response, { timeoutMs: 1 })).resolves.toBeUndefined();
  });

  test("timeout during a hanging body read cancels once and handles late cancellation rejection", async () => {
    let cancelCalls = 0;
    let rejectCancel!: (error: Error) => void;
    let bodyReadStarted = false;
    let fireTimeout: (() => void) | undefined;
    const response = {
      status: 200,
      ok: true,
      body: { cancel: () => {
        cancelCalls += 1;
        return new Promise<void>((_resolve, reject) => { rejectCancel = reject; });
      } },
      json: () => { bodyReadStarted = true; return new Promise<never>(() => {}); },
    };
    const request = client.requestWithRetry({
      apiKey: "hanging-body",
      body: "{}",
      maxAttempts: 1,
      timeoutMs: 5,
      totalBudgetMs: 10000,
      fetchImpl: async () => response,
      setTimeoutImpl: (callback: () => void) => { fireTimeout = callback; return 1; },
      clearTimeoutImpl: () => {},
    });

    for (let i = 0; i < 20 && !bodyReadStarted; i++) await Promise.resolve();
    expect(bodyReadStarted).toBe(true);
    expect(fireTimeout).toBeDefined();
    fireTimeout?.();
    await expect(request).rejects.toMatchObject({ name: "TimeoutError" });
    await Promise.resolve();
    await Promise.resolve();
    expect(cancelCalls).toBe(1);
    rejectCancel(new Error("late cancel failure"));
    await Promise.resolve();
    expect(cancelCalls).toBe(1);
  });
  test("abort before headers cancels a response that arrives later", async () => {
    const controller = new AbortController();
    let resolveFetch!: (response: Response) => void;
    let cancelCalls = 0;
    const request = client.requestWithRetry({
      apiKey: "late-abort-response",
      body: "{}",
      signal: controller.signal,
      maxAttempts: 1,
      fetchImpl: () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    });

    for (let i = 0; i < 20 && !resolveFetch; i++) await Promise.resolve();
    expect(resolveFetch).toBeDefined();
    controller.abort();
    resolveFetch({
      status: 200,
      ok: true,
      body: { cancel: () => { cancelCalls += 1; return Promise.resolve(); } },
      json: async () => ({}),
    } as unknown as Response);

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelCalls).toBe(1);
  });
  test("retries only 429 and 529, then shares a credential cooldown", async () => {
    const state = {};
    let retryableCalls = 0;
    const retryable = await client.requestWithRetry({
      apiKey: "cooldown-key",
      body: "{}",
      rateLimitState: state,
      fetchImpl: async () => {
        retryableCalls++;
        return new Response("", { status: 429 });
      },
      nowImpl: () => 0,
      sleepImpl: async () => {},
      randomImpl: () => 0,
    });
    expect(retryable.kind).toBe("http_error");
    expect(retryableCalls).toBe(3);
    await client.requestWithRetry({
      apiKey: "cooldown-key",
      body: "{}",
      rateLimitState: state,
      fetchImpl: async () => {
        throw new Error("cooldown must prevent another request");
      },
      nowImpl: () => 1,
    });

    let nonRetryableCalls = 0;
    const nonRetryable = await client.requestWithRetry({
      apiKey: "non-retryable-key",
      body: "{}",
      fetchImpl: async () => {
        nonRetryableCalls++;
        return new Response("", { status: 503 });
      },
    });
    expect(nonRetryable.kind).toBe("http_error");
    expect(nonRetryableCalls).toBe(1);
  });

  test("uses an injected timer to bound a fetch implementation that ignores abort", async () => {
    let fireTimeout: (() => void) | undefined;
    const request = client.requestWithRetry({
      apiKey: "timer-key",
      body: "{}",
      fetchImpl: () => new Promise<Response>(() => {}),
      timeoutMs: 10000,
      setTimeoutImpl: (callback: () => void) => {
        fireTimeout = callback;
        return 1;
      },
      clearTimeoutImpl: () => {},
    });
    await Promise.resolve();
    fireTimeout?.();
    await expect(request).rejects.toMatchObject({ name: "TimeoutError" });
  });

  test("same auth-failed credential returns auth without fetching again", async () => {
    const state = {};
    const first = await client.requestWithRetry({
      apiKey: "failed-credential",
      body: "{}",
      rateLimitState: state,
      fetchImpl: async () => new Response("", { status: 401 }),
    });
    expect(first).toMatchObject({ kind: "auth", status: 401 });
    let calls = 0;
    const repeated = await client.requestWithRetry({
      apiKey: "failed-credential",
      body: "{}",
      rateLimitState: state,
      fetchImpl: async () => { calls += 1; return new Response("", { status: 200 }); },
    });
    expect(repeated).toMatchObject({ kind: "auth", status: 401 });
    expect(calls).toBe(0);
  });

  test("fails a debate closed when the judge is unavailable", async () => {
    const result = await runMultiPersonaDebate("Plan", {
      evaluateDebate: async () => ({ error: "network_error" }),
    });
    expect(result.approved).toBe(false);
    expect(result.reasons.join(" ")).toContain("unavailable");
  });

  test("rejects oversized low-level bodies before dispatch and accepts the exact UTF-8 boundary", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return new Response(JSON.stringify({ answers: {} }), { status: 200 });
    };
    expect(await client.requestWithRetry({
      apiKey: "boundary", body: "x".repeat(32769), fetchImpl,
    })).toMatchObject({ kind: "local_error", attempts: 0 });
    expect(calls).toBe(0);
    expect(await client.requestWithRetry({
      apiKey: "boundary", body: "x".repeat(32768), fetchImpl,
    })).toMatchObject({ kind: "ok", attempts: 1 });
    expect(calls).toBe(1);
  });

  test("trusted retry overrides cannot exceed three attempts or fifteen seconds", async () => {
    let now = 0;
    let calls = 0;
    const bodies: string[] = [];
    const result = await client.requestWithRetry({
      apiKey: "bounded-overrides", body: '{"identical":true}', maxAttempts: 100, totalBudgetMs: 999999,
      rateLimitState: {}, nowImpl: () => now, randomImpl: () => 0,
      sleepImpl: async (delay: number) => { now += delay; },
      fetchImpl: async (_url: string, init: RequestInit) => {
        calls++;
        bodies.push(String(init.body));
        now += 5000;
        return new Response("", { status: 529 });
      },
    });
    expect(calls).toBeLessThanOrEqual(3);
    expect(now).toBeLessThanOrEqual(15000);
    expect(new Set(bodies).size).toBe(1);
    expect(result.attempts).toBe(calls);
  });

  test("a network failure is not retried", async () => {
    let calls = 0;
    await expect(client.requestWithRetry({
      apiKey: "network-once", body: "{}", rateLimitState: {},
      fetchImpl: async () => { calls++; throw new Error("offline"); },
    })).rejects.toThrow();
    expect(calls).toBe(1);
  });

  test("network exceptions retain a real dispatch receipt without invented paid usage", async () => {
    let failure: unknown;
    try {
      await client.requestWithRetry({
        apiKey: "receipt-network", body: "{}", rateLimitState: {},
        fetchImpl: async () => { throw new Error("private network detail"); },
      });
    } catch (error) { failure = error; }
    expect(failure).toMatchObject({ attempts: 1, attemptReceipts: [{
      attempt: 1, kind: "request_error", status: null, error: "network_error",
      usage: null, usageUnavailableReason: "request_failed", resolvedModel: null, billing: null,
    }] });
  });
});
