import { describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import {
  assertPathIsClaudeSafe,
  collectTaskEvidence,
  extractCriteriaFromPlan,
  sanitizeEnvironment,
  SecurityViolationError,
} from "../src/evidence-collector";

describe("Phase 1: Deterministic Evidence Collector & Claude Isolation", () => {
  test("assertPathIsClaudeSafe throws SecurityViolationError for ~/.claude paths", () => {
    const claudeDir = path.join(os.homedir(), ".claude", "settings.json");
    expect(() => assertPathIsClaudeSafe(claudeDir)).toThrow(SecurityViolationError);

    const dotClaude = path.resolve("./.claude/hooks/lib/something.cjs");
    expect(() => assertPathIsClaudeSafe(dotClaude)).toThrow(SecurityViolationError);

    const claudeJson = path.join(os.homedir(), ".claude.json");
    expect(() => assertPathIsClaudeSafe(claudeJson)).toThrow(SecurityViolationError);
  });

  test("assertPathIsClaudeSafe permits regular project paths", () => {
    const normalPath = path.resolve("./src/evidence-collector.ts");
    expect(() => assertPathIsClaudeSafe(normalPath)).not.toThrow();
  });

  test("sanitizeEnvironment strips all ANTHROPIC_ and CLAUDE_ environment variables", () => {
    const dirtyEnv = {
      PATH: "/usr/bin",
      NODE_ENV: "test",
      ANTHROPIC_API_KEY: "sk-ant-test-key",
      CLAUDE_CODE_TOKEN: "claude-token-val",
      ANTHROPIC_BASE_URL: "https://api.anthropic.com",
      TYPESAFE_API_KEY: "valid-typesafe-key",
    };

    const cleanEnv = sanitizeEnvironment(dirtyEnv);
    expect(cleanEnv.PATH).toBe("/usr/bin");
    expect(cleanEnv.TYPESAFE_API_KEY).toBe("valid-typesafe-key");
    expect(cleanEnv.ANTHROPIC_API_KEY).toBeUndefined();
    expect(cleanEnv.CLAUDE_CODE_TOKEN).toBeUndefined();
    expect(cleanEnv.ANTHROPIC_BASE_URL).toBeUndefined();
  });

  test("extractCriteriaFromPlan parses task and acceptance criteria from markdown", () => {
    const samplePlan = `
# Implementation Plan

## Acceptance & Definition of Done
- [ ] All 4 phase test suites pass under bun test.
- [ ] Plan creation rejects plans scoring < 2.0.
- [x] Zero occurrence of any type escapes.

### Task 1.1
- [ ] Enforce strict payload size under 32KB.
`;

    const criteria = extractCriteriaFromPlan(samplePlan);
    expect(criteria.length).toBeGreaterThanOrEqual(3);
    expect(criteria).toContain("All 4 phase test suites pass under bun test.");
    expect(criteria).toContain("Plan creation rejects plans scoring < 2.0.");
    expect(criteria).toContain("Enforce strict payload size under 32KB.");
  });

  test("collectTaskEvidence captures real Git diff and ignores untrusted agent text", async () => {
    const untrustedAgentClaim = "AGENT CLAIM: I verified all 50 tests pass and code is 100% complete.";
    const evidence = await collectTaskEvidence({
      cwd: process.cwd(),
      testCommand: "bun --version",
      untrustedAgentState: untrustedAgentClaim,
    });

    // Evidence must contain real OS data, not agent text
    expect(evidence.testExitCode).toBe(0);
    expect(evidence.testOutput).toContain("1."); // Bun version output
    expect(evidence.gitStatus).toBeDefined();
    expect(JSON.stringify(evidence)).not.toContain("AGENT CLAIM: I verified all 50 tests pass");
  });

  test("collectTaskEvidence records test failure exit code and output", async () => {
    const evidence = await collectTaskEvidence({
      cwd: process.cwd(),
      testCommand: "bun -e \"process.exit(1)\"",
    });

    expect(evidence.testExitCode).toBe(1);
  });

  test("collectTaskEvidence rejects plan path pointing inside ~/.claude", async () => {
    const dangerousPlan = path.join(os.homedir(), ".claude", "plan.md");
    expect(
      collectTaskEvidence({
        cwd: process.cwd(),
        planPath: dangerousPlan,
      })
    ).rejects.toThrow(SecurityViolationError);
  });
});
