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
          : new Response(JSON.stringify({ answers: {} }), { status: 200 });
      },
      nowImpl: () => 0,
      wallNowImpl: () => 0,
      sleepImpl: async (ms: number) => { delays.push(ms); },
      randomImpl: () => 0,
    });
    expect(outcome.kind).toBe("ok");
    expect(bodies).toEqual(['{"prepared":true}', '{"prepared":true}']);
    expect(delays).toEqual([1000]);
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

  test("bounded body cancellation resolves even when cancel stalls", async () => {
    const response = { body: { cancel: () => new Promise<void>(() => {}) } };
    await expect(client.cancelBodyBounded(response, { timeoutMs: 1 })).resolves.toBeUndefined();
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
});
