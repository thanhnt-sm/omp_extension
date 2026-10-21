import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { watch } from "node:fs";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TaskContract } from "../src/types/verification";
import { canonicalDigest } from "../src/task-contract";
import { captureWorkspaceSnapshot, collectTaskEvidence } from "../src/evidence-collector";
import { collectVerificationReceipt, issueAuthorizedMutationReceipt, validateAuthorizedMutation, validateVerificationReceipt, type ApprovedVerificationCommand, type VerificationReceiptOptions } from "../src/verification-receipt";

async function fixture(run: (options: VerificationReceiptOptions) => Promise<void>): Promise<void> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-receipt-"));
  try {
    const git = (args: string[]) => execFileSync("git", args, { cwd, stdio: "ignore" });
    git(["init"]); git(["config", "user.name", "Test"]); git(["config", "user.email", "test@example.com"]);
    await fs.writeFile(path.join(cwd, "source.json"), '{"answer":42}\n');
    await fs.writeFile(path.join(cwd, "check.cjs"), "const assert=require('node:assert/strict');const fs=require('node:fs');assert.equal(JSON.parse(fs.readFileSync('source.json','utf8')).answer,42);console.log('verified actual source');");
    git(["add", "."]); git(["commit", "-qm", "fixture"]);
    const user = { sessionId: "session", entryId: "user", digest: "request", kind: "user_request" as const };
    const source = { path: "plan.md", digest: "plan", startLine: 10, endLine: 12, text: "Verify the actual answer using the approved assertion script." };
    const contract: TaskContract = {
      schemaVersion: 1, contractId: "contract", revision: 1, revisionId: "revision", incarnationId: "incarnation",
      creation: { sessionId: "session", branchId: "branch", entryId: "native-result", callId: "native-call" },
      target: { phase: "Verify", phaseOrdinal: 0, content: "Verify answer", ordinal: 0 }, taskKind: "implementation",
      allowedMutationScope: { paths: ["source.json", "check.cjs", "artifact.json", "extra.txt"], operations: ["read", "create", "modify", "delete", "execute"] },
      approvedSource: { kind: "plan", path: "plan.md", digest: source.digest, approval: user, spans: [source] },
      originalUserRequest: user, amendments: [], criteria: [{ id: "answer", kind: "acceptance", text: source.text, source }],
      approvedCommandIds: ["assert-answer"], parentRequirements: [], policyDigest: "policy",
    };
    const command: ApprovedVerificationCommand = { id: "assert-answer", command: `"${process.execPath}" check.cjs`, cwd, criterionIds: ["answer"], testAssetPaths: ["check.cjs"] };
    await run({ cwd, contract, commandId: command.id, commands: new Map([[command.id, command]]), host: { sessionId: "session", branchId: "branch", entryId: "evidence-entry", callId: "evidence-call" } });
  } finally { await fs.rm(cwd, { recursive: true, force: true }); }
}

