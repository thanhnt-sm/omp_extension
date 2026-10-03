import { describe, expect, test } from "bun:test";
import {
  preparePayloadSafe,
  redactAnthropicSecrets,
  truncatePayloadState,
  type TypeSafePayload,
} from "../src/payload-safety";

describe("Phase 1: Payload Safety & Redaction", () => {
  test("redacts Anthropic API keys to [REDACTED:anthropic-key]", () => {
    const antKey = "sk-" + "ant-" + "api03-" + "secretkey12345678901234567890";
    const raw = "Authorization: Bearer " + antKey;
    const redacted = redactAnthropicSecrets(raw);
    expect(redacted).not.toContain("sk-" + "ant-api03");
    expect(redacted).toContain("[REDACTED:anthropic-key]");
  });

  test("redacts Claude session cookies and tokens", () => {
    const sidKey = "sk-" + "ant-" + "sid01-" + "sessiontoken12345678901234567890";
    const raw = "Cookie: sessionKey=" + sidKey;
    const redacted = redactAnthropicSecrets(raw);
    expect(redacted).not.toContain("sk-" + "ant-sid01");
    expect(redacted).toContain("[REDACTED:anthropic-key]");
  });

  test("rejects payload when a secret is embedded in a question key", () => {
    const secretKey = "sk-" + "ant-" + "api03-" + "injectedkey12345678901234567890";
    const payload: TypeSafePayload = {
      state: "clean state",
      questions: {
        [secretKey]: {
          type: "noul",
          instructions: "evaluate this",
        },
      },
    };

    expect(() => {
      preparePayloadSafe(payload);
    }).toThrow("payload rejected: secret in key");
  });

  test("redacts secrets inside state and question criteria/instructions", () => {
    const antKey = "sk-" + "ant-" + "api03-" + "secretkey12345678901234567890";
    const awsKey = "AKIA" + "IOSFODNN7EXAMPLE";
    const payload: TypeSafePayload = {
      state: "Diff contains secret: " + antKey + " and " + awsKey,
      questions: {
        q1: {
          type: "choice",
          instructions: "Check if " + antKey + " is leaked",
          criteria: [antKey, "clean"],
        },
      },
    };

    const safe = preparePayloadSafe(payload);
    const jsonStr = JSON.stringify(safe);
    expect(jsonStr).not.toContain("sk-" + "ant-api03");
    expect(jsonStr).not.toContain(awsKey);
    expect(jsonStr).toContain("[REDACTED:anthropic-key]");
  });

  test("enforces hard <= 32768 byte limit on oversized (>100KB) state", () => {
    // Generate ~120KB of diff text
    const largeDiff = "diff --git a/file.txt b/file.txt\n" + "+ line of modified code with details\n".repeat(3000);
    const payload: TypeSafePayload = {
      state: largeDiff,
      questions: {
        check: {
          type: "noul",
          instructions: "Verify modifications",
        },
      },
    };

    const safe = preparePayloadSafe(payload);
    const jsonBytes = Buffer.byteLength(JSON.stringify(safe), "utf8");
    expect(jsonBytes).toBeLessThanOrEqual(32768);
    expect(jsonBytes).toBeGreaterThan(1000); // Ensures it didn't completely wipe everything
  });

  test("prioritizes retention of test failures and error traces during truncation", () => {
    const testFailureTrace = "FAIL src/auth.test.ts > AuthService > rejects expired tokens\nAssertionError: expected 401 to equal 200\n    at auth.test.ts:42:15";
    const hugeDiff = "+ unimportant diff line here\n".repeat(2500);
    const combinedState = `Summary: run finished.\n${hugeDiff}\n${testFailureTrace}`;

    const truncated = truncatePayloadState(combinedState, 15000);
    expect(Buffer.byteLength(truncated, "utf8")).toBeLessThanOrEqual(15000);
    expect(truncated).toContain("FAIL src/auth.test.ts");
    expect(truncated).toContain("AssertionError: expected 401 to equal 200");
    expect(truncated).toContain("[diff truncated for size budget]");
  });

  test("leaves small clean payloads untouched", () => {
    const payload: TypeSafePayload = {
      state: "All unit tests pass. 0 errors.",
      questions: {
        q1: {
          type: "noul",
          instructions: "Is this ready?",
        },
      },
    };

    const safe = preparePayloadSafe(payload);
    expect(safe.state).toBe("All unit tests pass. 0 errors.");
    expect(safe.questions.q1).toBeDefined();
  });
});
