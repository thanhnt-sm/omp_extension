import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

const apiClient = require("../src/typesafe-api-client.cjs");
const resolver = require("../src/typesafe-enabled-resolver.cjs");

describe("Phase 01: Multi-Provider Wire Support (OpenRouter / Cloudflare / TypeSafe)", () => {
  describe("1. Dialect Constants and Exports", () => {
    test("exports SYSTEM_ONE_DIALECTS and validates supported dialects", () => {
      expect(apiClient.SYSTEM_ONE_DIALECTS).toBeDefined();
      expect(apiClient.SYSTEM_ONE_DIALECTS.TYPESAFE).toBe("typesafe");
      expect(apiClient.SYSTEM_ONE_DIALECTS.OPENROUTER_DECISIONS).toBe("openrouter-decisions");
      expect(apiClient.SYSTEM_ONE_DIALECTS.WORKERS_AI_SYSTEMONE).toBe("workers-ai-systemone");

      expect(typeof apiClient.buildSystemOneWirePayload).toBe("function");
      expect(typeof apiClient.decodeSystemOneResponse).toBe("function");
    });
  });

  describe("2. buildSystemOneWirePayload wire construction", () => {
    test("constructs default typesafe wire payload with standard endpoint and headers", () => {
      const payload = apiClient.buildSystemOneWirePayload("typesafe", {
        apiKey: "ts-test-key-12345",
        model: "jev-latest",
        state: "Task completed successfully",
        questions: {
          q1: { type: "noul", instructions: "Is code tested?" },
        },
      });

      expect(payload.url).toBe("https://api.typesafe.ai/v1/systemone");
      expect(payload.headers["Content-Type"]).toBe("application/json");
      expect(payload.headers["Authorization"]).toBe("Bearer " + "ts-test-key-12345");

      const parsedBody = JSON.parse(payload.body);
      expect(parsedBody.model).toBe("jev-latest");
      expect(parsedBody.state).toBe("Task completed successfully");
      expect(parsedBody.questions.q1.type).toBe("noul");
    });

    test("honors custom baseUrl and endpoint for typesafe dialect", () => {
      const withBaseUrl = apiClient.buildSystemOneWirePayload("typesafe", {
        apiKey: "ts-key",
        baseUrl: "https://proxy.internal.corp",
        state: "test",
        questions: {},
      });
      expect(withBaseUrl.url).toBe("https://proxy.internal.corp/v1/systemone");

      const withEndpoint = apiClient.buildSystemOneWirePayload("typesafe", {
        apiKey: "ts-key",
        endpoint: "https://custom.endpoint.ai/custom-systemone",
        state: "test",
        questions: {},
      });
      expect(withEndpoint.url).toBe("https://custom.endpoint.ai/custom-systemone");
    });

    test("constructs openrouter-decisions wire payload at /decisions", () => {
      const orTestKey = "openrouter-token-sample";
      const payload = apiClient.buildSystemOneWirePayload("openrouter-decisions", {
        apiKey: orTestKey,
        model: "anthropic/claude-3.5-sonnet",
        state: "OpenRouter decision state",
        questions: {
          q_decide: { type: "choice", instructions: "Pick option", criteria: { optA: "A", optB: "B" } },
        },
      });

      expect(payload.url).toBe("https://openrouter.ai/api/v1/decisions");
      expect(payload.headers["Content-Type"]).toBe("application/json");
      expect(payload.headers["Authorization"]).toBe("Bearer " + orTestKey);

      const parsedBody = JSON.parse(payload.body);
      expect(parsedBody.model).toBe("anthropic/claude-3.5-sonnet");
      expect(parsedBody.state).toBe("OpenRouter decision state");
      expect(parsedBody.questions.q_decide.type).toBe("choice");
    });

    test("honors custom baseUrl for openrouter-decisions", () => {
      const payload = apiClient.buildSystemOneWirePayload("openrouter-decisions", {
        apiKey: "sk-or-key",
        baseUrl: "https://openrouter-mirror.internal/api/v1",
        state: "state",
        questions: {},
      });
      expect(payload.url).toBe("https://openrouter-mirror.internal/api/v1/decisions");
    });

    test("constructs workers-ai-systemone wire payload with Cloudflare Clef routing", () => {
      const payload = apiClient.buildSystemOneWirePayload("workers-ai-systemone", {
        apiKey: "cf-token-secret-987",
        accountId: "cf-account-abc",
        model: "@cf/cloudflare/clef",
        state: "Workers AI evaluation state",
        questions: {
          q_score: { type: "score", instructions: "Score quality", criteria: ["poor", "fair", "good"] },
        },
      });

      expect(payload.url).toBe("https://api.cloudflare.com/client/v4/accounts/cf-account-abc/ai/run/@cf/cloudflare/clef");
      expect(payload.headers["Content-Type"]).toBe("application/json");
      expect(payload.headers["Authorization"]).toBe("Bearer " + "cf-token-secret-987");

      const parsedBody = JSON.parse(payload.body);
      expect(parsedBody.model).toBe("@cf/cloudflare/clef");
      expect(parsedBody.state).toBe("Workers AI evaluation state");
    });

    test("honors custom baseUrl and {model} interpolation for workers-ai-systemone", () => {
      const payload = apiClient.buildSystemOneWirePayload("workers-ai-systemone", {
        apiKey: "cf-key",
        baseUrl: "https://gateway.ai.cloudflare.com/v1/my-account/my-gateway/workers-ai",
        model: "@cf/cloudflare/clef",
        state: "test",
        questions: {},
      });
      expect(payload.url).toBe("https://gateway.ai.cloudflare.com/v1/my-account/my-gateway/workers-ai/@cf/cloudflare/clef");
    });
  });

  describe("3. decodeSystemOneResponse response decoding and normalization", () => {
    test("decodes standard typesafe response", () => {
      const raw = {
        answers: {
          q1: { noul: 0.94 },
        },
        model: "jev-latest",
        usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
        billing: { credits: 1 },
      };

      const decoded = apiClient.decodeSystemOneResponse("typesafe", raw);
      expect(decoded.answers).toEqual({ q1: { noul: 0.94 } });
      expect(decoded.model).toBe("jev-latest");
      expect(decoded.usage.total_tokens).toBe(60);
      expect(decoded.billing.credits).toBe(1);
    });

    test("decodes openrouter-decisions response and maps cost into usage tracking", () => {
      const raw = {
        answers: {
          q_decide: { choice: "optA", confidence: 0.98 },
        },
        model: "anthropic/claude-3.5-sonnet",
        usage: { prompt_tokens: 120, completion_tokens: 25, total_tokens: 145 },
        cost: 0.00045,
      };

      const decoded = apiClient.decodeSystemOneResponse("openrouter-decisions", raw);
      expect(decoded.answers).toEqual({ q_decide: { choice: "optA", confidence: 0.98 } });
      expect(decoded.model).toBe("anthropic/claude-3.5-sonnet");
      expect(decoded.cost).toBe(0.00045);
      expect(decoded.usage.cost).toBe(0.00045);
      expect(decoded.usage.total_tokens).toBe(145);
    });

    test("decodes workers-ai-systemone response unwrapping Cloudflare result envelope", () => {
      const raw = {
        result: {
          answers: {
            q_score: { score: 2, confidence: 0.9 },
          },
          model: "@cf/cloudflare/clef",
          usage: { prompt_tokens: 80, completion_tokens: 15 },
        },
        success: true,
        errors: [],
        messages: [],
      };

      const decoded = apiClient.decodeSystemOneResponse("workers-ai-systemone", raw);
      expect(decoded.answers).toEqual({ q_score: { score: 2, confidence: 0.9 } });
      expect(decoded.model).toBe("@cf/cloudflare/clef");
      expect(decoded.usage.prompt_tokens).toBe(80);
    });

    test("handles malformed response safely without throwing", () => {
      expect(apiClient.decodeSystemOneResponse("typesafe", null).answers).toBeNull();
      expect(apiClient.decodeSystemOneResponse("typesafe", undefined).answers).toBeNull();
      expect(apiClient.decodeSystemOneResponse("openrouter-decisions", "not-json").answers).toBeNull();
      expect(apiClient.decodeSystemOneResponse("workers-ai-systemone", { success: false }).answers).toBeNull();
    });
  });

  describe("4. judgeTypeSafe multi-dialect integration and retry", () => {
    test("routes request through specified dialect with retry and cost tracking", async () => {
      let requestedUrl = "";
      let requestedHeaders: Record<string, string> = {};
      let attempts = 0;

      const mockFetch = async (url: string, init: RequestInit) => {
        attempts++;
        requestedUrl = url;
        requestedHeaders = init.headers as Record<string, string>;

        if (attempts === 1) {
          return new Response("", { status: 429, headers: { "retry-after": "1" } });
        }

        return new Response(JSON.stringify({
          answers: { q1: { noul: 0.95 } },
          model: "openrouter/auto",
          usage: { prompt_tokens: 30, completion_tokens: 5, total_tokens: 35 },
          cost: 0.00012,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      };

      const result = await apiClient.judgeTypeSafe({
        dialect: "openrouter-decisions",
        apiKey: "sk-or-test-key",
        args: {
          model: "jev-latest",
          state: "Test state for dialect integration",
          questions: { q1: { type: "noul", instructions: "Passed?" } },
        },
        fetchImpl: mockFetch,
        nowImpl: () => 0,
        wallNowImpl: () => 0,
        sleepImpl: async () => {},
        randomImpl: () => 0,
      });

      expect(result.ok).toBe(true);
      expect(requestedUrl).toBe("https://openrouter.ai/api/v1/decisions");
      expect(requestedHeaders["Authorization"]).toBe("Bearer sk-or-test-key");
      expect(result.answers.q1.noul).toBe(0.95);
      expect(result.metadata.usage.cost).toBe(0.00012);
      expect(result.metadata.attempts).toBe(2);
    });

    test("retries HTTP 429 on typesafe dialect with exponential backoff", async () => {
      let attempts = 0;
      let requestedUrl = "";
      const distinctApiKey = "ts-retry-key-distinct-429-1";

      const mockFetch = async (url: string, _init: RequestInit) => {
        attempts++;
        requestedUrl = url;
        if (attempts === 1) {
          return new Response("", { status: 429, headers: { "retry-after": "1" } });
        }
        return new Response(JSON.stringify({
          answers: { q_ts: { noul: 0.99 } },
          model: "jev-latest",
          usage: { total_tokens: 42 },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      };

      const result = await apiClient.judgeTypeSafe({
        dialect: "typesafe",
        apiKey: distinctApiKey,
        args: {
          model: "jev-latest",
          state: "TypeSafe 429 retry state",
          questions: { q_ts: { type: "noul", instructions: "Did retry work?" } },
        },
        fetchImpl: mockFetch,
        nowImpl: () => 0,
        wallNowImpl: () => 0,
        sleepImpl: async () => {},
        randomImpl: () => 0,
      });

      expect(result.ok).toBe(true);
      expect(requestedUrl).toBe("https://api.typesafe.ai/v1/systemone");
      expect(result.answers.q_ts.noul).toBe(0.99);
      expect(result.metadata.attempts).toBe(2);
    });

    test("retries HTTP 529 overloaded on workers-ai-systemone dialect with unwrapped envelope", async () => {
      let attempts = 0;
      let requestedUrl = "";
      const distinctApiKey = "cf-retry-key-distinct-529-2";

      const mockFetch = async (url: string, _init: RequestInit) => {
        attempts++;
        requestedUrl = url;
        if (attempts === 1) {
          return new Response("", { status: 529, headers: { "retry-after": "1" } });
        }
        return new Response(JSON.stringify({
          result: {
            answers: { q_cf: { noul: 0.96 } },
            model: "@cf/cloudflare/clef",
          },
          success: true,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      };

      const result = await apiClient.judgeTypeSafe({
        dialect: "workers-ai-systemone",
        apiKey: distinctApiKey,
        accountId: "acct-529-test",
        args: {
          state: "Workers AI 529 retry state",
          questions: { q_cf: { type: "noul", instructions: "Is Clef recovered from 529?" } },
        },
        fetchImpl: mockFetch,
        nowImpl: () => 0,
        wallNowImpl: () => 0,
        sleepImpl: async () => {},
        randomImpl: () => 0,
      });

      expect(result.ok).toBe(true);
      expect(requestedUrl).toBe("https://api.cloudflare.com/client/v4/accounts/acct-529-test/ai/run/@cf/cloudflare/clef");
      expect(result.answers.q_cf.noul).toBe(0.96);
      expect(result.metadata.attempts).toBe(2);
    });

    test("exhausts retries on persistent HTTP 429 and returns fail-closed http_429 code", async () => {
      let attempts = 0;
      const distinctApiKey = "sk-exhaust-key-distinct-429-3";

      const mockFetch = async () => {
        attempts++;
        return new Response("Too Many Requests", { status: 429, headers: { "retry-after": "1" } });
      };

      const result = await apiClient.judgeTypeSafe({
        dialect: "typesafe",
        apiKey: distinctApiKey,
        args: {
          model: "jev-latest",
          state: "Exhausted retry test state",
          questions: { q1: { type: "noul", instructions: "Exhausted?" } },
        },
        fetchImpl: mockFetch,
        nowImpl: () => 0,
        wallNowImpl: () => 0,
        sleepImpl: async () => {},
        randomImpl: () => 0,
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe("http_429");
      expect(attempts).toBe(3); // default maxAttempts
      expect(JSON.stringify(result).includes(distinctApiKey)).toBe(false);
      expect(JSON.stringify(result).includes("Too Many Requests")).toBe(false);
    });

    test("redacts apiKey from logs and never leaks secrets in metadata or payloads", async () => {
      const secretKey = "sk-super-secret-key-99999";
      let payloadBody = "";

      const mockFetch = async (_url: string, init: RequestInit) => {
        payloadBody = init.body as string;
        return new Response(JSON.stringify({
          answers: { q1: { noul: 0.9 } },
          model: "jev-latest",
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      };

      const result = await apiClient.judgeTypeSafe({
        apiKey: secretKey,
        args: {
          model: "jev-latest",
          state: `Private token is ${secretKey}`,
          questions: { q1: { type: "noul", instructions: "Safe?" } },
        },
        fetchImpl: mockFetch,
        nowImpl: () => 0,
        wallNowImpl: () => 0,
      });

      expect(result.ok).toBe(true);
      // Secret must be redacted from state in payloadBody
      expect(payloadBody.includes(secretKey)).toBe(false);
      // Metadata must not contain the raw key
      expect(JSON.stringify(result.metadata).includes(secretKey)).toBe(false);
    });
  });

  describe("5. typesafe-enabled-resolver configuration of dialect and endpoint", () => {
    test("reads dialect and endpoint from typesafe.json without warnings", () => {
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "omp-dialect-test-"));
      const ompAgentDir = path.join(tmpHome, ".omp", "agent");
      fs.mkdirSync(ompAgentDir, { recursive: true });

      const configPath = path.join(ompAgentDir, "typesafe.json");
      fs.writeFileSync(configPath, JSON.stringify({
        typesafe: {
          enabled: true,
          projects: ["*"],
          dialect: "openrouter-decisions",
          endpoint: "https://openrouter.ai/api/v1/decisions",
        },
      }));

      try {
        const warnings = resolver.typeSafeConfigWarnings({
          typesafe: {
            enabled: true,
            projects: ["*"],
            dialect: "openrouter-decisions",
            endpoint: "https://openrouter.ai/api/v1/decisions",
          },
        });
        expect(warnings).toEqual([]);

        const resolved = resolver.resolveTypeSafeEnabled(process.cwd(), {
          homeDir: tmpHome,
          env: { TYPESAFE_API_KEY: "test-key" },
        });

        expect(resolved.enabled).toBe(true);
        expect(resolved.dialect).toBe("openrouter-decisions");
        expect(resolved.endpoint).toBe("https://openrouter.ai/api/v1/decisions");

        if (typeof resolver.resolveTypeSafeConfig === "function") {
          const fullConfig = resolver.resolveTypeSafeConfig(process.cwd(), {
            homeDir: tmpHome,
            env: { TYPESAFE_API_KEY: "test-key" },
          });
          expect(fullConfig.enabled).toBe(true);
          expect(fullConfig.dialect).toBe("openrouter-decisions");
          expect(fullConfig.endpoint).toBe("https://openrouter.ai/api/v1/decisions");
        }
      } finally {
        fs.rmSync(tmpHome, { recursive: true, force: true });
      }
    });

    test("fails closed if dialect or endpoint is invalid", () => {
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "omp-dialect-invalid-"));
      const ompAgentDir = path.join(tmpHome, ".omp", "agent");
      fs.mkdirSync(ompAgentDir, { recursive: true });

      try {
        fs.writeFileSync(path.join(ompAgentDir, "typesafe.json"), JSON.stringify({
          typesafe: {
            enabled: true,
            projects: ["*"],
            dialect: "unknown-malicious-dialect",
          },
        }));

        const res1 = resolver.resolveTypeSafeEnabled(process.cwd(), {
          homeDir: tmpHome,
          env: { TYPESAFE_API_KEY: "test-key" },
        });
        expect(res1.enabled).toBe(false);
        expect(res1.reason).toBe("global-wire-config-invalid");

        fs.writeFileSync(path.join(ompAgentDir, "typesafe.json"), JSON.stringify({
          typesafe: {
            enabled: true,
            projects: ["*"],
            dialect: "openrouter-decisions",
            endpoint: "ftp://not-http-url",
          },
        }));

        const res2 = resolver.resolveTypeSafeEnabled(process.cwd(), {
          homeDir: tmpHome,
          env: { TYPESAFE_API_KEY: "test-key" },
        });
        expect(res2.enabled).toBe(false);
        expect(res2.reason).toBe("global-wire-config-invalid");

        fs.writeFileSync(path.join(ompAgentDir, "typesafe.json"), JSON.stringify({
          typesafe: {
            enabled: true,
            projects: ["*"],
            dialect: "openrouter-decisions",
            endpoint: "https://user:pass@evil.com/decisions",
          },
        }));

        const res3 = resolver.resolveTypeSafeEnabled(process.cwd(), {
          homeDir: tmpHome,
          env: { TYPESAFE_API_KEY: "test-key" },
        });
        expect(res3.enabled).toBe(false);
        expect(res3.enabled).toBe(false);
        expect(res3.reason).toBe("global-wire-config-invalid");

        // Plain HTTP to non-loopback is rejected to prevent cleartext token egress
        fs.writeFileSync(path.join(ompAgentDir, "typesafe.json"), JSON.stringify({
          typesafe: {
            enabled: true,
            projects: ["*"],
            dialect: "openrouter-decisions",
            endpoint: "http://insecure-remote.example.com/decisions",
          },
        }));

        const resInsecure = resolver.resolveTypeSafeEnabled(process.cwd(), {
          homeDir: tmpHome,
          env: { TYPESAFE_API_KEY: "test-key" },
        });
        expect(resInsecure.enabled).toBe(false);
        expect(resInsecure.reason).toBe("global-wire-config-invalid");

        // Loopback HTTP is permitted for local integration testing
        fs.writeFileSync(path.join(ompAgentDir, "typesafe.json"), JSON.stringify({
          typesafe: {
            enabled: true,
            projects: ["*"],
            dialect: "openrouter-decisions",
            endpoint: "http://localhost:8080/decisions",
          },
        }));

        const resLoopback = resolver.resolveTypeSafeEnabled(process.cwd(), {
          homeDir: tmpHome,
          env: { TYPESAFE_API_KEY: "test-key" },
        });
        expect(resLoopback.enabled).toBe(true);
        expect(resLoopback.endpoint).toBe("http://localhost:8080/decisions");
      } finally {
        fs.rmSync(tmpHome, { recursive: true, force: true });
      }
    });
  });

  describe("6. Hardened Security & Wire Integrity", () => {
    test("extraHeaders cannot overwrite Authorization or Content-Type", () => {
      const payload = apiClient.buildSystemOneWirePayload("typesafe", {
        apiKey: "legit-api-key",
        headers: {
          "Authorization": "Bearer evil-stolen-token",
          "Content-Type": "text/plain",
          "X-Custom": "custom-val",
        },
      });

      expect(payload.headers["Authorization"]).toBe("Bearer legit-api-key");
      expect(payload.headers["Content-Type"]).toBe("application/json");
      expect(payload.headers["X-Custom"]).toBe("custom-val");
    });

    test("judgeTypeSafe rejects invalid dialect with invalid_dialect code", async () => {
      const result = await apiClient.judgeTypeSafe({
        dialect: "completely-bogus-dialect",
        apiKey: "test-key",
        args: {
          model: "jev-latest",
          state: "test",
          questions: { q1: { type: "noul", instructions: "test" } },
        },
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe("invalid_dialect");
    });

    test("judgeTypeSafe never falls back to raw answers when decoded answers is null", async () => {
      const mockFetch = async () => {
        return new Response(JSON.stringify({
          success: false,
          answers: { q1: { noul: 0.99 } },
          errors: ["Cloudflare worker failed"],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      };

      const result = await apiClient.judgeTypeSafe({
        dialect: "workers-ai-systemone",
        apiKey: "cf-token",
        args: {
          model: "jev-latest",
          state: "test",
          questions: { q1: { type: "noul", instructions: "test" } },
        },
        fetchImpl: mockFetch,
        nowImpl: () => 0,
        wallNowImpl: () => 0,
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe("bad_response");
    });

    test("end-to-end integration: config in typesafe.json routes to configured wire endpoint", async () => {
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "omp-wire-integration-"));
      const ompAgentDir = path.join(tmpHome, ".omp", "agent");
      fs.mkdirSync(ompAgentDir, { recursive: true });

      fs.writeFileSync(path.join(ompAgentDir, "typesafe.json"), JSON.stringify({
        typesafe: {
          enabled: true,
          projects: ["*"],
          dialect: "openrouter-decisions",
          endpoint: "https://openrouter.ai/api/v1/decisions",
        },
      }));

      try {
        const resolvedWire = resolver.resolveTypeSafeEnabled(process.cwd(), {
          homeDir: tmpHome,
          env: { TYPESAFE_API_KEY: "sk-or-integration-key" },
        });

        expect(resolvedWire.enabled).toBe(true);
        expect(resolvedWire.dialect).toBe("openrouter-decisions");
        expect(resolvedWire.endpoint).toBe("https://openrouter.ai/api/v1/decisions");

        let fetchedUrl = "";
        let fetchedAuth = "";

        const mockFetch = async (url: string, init: RequestInit) => {
          fetchedUrl = url;
          fetchedAuth = (init.headers as Record<string, string>)["Authorization"];
          return new Response(JSON.stringify({
            answers: { q1: { noul: 0.95 } },
            model: "anthropic/claude-3.5-sonnet",
            usage: { total_tokens: 50 },
            cost: 0.0002,
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        };

        const policyClient = require("../src/typesafe-policy-client.cjs");
        const orIntegrationKey = "openrouter-integration-token-42";
        const outcome = await policyClient.judgeWithPolicy({
          args: {
            model: "jev-latest",
            state: "End-to-end integration test state",
            questions: { q1: { type: "noul", instructions: "Passed integration?" } },
          },
          purpose: "judge",
          apiKey: orIntegrationKey,
          homeDir: tmpHome,
          fetchImpl: mockFetch,
          dialect: resolvedWire.dialect,
          endpoint: resolvedWire.endpoint,
          nowImpl: () => 0,
          wallNowImpl: () => 0,
        });

        expect(outcome.ok).toBe(true);
        expect(fetchedUrl).toBe("https://openrouter.ai/api/v1/decisions");
        expect(fetchedAuth).toBe("Bearer " + orIntegrationKey);
        expect(outcome.answers.q1.noul).toBe(0.95);
        expect(outcome.metadata.usage.cost).toBe(0.0002);
      } finally {
        fs.rmSync(tmpHome, { recursive: true, force: true });
      }
    });

    test("end-to-end integration for workers-ai-systemone defaults to @cf/cloudflare/clef model", async () => {
      let requestedUrl = "";
      let requestedModel = "";

      const mockFetch = async (url: string, init: RequestInit) => {
        requestedUrl = url;
        const parsed = JSON.parse(init.body as string);
        requestedModel = parsed.model;
        return new Response(JSON.stringify({
          result: {
            answers: { q1: { noul: 0.98 } },
            model: "@cf/cloudflare/clef",
          },
          success: true,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      };

      const policyClient = require("../src/typesafe-policy-client.cjs");
      const outcome = await policyClient.judgeWithPolicy({
        args: {
          state: "Workers AI evaluation state",
          questions: { q1: { type: "noul", instructions: "Is Clef responsive?" } },
        },
        purpose: "judge",
        apiKey: "cf-test-token",
        dialect: "workers-ai-systemone",
        accountId: "test-acct-123",
        fetchImpl: mockFetch,
        nowImpl: () => 0,
        wallNowImpl: () => 0,
      });

      expect(outcome.ok).toBe(true);
      expect(requestedUrl).toBe("https://api.cloudflare.com/client/v4/accounts/test-acct-123/ai/run/@cf/cloudflare/clef");
      expect(requestedModel).toBe("@cf/cloudflare/clef");
      expect(outcome.answers.q1.noul).toBe(0.98);
      expect(outcome.metadata.resolvedModel).toBe("@cf/cloudflare/clef");
    });
  });
});