describe("Host-bound verification receipts", () => {
  test("the actual command and assets are frozen before asynchronous registry changes", async () => fixture(async (options) => {
    const definition = options.commands.get(options.commandId)!;
    const actualCommand = definition.command;
    const pending = collectVerificationReceipt(options);
    definition.command = "echo substituted registry command";
    definition.testAssetPaths = ["foreign-missing.cjs"];
    const receipt = await pending;
    expect(receipt.command).toBe(actualCommand);
    expect(receipt.testAssetsBefore[0].path).toBe("check.cjs");
    expect(receipt.result.output).toContain("verified actual source");
    expect(receipt.reasons).toEqual([]);
  }));

  test("Git-ignored approved test assets are guarded and revalidated independently of the source tree hash", async () => fixture(async (options) => {
    await fs.writeFile(path.join(options.cwd, ".gitignore"), "ignored-check.cjs\n");
    await fs.copyFile(path.join(options.cwd, "check.cjs"), path.join(options.cwd, "ignored-check.cjs"));
    const definition = options.commands.get(options.commandId)!;
    const commands = new Map([[definition.id, { ...definition, command: `"${process.execPath}" ignored-check.cjs`, testAssetPaths: ["ignored-check.cjs"] }]]);
    const receipt = await collectVerificationReceipt({ ...options, commands });
    const current = await captureWorkspaceSnapshot(options.cwd, { contract: options.contract, nonGitPaths: receipt.workspacePaths });
    expect(validateVerificationReceipt(receipt, options.contract, current).ok).toBe(true);
    await fs.appendFile(path.join(options.cwd, "ignored-check.cjs"), "\n// changed after source collection\n");
    const stale = validateVerificationReceipt(receipt, options.contract, current);
    expect(stale.ok).toBe(false);
    expect(stale.reasons).toContain("STALE_VERIFICATION_ASSET");
  }));

  test("actual approved execution records command, output, assets and stable pre/post tree identities", async () => fixture(async (options) => {
    const baseline = await captureWorkspaceSnapshot(options.cwd, { contract: options.contract });
    const receipt = await collectVerificationReceipt(options);
    const current = await captureWorkspaceSnapshot(options.cwd, { contract: options.contract });
    expect(receipt.result.exitCode).toBe(0);
    expect(receipt.result.output).toContain("verified actual source");
    expect(receipt.command).toContain("check.cjs");
    expect(receipt.cwd).toBe(options.cwd);
    expect(receipt.testAssetsBefore[0].sha256).toBe(receipt.testAssetsAfter[0].sha256);
    expect(receipt.testAssetsBefore[0].identity.ino).toBeTruthy();
    expect(receipt.preSnapshotId).not.toBe(receipt.postSnapshotId);
    expect(receipt.postTreeDigest).toBe(receipt.stableTreeDigest);
    expect(receipt.contractDigest).toBe(canonicalDigest(options.contract));
    expect(validateVerificationReceipt(receipt, options.contract, current)).toEqual({ ok: true, reasons: [] });
    const evidence = await collectTaskEvidence({ cwd: options.cwd, contract: options.contract, baseline, verificationReceipt: receipt, testCommand: "echo invented native command" });
    expect(evidence.evidenceStatus).toBe("READY");
    expect(evidence.testOutput).toContain("verified actual source");
    const clone = JSON.parse(JSON.stringify(receipt));
    expect(validateVerificationReceipt(clone, options.contract, current).reasons).toContain("HOST_VERIFICATION_RECEIPT_REQUIRED");
  }));

  test("failed, timed-out and aborted real executions cannot authorize completion", async () => fixture(async (options) => {
    await fs.writeFile(path.join(options.cwd, "check.cjs"), "process.exit(3);");
    const failed = await collectVerificationReceipt(options);
    expect(failed.result.exitCode).toBe(3);
    expect(failed.reasons).toContain("VERIFICATION_COMMAND_FAILED");
    // This OS integration deliberately exercises the executor's real process timeout/kill boundary.
    await fs.writeFile(path.join(options.cwd, "check.cjs"), "setTimeout(()=>{},10000);");
    const timedOut = await collectVerificationReceipt({ ...options, timeoutMs: 30 });
    expect(timedOut.result.timedOut).toBe(true);
    expect(timedOut.reasons).toContain("VERIFICATION_COMMAND_FAILED");
    const controller = new AbortController();
    await fs.writeFile(path.join(options.cwd, "check.cjs"), "require('node:fs').writeFileSync('command-started','ready');setTimeout(()=>{},10000);");
    const watcher = watch(options.cwd, (_event, filename) => { if (filename?.toString() === "command-started") controller.abort(); });
    try {
      const aborted = await collectVerificationReceipt({ ...options, signal: controller.signal });
      expect(aborted.result.aborted).toBe(true);
      expect(aborted.reasons).toContain("VERIFICATION_COMMAND_FAILED");
    } finally { watcher.close(); }
  }));

  test("changed test assets, foreign incarnation, byte-identical file replacement and new files are stale", async () => fixture(async (options) => {
    const receipt = await collectVerificationReceipt(options);
    const current = await captureWorkspaceSnapshot(options.cwd, { contract: options.contract });
    expect(validateVerificationReceipt(receipt, { ...options.contract, incarnationId: "other" }, current).ok).toBe(false);
    const original = await fs.readFile(path.join(options.cwd, "source.json"));
    await fs.rename(path.join(options.cwd, "source.json"), path.join(options.cwd, "old.json"));
    await fs.writeFile(path.join(options.cwd, "source.json"), original);
    await fs.unlink(path.join(options.cwd, "old.json"));
    const sameBytesNewIdentity = await captureWorkspaceSnapshot(options.cwd, { contract: options.contract });
    expect(sameBytesNewIdentity.files.get("source.json")).toBe(current.files.get("source.json"));
    expect(validateVerificationReceipt(receipt, options.contract, sameBytesNewIdentity).reasons).toContain("STALE_VERIFICATION_RECEIPT");
    await fs.writeFile(path.join(options.cwd, "extra.txt"), "created while judge pending");
    expect(validateVerificationReceipt(receipt, options.contract, await captureWorkspaceSnapshot(options.cwd, { contract: options.contract })).ok).toBe(false);
    await fs.appendFile(path.join(options.cwd, "check.cjs"), "\n// changed test asset\n");
    expect(validateVerificationReceipt(receipt, options.contract, await captureWorkspaceSnapshot(options.cwd, { contract: options.contract })).ok).toBe(false);
  }));

  test("a passing command mutating an unrelated tracked source cannot prove the resulting tree", async () => fixture(async (options) => {
    await fs.appendFile(path.join(options.cwd, "check.cjs"), "\nfs.writeFileSync('source.json','{\"answer\":99}');");
    const receipt = await collectVerificationReceipt(options);
    expect(receipt.result.exitCode).toBe(0);
    expect(receipt.reasons).toContain("SOURCE_CHANGED_DURING_VERIFICATION");
    expect(validateVerificationReceipt(receipt, options.contract, await captureWorkspaceSnapshot(options.cwd, { contract: options.contract })).ok).toBe(false);
  }));

  test("a passing command cannot change the staged tree while leaving evaluated source bytes and identities untouched", async () => fixture(async (options) => {
    await fs.appendFile(path.join(options.cwd, "check.cjs"), "\nrequire('node:child_process').execFileSync('git',['update-index','--chmod=+x','source.json']);");
    const before = await captureWorkspaceSnapshot(options.cwd, { contract: options.contract });
    const receipt = await collectVerificationReceipt(options);
    const after = await captureWorkspaceSnapshot(options.cwd, { contract: options.contract });
    expect(receipt.result.exitCode).toBe(0);
    expect(after.files.get("source.json")).toBe(before.files.get("source.json"));
    expect(after.fileIdentities?.["source.json"]).toEqual(before.fileIdentities?.["source.json"]);
    expect(after.indexDigest).not.toBe(before.indexDigest);
    expect(receipt.reasons).toContain("SOURCE_CHANGED_DURING_VERIFICATION");
    expect(validateVerificationReceipt(receipt, options.contract, after).ok).toBe(false);
  }), 30000);

  test("approved output artifacts have guarded digests without excusing changes to test assets", async () => fixture(async (options) => {
    await fs.appendFile(path.join(options.cwd, "check.cjs"), "\nfs.writeFileSync('artifact.json',JSON.stringify({checked:true}));");
    const definition = options.commands.get(options.commandId)!;
    const commands = new Map([[definition.id, { ...definition, artifactPaths: ["artifact.json"] }]]);
    const receipt = await collectVerificationReceipt({ ...options, commands });
    expect(receipt.artifacts[0].path).toBe("artifact.json");
    expect(receipt.artifacts[0].sha256).toHaveLength(64);
    expect(receipt.reasons).toEqual([]);
    expect(validateVerificationReceipt(receipt, options.contract, await captureWorkspaceSnapshot(options.cwd, { contract: options.contract })).ok).toBe(true);
  }));

  test("unapproved IDs, foreign cwd and echo-only commands fail before process execution", async () => fixture(async (options) => {
    await expect(collectVerificationReceipt({ ...options, commandId: "invented" })).rejects.toThrow("COMMAND_NOT_APPROVED");
    const definition = options.commands.get(options.commandId)!;
    await expect(collectVerificationReceipt({ ...options, cwd: os.tmpdir() })).rejects.toThrow("COMMAND_NOT_VERIFICATION");
    await expect(collectVerificationReceipt({ ...options, commands: new Map([[definition.id, { ...definition, command: "echo tests passed" }]]) })).rejects.toThrow("COMMAND_NOT_VERIFICATION");
    expect(await fs.readdir(options.cwd)).not.toContain("artifact.json");
  }));

  test("separate remediation requires actual authority callback and stays bound to review tree/path/operation", async () => fixture(async (options) => {
    const review: TaskContract = { ...options.contract, taskKind: "review", approvedCommandIds: [], allowedMutationScope: { paths: ["source.json"], operations: ["read"] } };
    const remediation: TaskContract = { ...options.contract, contractId: "separate-remediation", incarnationId: "separate-incarnation" };
    const baseline = await captureWorkspaceSnapshot(options.cwd, { contract: review });
    await fs.writeFile(path.join(options.cwd, "source.json"), '{"answer":43}');
    const snapshot = await captureWorkspaceSnapshot(options.cwd, { contract: review });
    const parameters = { reviewContract: review, remediationContract: remediation, approval: options.contract.originalUserRequest, host: options.host, snapshot, mutations: [{ path: "source.json", operation: "modify" as const }] };
    expect(() => issueAuthorizedMutationReceipt({ ...parameters, validateAuthority: () => false })).toThrow("REMEDIATION_AUTHORITY_REQUIRED");
    const receipt = issueAuthorizedMutationReceipt({ ...parameters, validateAuthority: ({ approval }) => approval.entryId === "user" });
    expect(validateAuthorizedMutation(receipt, review, snapshot, { path: "source.json", operation: "modify" })).toBe(true);
    expect(validateAuthorizedMutation(receipt, review, snapshot, { path: "source.json", operation: "delete" })).toBe(false);
    const unattributed = await collectTaskEvidence({ cwd: options.cwd, contract: review, baseline });
    expect(unattributed.evidenceStatus).toBe("EVIDENCE_REQUIRED");
    const authorized = await collectTaskEvidence({ cwd: options.cwd, contract: review, baseline, authorizedMutationReceipts: [receipt] });
    expect(authorized.evidenceStatus).toBe("READY");
    expect(authorized.contract?.taskKind).toBe("review");
    expect(authorized.counterevidence).toContain("SEPARATELY_AUTHORIZED_REMEDIATION:source.json");
    expect(validateAuthorizedMutation(JSON.parse(JSON.stringify(receipt)), review, snapshot, { path: "source.json", operation: "modify" })).toBe(false);
  }));
});
