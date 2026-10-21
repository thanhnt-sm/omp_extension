import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createContractRuntime, type ContractRuntime } from "../src/contract-runtime";
import { canonicalDigest } from "../src/task-contract";
import type { HostHistoryEntry } from "../src/host-history";
import type { TaskContract } from "../src/types/verification";
import { createTaskEvidenceRuntime, type TaskEvidenceCollectParams, type TaskEvidenceCollectionOutcome, type TaskEvidenceRuntime } from "../src/task-evidence-runtime";
import { isHostTaskEvidence } from "../src/evidence-collector";
import type { ApprovedVerificationCommand } from "../src/verification-receipt";
import { digestBytes, gitBytes } from "../src/evidence-workspace";
import { createHostToolInvocationRuntime, type HostToolInvocationRuntime } from "../src/host-tool-invocation";
interface FixtureOptions { goal?: string; execute?: boolean; git?: boolean; files?: Readonly<Record<string, string>>; diagnosticExit?: number }
interface RuntimeFixture {
  cwd: string; root: string; goal: string; entries: HostHistoryEntry[]; contracts: ContractRuntime; runtime: TaskEvidenceRuntime; contract: TaskContract;
  invocations: HostToolInvocationRuntime;
  ctx: { cwd: string; sessionManager: { getSessionId(): string; getBranch(): HostHistoryEntry[] }; hasUI: boolean; ui: { confirm(): Promise<boolean> } };
  append(value: Omit<HostHistoryEntry, "id" | "parentId">): string;
  call(name: string, params: unknown, wrapper?: boolean): string;
  collect(params: TaskEvidenceCollectParams, wrapper?: boolean): Promise<{ id: string; outcome: TaskEvidenceCollectionOutcome }>;
}
async function fixture(options: FixtureOptions, run: (fixture: RuntimeFixture) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-evidence-runtime-")); const cwd = path.join(root, "workspace");
  await fs.mkdir(cwd);
  try {
    if (options.git !== false) {
      execFileSync("git", ["init"], { cwd, stdio: "ignore" });
      execFileSync("git", ["config", "user.name", "Test"], { cwd, stdio: "ignore" });
      execFileSync("git", ["config", "user.email", "test@example.com"], { cwd, stdio: "ignore" });
      await fs.writeFile(path.join(cwd, "seed.ts"), "export const original = true;\n");
      execFileSync("git", ["add", "."], { cwd, stdio: "ignore" }); execFileSync("git", ["commit", "-qm", "fixture baseline"], { cwd, stdio: "ignore" });
    }
    const goal = options.goal ?? "Review the public API risks and publish the actual findings.";
    for (const [name, content] of Object.entries(options.files ?? {})) { await fs.mkdir(path.dirname(path.join(cwd, name)), { recursive: true }); await fs.writeFile(path.join(cwd, name), content); }
    await fs.mkdir(path.join(cwd, "plans", "reports"), { recursive: true });
    await fs.writeFile(path.join(cwd, "plans", "reports", "result.json"), JSON.stringify({ task: goal, findings: "Actual public findings with DECISIVE_FINAL_ROW." }));
    const counter = path.join(root, "executions.txt");
    await fs.writeFile(path.join(cwd, "check.cjs"), `const fs=require('node:fs');const p=${JSON.stringify(counter)};fs.writeFileSync(p,String((fs.existsSync(p)?Number(fs.readFileSync(p,'utf8')):0)+1));console.log('actual diagnostic observation');process.exit(${options.diagnosticExit ?? 0});`);
    if (options.execute) await fs.writeFile(path.join(cwd, "plans", "approved.md"), "# Approved plan\n## Approved phase\n### Requirements\n- Record actual diagnostic observations from check.cjs.\n### Success Criteria\n- Preserve the full original user purpose; do not implement unrelated findings.\n");
    const entries: HostHistoryEntry[] = []; let sequence = 0;
    const append = (value: Omit<HostHistoryEntry, "id" | "parentId">): string => { const id = `entry-${++sequence}`; entries.push({ ...value, id, parentId: entries[entries.length - 1]?.id ?? null }); return id; };
    const call = (name: string, params: unknown, wrapper = false): string => {
      const id = `call-${++sequence}`;
      append({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id, name: wrapper ? "write" : name, arguments: wrapper ? { path: `xd://${name}`, content: JSON.stringify(params) } : params }] } });
      return id;
    };
    append({ type: "message", message: { role: "user", content: [{ type: "text", text: `${goal} Preserve the original review purpose and the complete public report.` }] } });
    const init = call("todo", { op: "init", list: [{ phase: "P", items: [goal] }] });
    append({ type: "message", message: { role: "toolResult", toolName: "todo", toolCallId: init, isError: false, details: { op: "init", phases: [{ name: "P", tasks: [{ content: goal, status: "in_progress" }] }] } } });
    const ctx = { cwd, sessionManager: { getSessionId: () => "runtime-session", getBranch: () => entries }, hasUI: !!options.execute, ui: { confirm: async () => true } };
    const appendEntry = (customType: string, data: unknown): void => { append({ type: "custom", customType, data: structuredClone(data) }); };
    const invocations = createHostToolInvocationRuntime(appendEntry);
    const contracts = createContractRuntime({ appendEntry, invocations, policyDigest: canonicalDigest({ fixturePolicy: 1 }), approvedCommandIds: ["approved-check"] });
    const proposal = { task: goal, phase: "P", ...(options.execute ? { planPath: "plans/approved.md", phaseHeading: "Approved phase" } : {}) };
    const bindId = call("typesafe_bind_task", proposal);
    const bound = await invocations.run(ctx, "typesafe_bind_task", bindId, proposal, () => contracts.bind(ctx, bindId, proposal));
    expect(bound.status).toBe("BOUND"); if (bound.status !== "BOUND") throw new Error(bound.reasons.join(","));
    append({ type: "message", message: { role: "toolResult", toolName: "typesafe_bind_task", toolCallId: bindId, isError: false, content: [{ type: "text", text: "Source bound; no completion authority granted." }] } });
    const commands = (contract: TaskContract, directory: string): ReadonlyMap<string, ApprovedVerificationCommand> => new Map([["approved-check", { id: "approved-check", command: `"${process.execPath}" check.cjs`, cwd: directory, criterionIds: contract.criteria.map((criterion) => criterion.id), testAssetPaths: ["check.cjs"] }]]);
    const runtime = createTaskEvidenceRuntime({ contracts, commands, invocations });
    const collect = async (params: TaskEvidenceCollectParams, wrapper = false) => {
      const id = call("typesafe_collect_evidence", params, wrapper); const outcome = await invocations.run(ctx, "typesafe_collect_evidence", id, params, () => runtime.collect(ctx, id, params));
      append({ type: "message", message: { role: "toolResult", toolName: wrapper ? "write" : "typesafe_collect_evidence", toolCallId: id, isError: false, content: [{ type: "text", text: `Evidence collection status: ${outcome.status}. Not native approval.` }] } });
      return { id, outcome };
    };
    try { await run({ cwd, root, goal, entries, contracts, runtime, invocations, contract: bound.contract, ctx, append, call, collect }); }
    finally { runtime.clear(ctx); }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

