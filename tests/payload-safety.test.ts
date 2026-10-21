import { describe, expect, test } from "bun:test";
import {
  preparePayloadSafe,
  redactAnthropicSecrets,
  truncatePayloadState,
  type TypeSafePayload,
} from "../src/payload-safety";

describe("Phase 1: Payload Safety & Redaction", () => {
  test("redacts Anthropic API keys", () => {
    const antKey = "sk-" + "ant-" + "api03-" + "secretkey12345678901234567890";
    const raw = "Authorization: Bearer " + antKey;
    const redacted = redactAnthropicSecrets(raw);
    expect(redacted).not.toContain("sk-" + "ant-api03");
  });

  test("redacts Claude session cookies and tokens", () => {
    const sidKey = "sk-" + "ant-" + "sid01-" + "sessiontoken12345678901234567890";
    const raw = "Cookie: sessionKey=" + sidKey;
    const redacted = redactAnthropicSecrets(raw);
    expect(redacted).not.toContain("sk-" + "ant-sid01");
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
          criteria: { leaked: antKey, clean: "No secret" },
        },
      },
    };

    const safe = preparePayloadSafe(payload);
    const jsonStr = JSON.stringify(safe);
    expect(jsonStr).not.toContain("sk-" + "ant-api03");
    expect(jsonStr).not.toContain(awsKey);
  });

  test("rejects oversized evidence rather than silently truncating its meaning", () => {
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

    expect(() => preparePayloadSafe(payload)).toThrow("payload too large");
  });

  test("prioritizes retention of test failures and error traces during truncation", () => {
    const testFailureTrace = "FAIL src/auth.test.ts > AuthService > rejects expired tokens\nAssertionError: expected 401 to equal 200\n    at auth.test.ts:42:15";
    const hugeDiff = "+ unimportant diff line here\n".repeat(2500);
    const combinedState = `Summary: run finished.\n${hugeDiff}\n${testFailureTrace}`;

    const truncated = truncatePayloadState(combinedState, 15000);
    expect(Buffer.byteLength(truncated, "utf8")).toBeLessThanOrEqual(15000);
    expect(truncated).toContain("FAIL src/auth.test.ts");
    expect(truncated).toContain("AssertionError: expected 401 to equal 200");
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

  test("applies the same 32-KiB ceiling even when a caller requests a larger budget", () => {
    const payload: TypeSafePayload = {
      state: "public evidence ".repeat(4000),
      questions: { result: { type: "noul", instructions: "Assess the complete evidence" } },
    };
    expect(() => preparePayloadSafe(payload, { maxBytes: 65536 })).toThrow();
  });

  test("preserves complete instructions, criteria, question IDs and safe multibyte state", () => {
    const payload: TypeSafePayload = {
      state: 'Public 漢字 with quotes " and slashes \\\\',
      questions: {
        risk_dimension: { type: "score", instructions: "Retain the entire rubric", criteria: ["Low", "Medium", "High"] },
        public_choice: { type: "choice", instructions: "Choose a category", criteria: { good: "Complete", bad: "Incomplete" } },
      },
    };
    const safe = preparePayloadSafe(payload);
    expect(safe.state).toBe(payload.state);
    expect(safe.questions).toEqual(payload.questions);
  });
});
