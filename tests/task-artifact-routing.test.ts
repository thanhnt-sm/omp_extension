import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import registerExtension, { collectDeliverableArtifacts, inferTaskType } from "../typesafe-planner";
import { captureWorkspaceSnapshot, collectTaskEvidence, type WorkspaceSnapshot } from "../src/evidence-collector";
import {
  runPhaseMacroCheck,
  type ExpertJudgeClient,
  type ExpertJudgeResponse,
  type MacroCheckContext,
} from "../src/cook-expert-judge";

const ARTIFACT_BUDGET = 4940;
const TASK = "Map source callsites and verify workspace/runtime identity for the judge and todo gates.";
const TAIL_PROOF = [
  "Disk equality does not attest imported modules in loaded memory or a historical session.",
  "Preflight staging is not native commit; only a matching tool_result may commit.",
  "No captured rejection wire exists, so the packaging gap is not a proven rejection cause.",
].join("\n");

interface ProjectFixture {
  cwd: string;
  homeDir: string;
  baseline: WorkspaceSnapshot;
  write(relativePath: string, content: string): Promise<void>;
}

async function withProject(run: (fixture: ProjectFixture) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-artifact-routing-"));
  const cwd = path.join(root, "project");
  const homeDir = path.join(root, "home");
  try {
    await fs.mkdir(cwd, { recursive: true });
    await fs.mkdir(path.join(homeDir, "empty-hooks"), { recursive: true });
    await fs.mkdir(path.join(homeDir, ".omp", "agent"), { recursive: true });
    await fs.writeFile(path.join(homeDir, ".omp", "agent", "typesafe.json"), JSON.stringify({
      typesafe: { projects: ["*"], excludeProjects: [] },
    }));
    const env = {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: path.join(homeDir, "absent-gitconfig"),
      GIT_TERMINAL_PROMPT: "0",
    };
    const git = (...args: string[]) => execFileSync("git", args, { cwd, env, stdio: "ignore", windowsHide: true });
    git("init", "-q");
    git("config", "user.name", "Artifact Routing Fixture");
    git("config", "user.email", "artifact-routing@example.invalid");
    git("config", "core.autocrlf", "false");
    git("config", "core.quotePath", "false");
    git("config", "core.hooksPath", path.join(homeDir, "empty-hooks"));
    await fs.writeFile(path.join(cwd, "baseline.txt"), "Owned isolated baseline.\n");
    git("add", "baseline.txt");
    git("commit", "-qm", "fixture baseline");
    const baseline = await captureWorkspaceSnapshot(cwd);
    expect(baseline.truncated).toBe(false);
    await run({
      cwd, homeDir, baseline,
      async write(relativePath, content) {
        const destination = path.join(cwd, relativePath);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, content, "utf8");
      },
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function record(value: unknown): Record<string, unknown> {
  expect(value !== null && typeof value === "object" && !Array.isArray(value)).toBe(true);
  return value as Record<string, unknown>;
}

function unwrap(value: unknown, tag: string): string {
  expect(typeof value).toBe("string");
  const text = String(value);
  const prefix = `<${tag}>\n`;
  const suffix = `\n</${tag}>`;
  expect(text.startsWith(prefix)).toBe(true);
  expect(text.endsWith(suffix)).toBe(true);
  return text.slice(prefix.length, -suffix.length);
}

function approval(): ExpertJudgeResponse {
  return { answers: {
    deliverables_verdict: { choice: "APPROVE", confidence: 1 },
    meets_criteria: { noul: 1 },
    architectural_drift: { choice: "no_drift", confidence: 1 },
    scope_mode: { choice: "HOLD", confidence: 1 },
  } };
}

function context(overrides: Partial<MacroCheckContext> = {}): MacroCheckContext {
  return {
    todoTask: TASK,
    planRequirements: ["Preserve source graph, provenance, commit boundary and causal limitations."],
    diffSummary: "",
    unifiedDiff: "",
    testSummary: "No testCommand provided.",
    taskType: "analysis_research",
    ...overrides,
  };
}

async function evaluatePacket(ctx: MacroCheckContext) {
  const requests: Parameters<ExpertJudgeClient["evaluate"]>[0][] = [];
  const result = await runPhaseMacroCheck(ctx, {
    async evaluate(request) { requests.push(request); return approval(); },
  });
  expect(result.approved).toBe(true);
  expect(requests).toHaveLength(1);
  return { request: requests[0], state: record(JSON.parse(requests[0].state)) };
}

async function assertRubric(questions: Record<string, unknown>, research: boolean): Promise<void> {
  const desiredType = research ? "analysis_research" : "code_change";
  const oppositeType = research ? "code_change" : "analysis_research";
  const desired = await evaluatePacket(context({ taskType: desiredType }));
  const opposite = await evaluatePacket(context({ taskType: oppositeType }));
  expect(questions).toEqual(desired.request.questions);
  expect(questions).not.toEqual(opposite.request.questions);
}

function boundReport(task: string, bytes: number): string {
  const prefix = `# Source/runtime map\n\nTask: ${task}\n\nLoader -> native callback -> evidence collector -> macro -> transport.\nSource graph is static inspection, not an execution trace.\n\n`;
  const suffix = `\n\n## Provenance and causal limitations\n${TAIL_PROOF}`;
  const remaining = bytes - Buffer.byteLength(prefix + suffix, "utf8");
  const line = "Observed source edge; no loaded-memory identity or historical execution is asserted.\n";
  const body = line.repeat(Math.floor(remaining / Buffer.byteLength(line, "utf8")));
  return prefix + body + " ".repeat(remaining - Buffer.byteLength(body, "utf8")) + suffix;
}


describe("Task artifact routing and proof delivery", () => {
  const routes = [
    { name: "root report JSON", status: "?? reports/calculations.json", research: true },
    { name: "plan report JSON", status: " M plans/reports/calculations.json", research: true },
    { name: "quoted report JSON", status: '?? "plans/reports/design calculations.json"', research: true },
    { name: "Windows report separators", status: "?? plans\\reports\\calculations.json", research: true },
    { name: "report rename", status: 'R  "reports/old calculations.json" -> "plans/reports/new calculations.json"', research: true },
    { name: "source JSON", status: " M src/data.json", research: false },
    { name: "config JSON", status: " M config/runtime.json", research: false },
    { name: "package manifest", status: " M package.json", research: false },
    { name: "nested source report JSON", status: "?? src/reports/calculations.json", research: false },
    { name: "report traversal", status: " M reports/../src/data.json", research: false },
    { name: "executable inside reports", status: "?? plans/reports/check.ts", research: false },
    { name: "source renamed into reports", status: "R  src/data.json -> reports/data.json", research: false },
    { name: "report renamed into source", status: "R  reports/data.json -> src/data.json", research: false },
    { name: "mixed report and source", status: "?? reports/calculations.json\n M src/judge.ts", research: false },
  ];
  for (const route of routes) {
    test(`selects the observable rubric for ${route.name}`, async () => {
      const artifacts = '{"finding":"calibrated research calculation","probability":0.73}';
      expect(inferTaskType(route.status, artifacts, TASK)).toBe(route.research ? "analysis_research" : "code_change");
      // An agent-supplied research label must not override actual product code/config paths.
      const { request } = await evaluatePacket(context({ diffSummary: route.status, deliverableArtifacts: artifacts }));
      await assertRubric(request.questions, route.research);
    });
  }

  test("implementation intent still requires implementation evidence with report-only changes", async () => {
    const task = "Implement task-aware artifact selection in the evidence collector.";
    const status = "?? plans/reports/selection-analysis.json";
    const artifacts = '{"finding":"design complete; implementation not demonstrated"}';
    expect(inferTaskType(status, artifacts, task)).toBe("code_change");
    const { request } = await evaluatePacket(context({ todoTask: task, diffSummary: status, deliverableArtifacts: artifacts }));
    await assertRubric(request.questions, false);
  });

  test("collects genuine report JSON as research evidence rather than product code", async () => {
    await withProject(async (fixture) => {
      const relativePath = "plans/reports/calculations.json";
      const content = JSON.stringify({ task: TASK, finding: "Disk provenance alone cannot prove loaded-memory identity", calculation: [0.13, 0.87] });
      await fixture.write(relativePath, content);
      const evidence = await collectTaskEvidence({ cwd: fixture.cwd, baseline: fixture.baseline });
      expect(evidence.changedFiles).toEqual([relativePath]);
      const artifacts = await collectDeliverableArtifacts(fixture.cwd, evidence.changedFiles, TASK);
      expect(artifacts).toContain(content);
      const { request, state } = await evaluatePacket(context({
        diffSummary: evidence.gitStatus,
        unifiedDiff: evidence.gitDiff,
        taskType: inferTaskType(evidence.gitStatus, artifacts, TASK),
        deliverableArtifacts: artifacts,
      }));
      await assertRubric(request.questions, true);
      expect(unwrap(state.deliverable_artifacts, "deliverable_artifacts")).toContain(content);
    });
  }, 30_000);

  for (const mapPath of ["plans/reports/zzz-map.md", "reports/aaa-map.md"]) {
    test(`retains full task-bound tail proof despite competition and changed-file order: ${mapPath}`, async () => {
      await withProject(async (fixture) => {
        const report = boundReport(TASK.replace(" and ", "\n  and   "), 4550);
        const competitors: Record<string, string> = {
          "plans/reports/aaa-rootcause.md": "# Separate rootcause investigation\n" + "Unrelated investigation finding.\n".repeat(250),
          "plans/reports/mmm-scenarios.md": "# Future scenario analysis\n" + "Independent scenario observation.\n".repeat(250),
          "plans/reports/calculations.json": JSON.stringify({ task: "Compare future routing options", findings: "Independent calculation. ".repeat(250) }),
        };
        for (const [file, content] of Object.entries(competitors)) await fixture.write(file, content);
        await fixture.write(mapPath, report);
        const evidence = await collectTaskEvidence({ cwd: fixture.cwd, baseline: fixture.baseline });
        expect([...evidence.changedFiles].sort()).toEqual([...Object.keys(competitors), mapPath].sort());
        for (const files of [evidence.changedFiles, [...evidence.changedFiles].reverse()]) {
          const artifacts = await collectDeliverableArtifacts(fixture.cwd, files, TASK);
          expect(Buffer.byteLength(artifacts, "utf8")).toBeLessThanOrEqual(ARTIFACT_BUDGET);
          expect(artifacts).toContain(report);
          expect(artifacts).toContain(TAIL_PROOF);
          expect(artifacts).toMatch(/omit|truncat|budget/i);
          const { state } = await evaluatePacket(context({ diffSummary: evidence.gitStatus, deliverableArtifacts: artifacts }));
          expect(unwrap(state.deliverable_artifacts, "deliverable_artifacts")).toBe(artifacts);
        }
        for (const [file, content] of Object.entries(competitors)) expect(await fs.readFile(path.join(fixture.cwd, file), "utf8")).toBe(content);
      });
    }, 30_000);
  }


  test("UTF-8 fallback truncation is explicit, valid and within the same macro budget", async () => {
    await withProject(async (fixture) => {
      await fixture.write("reports/unrelated-observations.md", "# Independent observations\n" + "Quan sát nguồn 🧭; chưa chứng minh runtime.\n".repeat(400));
      const artifacts = await collectDeliverableArtifacts(fixture.cwd, ["reports/unrelated-observations.md"], TASK);
      expect(Buffer.byteLength(artifacts, "utf8")).toBeLessThanOrEqual(ARTIFACT_BUDGET);
      expect(artifacts).toMatch(/truncat|summari|budget/i);
      expect(artifacts).not.toContain("\uFFFD");
      const { state } = await evaluatePacket(context({ deliverableArtifacts: artifacts }));
      expect(unwrap(state.deliverable_artifacts, "deliverable_artifacts")).toBe(artifacts);
    });
  }, 30_000);

  test("macro accepts the UTF-8 byte boundary intact and rejects one byte beyond before evaluation", async () => {
    const prefix = "# Provenance\nQuan sát 🧭\n";
    const suffix = `\n${TAIL_PROOF}`;
    const artifacts = prefix + "x".repeat(ARTIFACT_BUDGET - Buffer.byteLength(prefix + suffix, "utf8")) + suffix;
    const { state } = await evaluatePacket(context({ deliverableArtifacts: artifacts }));
    expect(unwrap(state.deliverable_artifacts, "deliverable_artifacts")).toBe(artifacts);
    let evaluations = 0;
    const result = await runPhaseMacroCheck(context({ deliverableArtifacts: artifacts + "!" }), {
      async evaluate() { evaluations++; return approval(); },
    });
    expect(evaluations).toBe(0);
    expect(result.approved).toBe(false);
    expect(result.error).toBe("insufficient_deliverable_evidence");
    expect(result.verdict).toBeUndefined();
    expect(result.meetsCriteriaNoul).toBeUndefined();
  });

  test("relevance fallback prioritizes useful evidence across competing artifact orders", async () => {
    await withProject(async (fixture) => {
      const relevant = "# Source callsites and workspace/runtime identity\nThe judge and todo gates share an evidence collector and macro transport. Loaded-memory provenance is unresolved.";
      await fixture.write("reports/aaa-unrelated.md", "# Database tuning\n" + "Independent index selection and query timings.\n".repeat(200));
      await fixture.write("reports/zzz-observations.md", relevant);
      for (const files of [
        ["reports/aaa-unrelated.md", "reports/zzz-observations.md"],
        ["reports/zzz-observations.md", "reports/aaa-unrelated.md"],
      ]) {
        const artifacts = await collectDeliverableArtifacts(fixture.cwd, files, TASK);
        expect(artifacts).toContain(relevant);
        expect(Buffer.byteLength(artifacts, "utf8")).toBeLessThanOrEqual(ARTIFACT_BUDGET);
        const { state } = await evaluatePacket(context({ deliverableArtifacts: artifacts }));
        expect(unwrap(state.deliverable_artifacts, "deliverable_artifacts")).toContain(relevant);
      }
    });
  }, 30_000);

  test("collection accounts for headers and the combined size of every mandatory report", async () => {
    for (const sizes of [[4930], [2700, 2700]]) {
      await withProject(async (fixture) => {
        const files: string[] = [];
        for (const [index, bytes] of sizes.entries()) {
          const file = `reports/task-proof-${index}.md`;
          const report = boundReport(TASK, bytes);
          expect(Buffer.byteLength(report, "utf8")).toBeLessThan(ARTIFACT_BUDGET);
          await fixture.write(file, report);
          files.push(file);
        }
        await expect(collectDeliverableArtifacts(fixture.cwd, files, TASK)).rejects.toThrow("insufficient_deliverable_evidence");
      });
    }
  }, 30_000);

  test("oversized mandatory UTF-8 proof fails closed during collection", async () => {
    await withProject(async (fixture) => {
      const report = `# Required source map\nTask: ${TASK}\n` + "🧭".repeat(1500) + `\n${TAIL_PROOF}`;
      expect(report.length).toBeLessThan(ARTIFACT_BUDGET);
      expect(Buffer.byteLength(report, "utf8")).toBeGreaterThan(ARTIFACT_BUDGET);
      await fixture.write("reports/required-map.md", report);
      await expect(collectDeliverableArtifacts(fixture.cwd, ["reports/required-map.md"], TASK)).rejects.toThrow("insufficient_deliverable_evidence");
    });
  }, 30_000);
});
