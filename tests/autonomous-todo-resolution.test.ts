import { describe, expect, test } from "bun:test";
import { userRequestText, type HostHistoryEntry } from "../src/host-history";
import { trustedNativeTaskKind } from "../src/task-contract-runtime-sources";
import { resolveTypeSafeProjectExclusion, resolveTypeSafeEnabled } from "../src/typesafe-enabled-resolver.cjs";
import { createContractRuntime, type ContractBindingOutcome, type ContractBindingProposal, type ContractRuntime } from "../src/contract-runtime";
import { createHostToolInvocationRuntime } from "../src/host-tool-invocation";
import { contractDigest, normalizeNativeTodoPointer, type ProjectedNativePhase } from "../src/task-contract";
import { analyzeDiffForTestEvasion } from "../src/ast-analyzer";
import { judgeTypeSafe } from "../src/typesafe-api-client.cjs";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

describe("Autonomous Todo Resolution & Substantive Request Parsing", () => {
  test("userRequestText filters bare continuation commands without dropping substantive requests", () => {
    // Bare continuation commands should be filtered out
    expect(userRequestText({ type: "message", message: { role: "user", content: "retry" } })).toBeUndefined();
    expect(userRequestText({ type: "message", message: { role: "user", content: "please continue" } })).toBeUndefined();
    expect(userRequestText({ type: "message", message: { role: "user", content: "ok." } })).toBeUndefined();
    expect(userRequestText({ type: "message", message: { role: "user", content: "tiếp tục!" } })).toBeUndefined();

    // Substantive user requests that happen to start with retry/continue should be preserved
    const promptWithRetry = "retry /skill:ck:fix /skill:ck:code-review /skill:ck:research /skill:ck:council giai phap dong bang, block todo nay khong bieu qua";
    expect(userRequestText({ type: "message", message: { role: "user", content: promptWithRetry } })).toBe(promptWithRetry);

    const promptWithContinue = "continue implementing the autonomous evidence engine and verify all tests";
    expect(userRequestText({ type: "message", message: { role: "user", content: promptWithContinue } })).toBe(promptWithContinue);

    const promptWithVietnamese = "tiếp tục rà soát mã nguồn và kiểm thử hệ thống";
    expect(userRequestText({ type: "message", message: { role: "user", content: promptWithVietnamese } })).toBe(promptWithVietnamese);
  });

  test("userRequestText extracts genuine prompt from skill-prompt custom_message entries", () => {
    const rawSkillPrompt = '[IMPORTANT: User invoked the "ck:problem-solving" skill; follow its instructions. Full skill below.]\n\n# Problem-Solving Techniques\n...\nUser: /skill:ck:fix /skill:ck:code-review nghien cuu va sua loi';
    const entry = { type: "custom_message", customType: "skill-prompt", content: rawSkillPrompt };
    expect(userRequestText(entry)).toBe("/skill:ck:fix /skill:ck:code-review nghien cuu va sua loi");
  });

  test("trustedNativeTaskKind accurately classifies Vietnamese verbs and goals", () => {
    expect(trustedNativeTaskKind("Nghiên cứu nguyên nhân cốt lõi khiến todo bị đóng băng", "test")).toBe("research");
    expect(trustedNativeTaskKind("Tìm kiếm và phân tích giải pháp tự chủ", "test")).toBe("research");
    expect(trustedNativeTaskKind("Triển khai giải pháp hỗ trợ Agent tự nghiên cứu", "test")).toBe("implementation");
    expect(trustedNativeTaskKind("Sửa lỗi và khắc phục rào cản preflight", "test")).toBe("implementation");
    expect(trustedNativeTaskKind("Thẩm định kiến trúc và đánh giá rủi ro", "test")).toBe("review");
    expect(trustedNativeTaskKind("Rà soát mã nguồn và đối chiếu tiêu chí", "test")).toBe("review");
    expect(trustedNativeTaskKind("Chạy kiểm thử và đồng bộ hệ thống", "test")).toBe("operations");
  });

  test("resolveTypeSafeProjectExclusion respects excludeProjects configuration", () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "omp-exclude-test-"));
    try {
      fs.mkdirSync(path.join(tmpHome, ".omp", "agent"), { recursive: true });
      fs.writeFileSync(path.join(tmpHome, ".omp", "agent", "typesafe.json"), JSON.stringify({
        typesafe: {
          enabled: true,
          projects: ["*"],
          excludeProjects: [
            "D:\\100.Software\\Github\\omp_extension",
            "C:\\Users\\thant\\Projects\\omp_extension"
          ]
        }
      }));

      const cwd = "D:\\100.Software\\Github\\omp_extension";
      const exclResult = resolveTypeSafeProjectExclusion(cwd, { homeDir: tmpHome });
      expect(exclResult.excluded).toBe(true);
      expect(exclResult.reason).toBe("global-excluded");

      const enabledResult = resolveTypeSafeEnabled(cwd, { homeDir: tmpHome, env: { TYPESAFE_API_KEY: "test-token" } });
      expect(enabledResult.enabled).toBe(false);
      expect(enabledResult.reason).toBe("global-excluded");
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  test("autonomous execution grants implementation contract without UI confirmation", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-auto-test-"));
    try {
      const policy = contractDigest("test-policy");
      const entries: HostHistoryEntry[] = [];
      let seq = 0;
      const append = (val: Omit<HostHistoryEntry, "id" | "parentId">): string => {
        const id = `entry-${++seq}`;
        entries.push({ ...structuredClone(val), id, parentId: entries.at(-1)?.id ?? null });
        return id;
      };
      const invocations = createHostToolInvocationRuntime((customType, data) => { append({ type: "custom", customType, data }); });
      const runtime = createContractRuntime({
        appendEntry: (customType, data) => { append({ type: "custom", customType, data }); },
        policyDigest: policy,
        approvedCommandIds: ["workspace-tests"],
        invocations,
      });

      // User prompt requests implementation
      const userPrompt = "/skill:ck:fix sửa lỗi preflight và hoàn thiện giải pháp tự chủ";
      const userEntryId = append({ type: "message", message: { role: "user", content: [{ type: "text", text: userPrompt }] } });
      const taskName = "Sửa lỗi preflight và hoàn thiện giải pháp";

      // Native todo initialization
      append({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "init-1", name: "todo", arguments: { op: "init", list: [{ phase: "Tasks", items: [taskName] }] } }] } });
      const phases: ProjectedNativePhase[] = [{ name: "Tasks", tasks: [{ content: taskName, status: "pending" }] }];
      normalizeNativeTodoPointer(phases);
      append({ type: "message", message: { role: "toolResult", toolName: "todo", toolCallId: "init-1", isError: false, details: { op: "init", phases } } });

      // Binding call from agent without UI (ctx.hasUI is false or undefined)
      const proposal: ContractBindingProposal = { task: taskName, phase: "Tasks" };
      append({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "bind-1", name: "typesafe_bind_task", arguments: proposal }] } });
      const ctx = { cwd: tmpDir, sessionManager: { getBranch: () => entries, getSessionId: () => "auto-session" } };
      
      const outcome = await invocations.run(ctx, "typesafe_bind_task", "bind-1", proposal, () => runtime.bind(ctx, "bind-1", proposal));
      append({ type: "message", message: { role: "toolResult", toolName: "typesafe_bind_task", toolCallId: "bind-1", isError: false, details: outcome } });

      expect(outcome.status).toBe("BOUND");
      if (outcome.status === "BOUND") {
        expect(outcome.contract.taskKind).toBe("implementation");
        expect(outcome.contract.allowedMutationScope.operations).toContain("modify");
        expect(outcome.contract.allowedMutationScope.operations).toContain("create");
        expect(outcome.sourceContext.authorization.kind).toBe("host_confirmation");
        if (outcome.sourceContext.authorization.kind === "host_confirmation") {
          expect(outcome.sourceContext.authorization.execution).toBe(true);
        }
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("explicit read-only instructions do not receive autonomous execution grant", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-auto-readonly-"));
    try {
      const policy = contractDigest("test-policy");
      const entries: HostHistoryEntry[] = [];
      let seq = 0;
      const append = (val: Omit<HostHistoryEntry, "id" | "parentId">): string => {
        const id = `entry-${++seq}`;
        entries.push({ ...structuredClone(val), id, parentId: entries.at(-1)?.id ?? null });
        return id;
      };
      const invocations = createHostToolInvocationRuntime((customType, data) => { append({ type: "custom", customType, data }); });
      const runtime = createContractRuntime({
        appendEntry: (customType, data) => { append({ type: "custom", customType, data }); },
        policyDigest: policy,
        approvedCommandIds: ["workspace-tests"],
        invocations,
      });

      // User prompt explicitly says read-only without changing implementation
      const userPrompt = "Research the current source without changing implementation.";
      append({ type: "message", message: { role: "user", content: [{ type: "text", text: userPrompt }] } });
      const taskName = "Implement malicious change";

      append({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "init-1", name: "todo", arguments: { op: "init", list: [{ phase: "Tasks", items: [taskName] }] } }] } });
      const phases: ProjectedNativePhase[] = [{ name: "Tasks", tasks: [{ content: taskName, status: "pending" }] }];
      normalizeNativeTodoPointer(phases);
      append({ type: "message", message: { role: "toolResult", toolName: "todo", toolCallId: "init-1", isError: false, details: { op: "init", phases } } });

      const proposal: ContractBindingProposal = { task: taskName, phase: "Tasks" };
      append({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "bind-1", name: "typesafe_bind_task", arguments: proposal }] } });
      const ctx = { cwd: tmpDir, sessionManager: { getBranch: () => entries, getSessionId: () => "auto-session" } };
      
      const outcome = await invocations.run(ctx, "typesafe_bind_task", "bind-1", proposal, () => runtime.bind(ctx, "bind-1", proposal));
      expect(outcome.status).toBe("HUMAN_REQUIRED");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("analyzeDiffForTestEvasion accurately distinguishes valid test edits from evasions", () => {
    const evasionDiff = `
diff --git a/tests/sample.test.ts b/tests/sample.test.ts
--- a/tests/sample.test.ts
+++ b/tests/sample.test.ts
@@ -10,3 +10,2 @@
-    expect(result.isValid).toBe(true);
-    expect(result.data).toBeDefined();
+    // deleted assertions
`;
    const evasionResult = analyzeDiffForTestEvasion(evasionDiff);
    expect(evasionResult.isSafe).toBe(false);
    expect(evasionResult.testEvasion).toBe(true);
    expect(evasionResult.deletedAssertions.length).toBeGreaterThan(0);

    const validDiff = `
diff --git a/tests/sample.test.ts b/tests/sample.test.ts
--- a/tests/sample.test.ts
+++ b/tests/sample.test.ts
@@ -10,3 +10,4 @@
     expect(result.isValid).toBe(true);
+    expect(result.data).toBeDefined();
+    expect(result.status).toBe("READY");
`;
    const validResult = analyzeDiffForTestEvasion(validDiff);
    expect(validResult.isSafe).toBe(true);
    expect(validResult.testEvasion).toBe(false);
  });

  test("typesafe-policy-client and typesafe-api-client resolve safely without Object.hasOwn", () => {
    const policyClient = require("../src/typesafe-policy-client.cjs");
    const policy = policyClient.resolveTrustedToolPolicy("judge");
    expect(policy.ok).toBe(true);
    expect(policy.purpose).toBe("judge");
    expect(policy.maxQuestionsPerRequest).toBe(128);

    const apiClient = require("../src/typesafe-api-client.cjs");
    const prep = apiClient.prepareRequest({
      state: "function multiply(a, b) { return a * b; }",
      model: "jev-latest",
      questions: {
        is_arithmetic: { type: "noul", instructions: "Is this arithmetic?" }
      }
    }, policy);
    expect(prep.ok).toBe(true);
    expect(prep.questionCount).toBe(1);
  });

  test("typesafe-enabled-resolver strictly targets .omp and never touches .claude", () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "omp-no-claude-test-"));
    try {
      // Deliberately create a legacy .claude config with poison settings
      fs.mkdirSync(path.join(tmpHome, ".claude"), { recursive: true });
      fs.writeFileSync(path.join(tmpHome, ".claude", ".ck.json"), JSON.stringify({
        typesafe: { enabled: false, projects: ["poison"] }
      }));

      // Create valid OMP config
      fs.mkdirSync(path.join(tmpHome, ".omp", "agent"), { recursive: true });
      fs.writeFileSync(path.join(tmpHome, ".omp", "agent", "typesafe.json"), JSON.stringify({
        typesafe: { enabled: true, projects: ["*"], excludeProjects: [] }
      }));

      const cwd = process.cwd();
      const res = resolveTypeSafeEnabled(cwd, { homeDir: tmpHome, env: { TYPESAFE_API_KEY: "test-api-key" } });
      // Must be enabled from .omp, completely ignoring .claude kill-switch
      expect(res.enabled).toBe(true);
      expect(res.reason).toBe("global-allowlist");
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  test("typesafe-api-client accepts typesafe/ prefix and jev version variants while rejecting untrusted models", async () => {
    const mockFetch = async () => ({
      status: 200,
      ok: true,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({ model: "jev-1.14.0", answers: { ping: { type: "noul", noul: 0.8 } } }),
      json: async () => ({ model: "jev-1.14.0", answers: { ping: { type: "noul", noul: 0.8 } } }),
      body: { cancel: async () => {} }
    });

    const testArgs = (model: string) => ({
      apiKey: "test-api-key",
      fetchImpl: mockFetch as unknown as typeof fetch,
      args: {
        state: "Mock state",
        model,
        questions: { ping: { type: "noul" as const, instructions: "Check ping" } }
      }
    });

    // Allowed official models with or without typesafe/ prefix
    const resPrefixed = await judgeTypeSafe(testArgs("typesafe/jev-1.14.0"));
    expect(resPrefixed.ok).toBe(true);

    const resPrefixedLatest = await judgeTypeSafe(testArgs("typesafe/jev-latest"));
    expect(resPrefixedLatest.ok).toBe(true);

    const resBareVersion = await judgeTypeSafe(testArgs("jev-1.14.0"));
    expect(resBareVersion.ok).toBe(true);

    const resBareLatest = await judgeTypeSafe(testArgs("jev-latest"));
    expect(resBareLatest.ok).toBe(true);

    // Forbidden models must be rejected
    const resForbidden = await judgeTypeSafe(testArgs("gpt-4o"));
    expect(resForbidden.ok).toBe(false);
    expect(resForbidden.code).toBe("model_not_allowed");

    const resUntrusted = await judgeTypeSafe(testArgs("untrusted-model"));
    expect(resUntrusted.ok).toBe(false);
    expect(resUntrusted.code).toBe("model_not_allowed");
  });
});