describe("actual host task evidence runtime", () => {
  test("readonly bind and actual xd collection discover an exact-task report without literal paths or tests", async () => fixture({}, async (f) => {
    expect(f.contract.taskKind).toBe("review"); expect(f.contract.approvedCommandIds).toEqual([]);
    const { outcome } = await f.collect({ task: f.goal, phase: "P" }, true);
    expect(outcome.status).toBe("COLLECTED"); const record = outcome.record!;
    expect(isHostTaskEvidence(record.evidence)).toBe(true);
    expect(record.artifacts.map((artifact) => artifact.path)).toContain("plans/reports/result.json");
    expect(record.artifacts[0].content).toContain("DECISIVE_FINAL_ROW");
    expect(record.sourceContext.readScope).toContain("**");
    expect(record.provenance.baselineOrigin.kind).toBe("first_collection");
    expect(record.evidence.counterevidence).toContain("BASELINE_CAPTURED_AT_FIRST_COLLECTION: no earlier task preimage or commit attribution is asserted.");
    expect(record.packetSet.packets).toHaveLength(1);
    expect(record.packetSet.packets[0].packet.criteria.map((criterion) => criterion.text)).toEqual([f.goal]);
    expect(record.verificationReceipt).toBeUndefined(); expect(record.evidence.testExitCode).toBeNull();
    expect(await f.runtime.isCurrent(f.ctx, record)).toBe(true);
    const report = record.artifacts[0];
    const read = f.runtime.retrieve(f.ctx, record, { path: report.path, fullFileDigest: report.sha256, spans: [{ startLine: 1, endLine: 1 }] });
    expect(read.ok).toBe(true); if (read.ok) expect(read.source.spans?.[0].text).toContain("DECISIVE_FINAL_ROW");
    expect(f.contracts.projection(f.ctx)?.nativePhases?.[0].tasks[0].status).toBe("in_progress");
    await expect(fs.readFile(path.join(f.root, "executions.txt"))).rejects.toThrow();
  }), 30000);

  test("curation preserves the exact authenticated large-source corpus and never converts a subset into whole-task coverage", async () => {
    const large = ["export function checked() {", "  return 1;", "}", ...Array.from({ length: 1100 }, (_, index) => `// root context ${index} ${"context ".repeat(10)}`)].join("\n") + "\n";
    await fixture({ goal: "Review src/large.ts and publish plans/reports/result.json findings.", files: { "src/large.ts": large } }, async (f) => {
      const first = (await f.collect({ task: f.goal, phase: "P" })).outcome;
      expect(first.status).toBe("CURATION_REQUIRED"); const original = first.record!;
      const root = original.evidence.sourceEvidence?.find((source) => source.path === "src/large.ts")!;
      expect(root.sha256).toBe(digestBytes(large));
      const selection = { criterionIds: f.contract.criteria.map((criterion) => criterion.id), sources: [{ path: root.path, fullFileDigest: root.sha256, spans: [{ startLine: 1, endLine: 3 }] }], artifactPaths: original.artifacts.map((artifact) => artifact.path) };
      const curated = (await f.collect({ task: f.goal, phase: "P", selections: [selection] })).outcome;
      expect(curated.status).toBe("COLLECTED"); const record = curated.record!;
      expect(record.evidence).toBe(original.evidence);
      expect(record.packetSet.packets).toHaveLength(1);
      expect(record.packetSet.packets[0].packet.criteria).toEqual(f.contract.criteria);
      expect(record.packetSet.packets[0].packet.source[0].content).toBeUndefined();
      expect(record.packetSet.packets[0].packet.source[0].spans?.[0].text).toContain("return 1");
      expect(record.packetSet.manifest.globalCompletionEligible).toBe(false);
      const changed = large.replace("return 1", "return 9"); await fs.writeFile(path.join(f.cwd, root.path), changed);
      expect(await f.runtime.isCurrent(f.ctx, record)).toBe(false);
      const fresh = (await f.collect({ task: f.goal, phase: "P" })).outcome.record!;
      expect(fresh.evidence).not.toBe(record.evidence);
      expect(fresh.evidence.sourceEvidence?.find((source) => source.path === root.path)?.sha256).toBe(digestBytes(changed));
      expect(fresh.contract.taskKind).toBe("review");
      expect(fresh.evidence.counterevidence).toContain("UNATTRIBUTED_OR_UNAUTHORIZED_MUTATION:src/large.ts");
    });
  }, 30000);

  test("current diagnostic failures remain observations and curation does not re-execute approved commands", async () => fixture({ execute: true, diagnosticExit: 7, goal: "Review check.cjs diagnostic observations and publish plans/reports/result.json." }, async (f) => {
    expect(f.contract.approvedCommandIds).toEqual(["approved-check"]);
    const first = (await f.collect({ task: f.goal, phase: "P", commandId: "approved-check" })).outcome;
    expect(first.status).toBe("COLLECTED"); const original = first.record!;
    expect(original.verificationReceipt?.applicability).toBe("diagnostic");
    expect(original.verificationReceipt?.result.actualExitCode).toBe(7);
    expect(original.evidence.testExitCode).toBeNull();
    expect(original.packetSet.packets[0].packet.verification).toBeUndefined();
    expect(original.packetSet.packets[0].packet.diagnosticObservations?.[0].result.output).toContain("actual diagnostic observation");
    expect(await fs.readFile(path.join(f.root, "executions.txt"), "utf8")).toBe("1");
    const selection = { criterionIds: f.contract.criteria.map((criterion) => criterion.id), sources: [], artifactPaths: original.artifacts.map((artifact) => artifact.path) };
    const next = (await f.collect({ task: f.goal, phase: "P", commandId: "approved-check", selections: [selection] })).outcome;
    expect(next.status).toBe("COLLECTED");
    expect(next.record?.evidence).toBe(original.evidence); expect(next.record?.verificationReceipt).toBe(original.verificationReceipt);
    expect(await fs.readFile(path.join(f.root, "executions.txt"), "utf8")).toBe("1");
    expect(next.record?.sourceContext.parentSource?.criteria.length).toBeGreaterThan(0);
    expect(next.record?.contract.criteria.map((criterion) => criterion.text)).toEqual([f.goal]);
  }), 30000);

  test("pending SDK publication cannot rerun diagnostics during curation or launder an unjoined command receipt into authority", async () => fixture({ execute: true, diagnosticExit: 5, goal: "Review check.cjs and publish plans/reports/result.json observations." }, async (f) => {
    const id = "command-execute-before-sdk-persistence"; const params = { task: f.goal, phase: "P", commandId: "approved-check" };
    const first = await f.invocations.run(f.ctx, "typesafe_collect_evidence", id, params, () => f.runtime.collect(f.ctx, id, params));
    expect(first.status).toBe("COLLECTED"); const original = first.record!;
    expect(original.verificationReceipt?.result.actualExitCode).toBe(5);
    const curated = (await f.collect({ ...params, selections: [{
      criterionIds: f.contract.criteria.map((criterion) => criterion.id), sources: [],
      artifactPaths: original.artifacts.map((artifact) => artifact.path),
    }] })).outcome;
    expect(curated.status).toBe("COLLECTED"); const record = curated.record!;
    expect(record.evidence).toBe(original.evidence);
    expect(record.verificationReceipt).toBe(original.verificationReceipt);
    expect(await fs.readFile(path.join(f.root, "executions.txt"), "utf8")).toBe("1");
    expect(await f.runtime.isCurrent(f.ctx, record)).toBe(false);
    f.append({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id, name: "typesafe_collect_evidence", arguments: params }] } });
    f.append({ type: "message", message: { role: "toolResult", toolName: "typesafe_collect_evidence", toolCallId: id, isError: false, content: [{ type: "text", text: "Actual diagnostic collection, not a test pass." }] } });
    expect(await f.runtime.isCurrent(f.ctx, record)).toBe(true);
    expect(await fs.readFile(path.join(f.root, "executions.txt"), "utf8")).toBe("1");
  }), 30000);

  test("material command permission, current-call provenance, replay, branch and private cache identity are enforced", async () => fixture({}, async (f) => {
    const denied = (await f.collect({ task: f.goal, phase: "P", commandId: "approved-check" })).outcome;
    expect(denied.status).toBe("EVIDENCE_REQUIRED"); expect(denied.reasons).toContain("COMMAND_NOT_APPROVED");
    await expect(fs.readFile(path.join(f.root, "executions.txt"))).rejects.toThrow();
    expect((await f.runtime.collect(f.ctx, "not-an-actual-tool-call", { task: f.goal })).status).toBe("UNAVAILABLE");
    const before = f.entries.length; const { id, outcome } = await f.collect({ task: f.goal, phase: "P" }); const record = outcome.record!;
    expect((await f.runtime.collect(f.ctx, id, { task: f.goal, phase: "P" })).status).toBe("UNAVAILABLE");
    expect(await f.runtime.isCurrent(f.ctx, { ...record })).toBe(false);
    const tail = f.entries.splice(before);
    expect(f.runtime.get(f.ctx, { task: f.goal, phase: "P" })).toBeUndefined();
    expect(await f.runtime.isCurrent(f.ctx, record)).toBe(false);
    f.entries.push(...tail);
    expect(f.runtime.get(f.ctx, { task: f.goal, phase: "P" })).toBe(record);
    f.runtime.clear(f.ctx); expect(f.runtime.get(f.ctx, { task: f.goal, phase: "P" })).toBeUndefined();
    expect(await f.runtime.isCurrent(f.ctx, record)).toBe(false);
  }), 30000);

  test("actual registered execute can precede SDK assistant persistence and later joins only its exact call and result", async () => fixture({}, async (f) => {
    const id = "actual-execute-before-assistant-persistence"; const params = { task: f.goal, phase: "P" };
    const outcome = await f.invocations.run(f.ctx, "typesafe_collect_evidence", id, params, () => f.runtime.collect(f.ctx, id, params));
    expect(outcome.status).toBe("COLLECTED"); const record = outcome.record!;
    expect(f.entries.find((entry) => entry.id === record.provenance.entryId)?.type).toBe("custom");
    expect(f.runtime.get(f.ctx, params)).toBe(record);
    expect(await f.runtime.isCurrent(f.ctx, record)).toBe(false);
    const publishedId = f.append({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id, name: "typesafe_collect_evidence", arguments: params }] } });
    expect(await f.runtime.isCurrent(f.ctx, record)).toBe(false);
    f.append({ type: "message", message: { role: "toolResult", toolName: "typesafe_collect_evidence", toolCallId: id, isError: false, content: [{ type: "text", text: "Actual settled collection result; not completion approval." }] } });
    expect(await f.runtime.isCurrent(f.ctx, record)).toBe(true);
    const replay = await f.invocations.run(f.ctx, "typesafe_collect_evidence", id, params, () => f.runtime.collect(f.ctx, id, params));
    expect(replay.status).toBe("UNAVAILABLE");
    const published = f.entries.find((entry) => entry.id === publishedId)!;
    published.message = { role: "assistant", content: [{ type: "toolCall", id, name: "typesafe_collect_evidence", arguments: { ...params, task: "Different task" } }] };
    expect(f.runtime.get(f.ctx, params)).toBeUndefined();
    expect(await f.runtime.isCurrent(f.ctx, record)).toBe(false);
  }), 30000);

  test("mandatory 4940-byte report is whole, competing unrelated artifacts stay out of scope and overflow cannot approve", async () => fixture({}, async (f) => {
    const prefix = JSON.stringify({ task: f.goal, proof: "" }).slice(0, -2); const suffix = 'DECISIVE_TAIL"}';
    const report = prefix + "a".repeat(4940 - Buffer.byteLength(prefix + suffix)) + suffix;
    await fs.writeFile(path.join(f.cwd, "plans", "reports", "result.json"), report);
    await fs.writeFile(path.join(f.cwd, "plans", "reports", "competitor.json"), JSON.stringify({ task: "Another review task", report: "x".repeat(8000) }));
    const first = (await f.collect({ task: f.goal, phase: "P" })).outcome;
    expect(first.status).toBe("COLLECTED");
    expect(first.record?.artifacts).toHaveLength(1); expect(first.record?.artifacts[0].content).toBe(report);
    expect(first.record?.sourceManifest.artifactSelection?.outOfPacketScope).toContain("plans/reports/competitor.json");
    const overflow = report.slice(0, -suffix.length) + "é" + suffix;
    await fs.writeFile(path.join(f.cwd, "plans", "reports", "result.json"), overflow);
    const second = (await f.collect({ task: f.goal, phase: "P" })).outcome;
    expect(second.status).toBe("EVIDENCE_REQUIRED"); expect(second.reasons).toContain("insufficient_deliverable_evidence");
    expect(second.record?.packetSet.ok).toBe(false);
  }), 30000);

  test("genuine non-Git collection accepts guarded explicitly proposed report bytes under the frozen read scope", async () => fixture({ git: false }, async (f) => {
    const result = (await f.collect({ task: f.goal, phase: "P", artifactPaths: ["plans/reports/result.json"] })).outcome;
    expect(result.status).toBe("COLLECTED"); expect(result.record?.snapshot.mode).toBe("non-git");
    expect(result.record?.evidence.cleanWorkingTree).toBe(false); expect(result.record?.evidence.testExitCode).toBeNull();
    expect(result.record?.artifacts[0].content).toContain("DECISIVE_FINAL_ROW");
  }), 30000);

  test("read scope permits genuine uncached source proposals and same-byte file replacement invalidates the accepted tree", async () => fixture({}, async (f) => {
    const initial = (await f.collect({ task: f.goal, phase: "P" })).outcome.record!;
    const reference = initial.authorizedSources.find((source) => source.path === "seed.ts")!;
    expect(reference.cached).toBe(false);
    expect(f.contract.allowedMutationScope.operations).toEqual(["read"]);
    expect(f.runtime.retrieve(f.ctx, initial, { path: reference.path, fullFileDigest: reference.sha256 }).ok).toBe(false);
    const curated = (await f.collect({ task: f.goal, phase: "P", selections: [{
      criterionIds: f.contract.criteria.map((criterion) => criterion.id),
      sources: [{ path: reference.path, fullFileDigest: reference.sha256, spans: [{ startLine: 1, endLine: 1 }] }],
      artifactPaths: initial.artifacts.map((artifact) => artifact.path),
    }] })).outcome;
    expect(curated.status).toBe("COLLECTED"); const record = curated.record!;
    expect(isHostTaskEvidence(record.evidence)).toBe(true);
    expect(record.packetSet.packets[0].packet.source[0].spans?.[0].text).toBe("export const original = true;\n");
    const sameBytes = await fs.readFile(path.join(f.cwd, "seed.ts"));
    const moved = path.join(f.cwd, "seed-replaced.ts"); await fs.rename(path.join(f.cwd, "seed.ts"), moved);
    await fs.writeFile(path.join(f.cwd, "seed.ts"), sameBytes); await fs.unlink(moved);
    expect(digestBytes(await fs.readFile(path.join(f.cwd, "seed.ts")))).toBe(reference.sha256);
    expect(await f.runtime.isCurrent(f.ctx, record)).toBe(false);
  }), 30000);

  test("staged tree changes invalidate freshness even with identical source bytes and physical file identities", async () => fixture({}, async (f) => {
    const record = (await f.collect({ task: f.goal, phase: "P" })).outcome.record!;
    expect(record.snapshot.indexDigest).toMatch(/^[a-f0-9]{64}$/);
    const original = record.snapshot.files.get("seed.ts");
    execFileSync("git", ["update-index", "--chmod=+x", "seed.ts"], { cwd: f.cwd, stdio: "ignore" });
    expect(digestBytes(await fs.readFile(path.join(f.cwd, "seed.ts")))).toBe(original);
    expect(await f.runtime.isCurrent(f.ctx, record)).toBe(false);
  }), 30000);

  test("a repository-configured external diff program cannot execute through evidence Git reads", async () => fixture({}, async (f) => {
    const marker = path.join(f.root, "external-diff-ran.txt"); const script = path.join(f.root, "external-diff.cjs");
    await fs.writeFile(script, `require('node:fs').writeFileSync(${JSON.stringify(marker)},'unexpected executable side effect');console.log('fabricated diff');`);
    const command = `${JSON.stringify(process.execPath.replace(/\\/g, "/"))} ${JSON.stringify(script.replace(/\\/g, "/"))}`;
    execFileSync("git", ["config", "diff.external", command], { cwd: f.cwd, stdio: "ignore" });
    await fs.writeFile(path.join(f.cwd, "seed.ts"), "export const original = false;\n");
    const actual = gitBytes(f.cwd, ["diff", "--", "seed.ts"]).toString("utf8");
    expect(actual).toContain("+export const original = false;");
    expect(actual).not.toContain("fabricated diff");
    await expect(fs.readFile(marker)).rejects.toThrow();
  }), 30000);

  test("an actual binding capture retains commit interval and preimages instead of rebasing at first collection", async () => fixture({ goal: "Review seed.ts and publish plans/reports/result.json." }, async (f) => {
    expect(await f.runtime.captureBaseline(f.ctx, f.contract)).toBe(true);
    await fs.writeFile(path.join(f.cwd, "seed.ts"), "export const original = false;\n");
    execFileSync("git", ["add", "seed.ts"], { cwd: f.cwd, stdio: "ignore" });
    execFileSync("git", ["commit", "-qm", "actual post-binding change"], { cwd: f.cwd, stdio: "ignore" });
    expect(await f.runtime.captureBaseline(f.ctx, f.contract)).toBe(true);
    const result = (await f.collect({ task: f.goal, phase: "P" })).outcome;
    expect(result.record?.provenance.baselineOrigin.kind).toBe("binding");
    expect(result.record?.evidence.commitInterval?.commits).toHaveLength(1);
    expect(result.record?.evidence.gitDiff).toContain("-export const original = true;");
    expect(result.record?.evidence.gitDiff).toContain("+export const original = false;");
    expect(result.status).toBe("EVIDENCE_REQUIRED");
    expect(result.record?.contract.taskKind).toBe("review");
    expect(result.record?.evidence.counterevidence).toContain("UNATTRIBUTED_OR_UNAUTHORIZED_MUTATION:seed.ts");
  }), 30000);

  test("expanding a non-Git source scope cannot invent a creation preimage for an already existing unobserved file", async () => fixture({ git: false, files: { "extra.ts": "export const preexisting = true;\n" } }, async (f) => {
    const first = (await f.collect({ task: f.goal, phase: "P", artifactPaths: ["plans/reports/result.json"] })).outcome.record!;
    expect(first.snapshot.files.has("extra.ts")).toBe(false);
    const next = (await f.collect({ task: f.goal, phase: "P", selections: [{
      criterionIds: f.contract.criteria.map((criterion) => criterion.id),
      sources: [{ path: "extra.ts", fullFileDigest: digestBytes("export const preexisting = true;\n") }],
      artifactPaths: ["plans/reports/result.json"],
    }] })).outcome;
    expect(next.status).toBe("EVIDENCE_REQUIRED");
    expect(next.reasons).toContain("HISTORICAL_PREIMAGE_SCOPE_REQUIRED");
    expect(next.record?.evidence.changedFiles).not.toContain("extra.ts");
    expect(next.record?.evidence.gitDiff).toBe("");
    expect(next.record?.evidence.counterevidence).toContain("NON_GIT_PREIMAGE_OUTSIDE_CAPTURED_SCOPE:extra.ts");
  }), 30000);

  test("an ordinary-named hardlinked artifact cannot export bytes, a digest or successful proof through the real collector", async () => fixture({}, async (f) => {
    const privateText = "An ordinary confidential narrative OUTSIDE_WORKSPACE_PRIVATE_SENTINEL.";
    const outside = path.join(f.root, "ordinary-private.json"); await fs.writeFile(outside, JSON.stringify({ task: f.goal, narrative: privateText }));
    await fs.link(outside, path.join(f.cwd, "plans", "reports", "linked.json"));
    const result = (await f.collect({ task: f.goal, phase: "P", artifactPaths: ["plans/reports/linked.json"] })).outcome;
    expect(result.status).toBe("EVIDENCE_REQUIRED"); expect(result.reasons).toContain("UNSAFE_ARTIFACT_FILE");
    expect(JSON.stringify(result)).not.toContain(privateText);
    expect(result.record?.artifacts.some((artifact) => artifact.path === "plans/reports/linked.json")).toBe(false);
    expect(result.record?.authorizedSources.some((source) => source.path === "plans/reports/linked.json")).toBe(false);
    expect(result.record?.sourceManifest.source.some((source) => source.path === "plans/reports/linked.json")).toBe(false);
  }), 30000);

  test("private and traversal proposals never return raw bytes or become persistent empty-proof records", async () => fixture({}, async (f) => {
    await fs.writeFile(path.join(f.cwd, ".env"), "ordinary private prose NOT_PUBLIC_EVIDENCE");
    const privateResult = (await f.collect({ task: f.goal, phase: "P", artifactPaths: [".env"] })).outcome;
    expect(privateResult.status).toBe("EVIDENCE_REQUIRED"); expect(JSON.stringify(privateResult)).not.toContain("NOT_PUBLIC_EVIDENCE");
    const traversal = (await f.collect({ task: f.goal, phase: "P", artifactPaths: ["../outside.txt"] })).outcome;
    expect(traversal.status).toBe("EVIDENCE_REQUIRED"); expect(f.runtime.get(f.ctx, { task: f.goal, phase: "P" })).toBeUndefined();
    const proper = (await f.collect({ task: f.goal, phase: "P", artifactPaths: ["plans/reports/result.json"], selections: [{ criterionIds: f.contract.criteria.map((criterion) => criterion.id), sources: [], artifactPaths: ["plans/reports/result.json"] }] })).outcome;
    expect(proper.status).toBe("COLLECTED");
    expect(proper.record?.authorizedSources.some((source) => source.path === ".env")).toBe(false);
  }), 30000);
});
