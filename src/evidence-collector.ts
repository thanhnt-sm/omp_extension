import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import * as fsSync from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
export class SecurityViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityViolationError";
  }
}

export interface TestCommandResult {
  exitCode: number;
  output: string;
}

export interface WorkspaceSnapshotOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface TaskEvidenceOptions {
  cwd?: string;
  taskId?: string;
  planPath?: string;
  testCommand?: string;
  timeoutMs?: number;
  untrustedAgentState?: string;
  taskDoneProven?: boolean;
  todoCompleted?: boolean;
  baseline?: WorkspaceSnapshot;
  afterSnapshot?: WorkspaceSnapshot;
  testResult?: TestCommandResult;
  signal?: AbortSignal;
}

export interface TaskEvidenceResult {
  gitStatus: string;
  gitDiff: string;
  testExitCode: number | null;
  testOutput: string;
  criteria: string[];
  cleanWorkingTree: boolean;
  timestamp: string;
  taskDoneProven?: boolean;
  todoCompleted?: boolean;
  changedFiles: string[];
  diffScope: "task-baseline" | "full-working-tree";
  criteriaSource: "phase" | "plan" | "none";
}

export interface WorkspaceSnapshot {
  files: Map<string, string>;
  truncated: boolean;
  headSha?: string;
}

export async function captureWorkspaceSnapshot(
  cwd: string,
  options: WorkspaceSnapshotOptions = {}
): Promise<WorkspaceSnapshot> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const [statusRes, headRes] = await Promise.all([
    executeTestCommand("git status --porcelain -uall", cwd, timeoutMs, options.signal),
    executeTestCommand("git rev-parse HEAD", cwd, timeoutMs, options.signal),
  ]);
  const headSha = headRes.exitCode === 0 ? headRes.output.trim() : undefined;
  const files = new Map<string, string>();
  if (statusRes.exitCode !== 0) {
    return { files, truncated: false, headSha };
  }
  const lines = statusRes.output.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let truncated = false;
  for (let i = 0; i < lines.length; i++) {
    if (i >= 2000) {
      truncated = true;
      break;
    }
    const line = lines[i];
    let filePath = line.slice(3).trim();
    if (filePath.includes(" -> ")) {
      const parts = filePath.split(" -> ");
      filePath = parts[parts.length - 1].trim();
    }
    if (filePath.startsWith('"') && filePath.endsWith('"')) {
      filePath = filePath.slice(1, -1);
    }

    const fullPath = path.resolve(cwd, filePath);
    try {
      if (fsSync.existsSync(fullPath)) {
        const bytes = fsSync.readFileSync(fullPath);
        const hash = createHash("sha1").update(bytes).digest("hex");
        files.set(filePath, hash);
      } else {
        files.set(filePath, "<deleted>");
      }
    } catch {
      files.set(filePath, "<error>");
    }
  }

  return { files, truncated, headSha };
}

export function diffSnapshots(before: WorkspaceSnapshot, after: WorkspaceSnapshot): string[] {
  const changed = new Set<string>();
  for (const [p, h] of after.files.entries()) {
    if (before.files.get(p) !== h) {
      changed.add(p);
    }
  }
  for (const p of before.files.keys()) {
    if (!after.files.has(p)) {
      changed.add(p);
    }
  }
  return Array.from(changed).sort();
}

function prioritizeCodeDiffBlocks(diff: string): string {
  if (!diff.includes("diff --git ")) return diff;
  const parts = diff.split(/(?=^diff --git )/m);
  const codeBlocks: string[] = [];
  const docBlocks: string[] = [];
  for (const part of parts) {
    const firstLine = part.split(/\r?\n/, 1)[0] || "";
    if (/\.(md|markdown|txt|rst|adoc)(?:["\s]|$)/i.test(firstLine)) {
      docBlocks.push(part.trimEnd());
    } else {
      codeBlocks.push(part.trimEnd());
    }
  }
  return [...codeBlocks, ...docBlocks].filter(Boolean).join("\n\n");
}

/**
 * Validates that a path does NOT target ~/.claude, .claude subdirectories,
 * or Claude configuration credentials.
 */
export function assertPathIsClaudeSafe(targetPath: string): void {
  const resolved = path.resolve(targetPath);
  const home = os.homedir();
  const claudeHomeDir = path.join(home, ".claude");
  const claudeJsonPath = path.join(home, ".claude.json");

  const normalized = resolved.replace(/\\/g, "/");
  const normalizedClaudeHome = claudeHomeDir.replace(/\\/g, "/");
  const normalizedClaudeJson = claudeJsonPath.replace(/\\/g, "/");

  if (
    normalized === normalizedClaudeHome ||
    normalized.startsWith(normalizedClaudeHome + "/") ||
    normalized === normalizedClaudeJson ||
    normalized.includes("/.claude/") ||
    normalized.endsWith("/.claude")
  ) {
    throw new SecurityViolationError(
      `Access to Claude configuration or directory is strictly prohibited: ${targetPath}`
    );
  }
}

/**
 * Sanitizes environment variables to prevent leaking Anthropic or Claude
 * credentials to spawned child processes.
 */
export function sanitizeEnvironment(
  env?: Record<string, string | undefined>
): Record<string, string> {
  const source = env ?? process.env;
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(source)) {
    if (
      value !== undefined &&
      !key.startsWith("ANTHROPIC_") &&
      !key.startsWith("CLAUDE_")
    ) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export function isPlanCliStub(content: string): boolean {
  if (!content || !content.trim()) return false;
  if (content.length > 1500) return false;
  const hasPhaseStubOverview = /Brief description of scope and deliverables\./i.test(content);
  const hasStubCheckboxes =
    /-\s*\[\s*\]\s*Verifiable acceptance criteria/i.test(content) &&
    /-\s*\[\s*\]\s*Test validation commands/i.test(content);
  const hasOverviewTbd = /##\s+Overview\s*\r?\n+\s*TBD\.?\s*(?:\r?\n|$)/i.test(content);
  return hasPhaseStubOverview || hasStubCheckboxes || hasOverviewTbd;
}

/**
 * Extracts acceptance criteria checklists and tasks from markdown plan content.
 */
export function extractCriteriaFromPlan(
  planContent: string,
  taskId?: string
): string[] {
  if (isPlanCliStub(planContent)) {
    return [];
  }
  const lines = planContent.split("\n");
  const criteria: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Matches markdown checkboxes: - [ ] text or - [x] text
    const checkboxMatch = trimmed.match(/^-\s*\[([ xX])\]\s*(.+)$/);
    if (checkboxMatch && checkboxMatch[2]) {
      const item = checkboxMatch[2].trim();
      if (!/^(?:Verifiable acceptance criteria|Test validation commands)\.?$/i.test(item)) {
        criteria.push(item);
      }
    }
  }
  if (criteria.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const numMatch = trimmed.match(/^\d+\.\s+\*\*(.+?)\*\*:\s*(.+)$/);
      if (numMatch && numMatch[1] && numMatch[2]) {
        criteria.push(`${numMatch[1]}: ${numMatch[2]}`);
      }
    }
  }

  if (taskId && criteria.length > 1) {
    const isBarePhase = /^\s*(?:phase\s*\d+|\d+)\s*$/i.test(taskId);
    if (!isBarePhase) {
      const taskTokens = taskId
        .toLowerCase()
        .replace(/[^a-z0-9\u00C0-\u1EF9\s]/gi, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !/^(?:phase|step|task|item|with|from|that|this)$/.test(w));
      if (taskTokens.length > 0) {
        const matched = criteria.filter((c) => {
          const cLower = c.toLowerCase();
          return taskTokens.some((t) => cLower.includes(t));
        });
        if (matched.length > 0 && matched.length < criteria.length) {
          return matched;
        }
      }
    }
  }

  return criteria;
}
/**
 * Executes a shell command securely in an isolated child process with timeout and sanitized env.
 */
export async function executeTestCommand(
  command: string,
  cwd: string,
  timeoutMs = 15000,
  signal?: AbortSignal
): Promise<TestCommandResult> {
  if (signal?.aborted) {
    return { exitCode: 130, output: "[Command aborted before start]" };
  }

  const cleanEnv = sanitizeEnvironment();
  const { promise, resolve } = Promise.withResolvers<TestCommandResult>();
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let child: ChildProcess | undefined;

  const finish = (result: TestCommandResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    resolve(result);
  };
  const abort = () => {
    child?.kill();
    finish({ exitCode: 130, output: "[Command aborted]" });
  };

  child = spawn(command, {
    cwd,
    env: cleanEnv,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });

  timer = setTimeout(() => {
    child?.kill();
    finish({
      exitCode: 124,
      output: output + `\n[Command timed out after ${timeoutMs}ms]`,
    });
  }, timeoutMs);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) {
    abort();
  }

  child.on("close", (code) => {
    finish({
      exitCode: code ?? 1,
      output,
    });
  });

  child.on("error", (err) => {
    finish({
      exitCode: 1,
      output: output + `\n[Process spawn error: ${err.message}]`,
    });
  });

  return promise;
}

/**
 * Collects ground-truth OS evidence for a task: Git diff, working tree status,
 * test suite exit code, and authoritative criteria from plan.
 */
export async function collectTaskEvidence(
  options: TaskEvidenceOptions
): Promise<TaskEvidenceResult> {
  const cwd = options.cwd ?? process.cwd();
  const deadline = options.timeoutMs ?? 15000;
  const run = (command: string, timeoutMs = deadline) =>
    executeTestCommand(command, cwd, Math.min(timeoutMs, deadline), options.signal);

  if (options.planPath) {
    assertPathIsClaudeSafe(options.planPath);
  }

  let gitStatus = "";
  let gitDiff = "";
  let diffScope: "task-baseline" | "full-working-tree" = "full-working-tree";
  let changedFiles: string[] = [];

  if (options.baseline && !options.baseline.truncated) {
    const after = options.afterSnapshot ?? await captureWorkspaceSnapshot(cwd, {
      signal: options.signal,
      timeoutMs: deadline,
    });
    changedFiles = diffSnapshots(options.baseline, after);
    diffScope = "task-baseline";

    const statusRes = await run("git status --porcelain -uall");
    const porcelainLines = statusRes.output.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const statusEntries: string[] = [];
    const trackedChanged: string[] = [];
    const untrackedChanged: string[] = [];

    for (const file of changedFiles) {
      const matchedLine = porcelainLines.find((l) => {
        let p = l.slice(3).trim();
        if (p.includes(" -> ")) p = p.split(" -> ").pop()?.trim() || p;
        if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
        return p === file;
      });

      if (matchedLine) {
        statusEntries.push(matchedLine);
        if (matchedLine.startsWith("??")) {
          untrackedChanged.push(file);
        } else {
          trackedChanged.push(file);
        }
      } else {
        statusEntries.push(`   ${file} (reverted to HEAD)`);
      }
    }

    gitStatus = statusEntries.join("\n");

    let trackedDiff = "";
    if (trackedChanged.length > 0) {
      const filesArg = trackedChanged.map((f) => `"${f}"`).join(" ");
      const diffRes = await run(`git diff HEAD -- ${filesArg}`, 5000);
      trackedDiff = diffRes.output.trim();
    }
    let untrackedDiff = "";
    const commitChangedSinceBaseline =
      !options.baseline.headSha ||
      !after.headSha ||
      options.baseline.headSha !== after.headSha;
    if (!trackedDiff && untrackedChanged.length === 0 && commitChangedSinceBaseline) {
      try {
        const [recentLogRes, commitDiffRes] = await Promise.all([
          run("git log -n 1 --oneline", 5000),
          run("git diff HEAD~1..HEAD", 5000),
        ]);
        if (recentLogRes.exitCode === 0 && commitDiffRes.exitCode === 0 && commitDiffRes.output.trim()) {
          gitStatus = `Committed in ${recentLogRes.output.trim()}`;
          trackedDiff = commitDiffRes.output.trim();
          const statRes = await run("git diff --name-only HEAD~1..HEAD", 5000);
          changedFiles = statRes.output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        }
      } catch {}
    } else if (!trackedDiff && untrackedChanged.length === 0 && statusEntries.length > 0) {
      trackedDiff = statusEntries.join("\n");
    } else if (!trackedDiff && untrackedChanged.length === 0 && porcelainLines.length > 0) {
      gitStatus = porcelainLines.join("\n");
      const fullDiffRes = await run("git diff HEAD", 5000);
      trackedDiff = fullDiffRes.output.trim();
      changedFiles = porcelainLines.map((l) => {
        let p = l.slice(3).trim();
        if (p.includes(" -> ")) p = p.split(" -> ").pop()?.trim() || p;
        if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
        return p;
      });
    }
    for (const uf of untrackedChanged) {
      try {
        const fullPath = path.resolve(cwd, uf);
        if (fsSync.existsSync(fullPath)) {
          const content = fsSync.readFileSync(fullPath, "utf8").slice(0, 4096);
          const diffLines = content.split(/\r?\n/).map((l) => `+${l}`).join("\n");
          untrackedDiff += `diff --git a/${uf} b/${uf}\nnew file\n+++ b/${uf}\n${diffLines}\n`;
        }
      } catch {}
    }

    gitDiff = prioritizeCodeDiffBlocks([trackedDiff, untrackedDiff.trim()].filter(Boolean).join("\n\n"));
  } else {
    const [gitStatusRes, gitDiffRes] = await Promise.all([
      run("git status --porcelain -uall", 5000),
      run("git diff HEAD", 5000).then(async (res) => {
        if (res.exitCode !== 0) {
          return run("git diff", 5000);
        }
        return res;
      }),
    ]);
    gitStatus = gitStatusRes.output.trim();
    gitDiff = prioritizeCodeDiffBlocks(gitDiffRes.output.trim());
    diffScope = "full-working-tree";
    if (!gitStatus && !gitDiff) {
      try {
        const [recentLogRes, commitDiffRes] = await Promise.all([
          run("git log -n 1 --oneline", 5000),
          run("git diff HEAD~1..HEAD", 5000),
        ]);
        if (recentLogRes.exitCode === 0 && commitDiffRes.exitCode === 0 && commitDiffRes.output.trim()) {
          gitStatus = `Committed in ${recentLogRes.output.trim()}`;
          gitDiff = commitDiffRes.output.trim();
          diffScope = "task-baseline";
          const statRes = await run("git diff --name-only HEAD~1..HEAD", 5000);
          changedFiles = statRes.output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        }
      } catch {}
    } else {
      const lines = gitStatus.split(/\r?\n/).filter((l) => l.trim().length > 0);
      changedFiles = lines.map((l) => {
        let p = l.slice(3).trim();
        if (p.includes(" -> ")) p = p.split(" -> ").pop()?.trim() || p;
        if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
        return p;
      });
      let untrackedDiff = "";
      for (const l of lines.filter((line) => line.startsWith("??"))) {
        let uf = l.slice(3).trim();
        if (uf.startsWith('"') && uf.endsWith('"')) uf = uf.slice(1, -1);
        try {
          const fullPath = path.resolve(cwd, uf);
          if (fsSync.existsSync(fullPath)) {
            const content = fsSync.readFileSync(fullPath, "utf8").slice(0, 4096);
            const diffLines = content.split(/\r?\n/).map((line) => `+${line}`).join("\n");
            untrackedDiff += `diff --git a/${uf} b/${uf}\nnew file\n+++ b/${uf}\n${diffLines}\n`;
          }
        } catch {}
      }
      if (untrackedDiff.trim()) {
        gitDiff = prioritizeCodeDiffBlocks([gitDiff, untrackedDiff.trim()].filter(Boolean).join("\n\n"));
      }
    }
  }
  let testExitCode: number | null = null;
  let testOutput = "";
  if (options.testResult) {
    testExitCode = options.testResult.exitCode;
    testOutput = options.testResult.output;
  } else if (options.testCommand) {
    const testRes = await run(options.testCommand);
    testExitCode = testRes.exitCode;
    testOutput = testRes.output;
  }

  // 4. Criteria extraction from plan if path provided
  let criteria: string[] = [];
  let criteriaSource: "phase" | "plan" | "none" = "none";
  if (options.planPath) {
    try {
      const planContent = await fs.readFile(options.planPath, "utf8");
      criteria = extractCriteriaFromPlan(planContent, options.taskId);

      // If plan delegates to phase files, inspect whether a specific phase matches taskId
      if (options.taskId) {
        const phaseRegex = /\|\s*(\d+|[a-zA-Z0-9_-]+)\s*\|\s*\[(.*?)\]\(((\.?\/)?phase-[^)]+\.md)\)/gi;
        let match: RegExpExecArray | null;
        const planDir = path.dirname(options.planPath);
        while ((match = phaseRegex.exec(planContent)) !== null) {
          const phaseIdentifier = match[1].trim();
          const phaseLinkTitle = (match[2] || "").trim().toLowerCase();
          const phaseFileRelative = match[3].trim();
          const escapedId = phaseIdentifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const phaseWordMatch = new RegExp(`\\bphase[-_\\s]*0*${escapedId}\\b`, "i");
          const taskLower = options.taskId.toString().trim().toLowerCase();
          if (
            options.taskId.toString().trim() === phaseIdentifier ||
            phaseWordMatch.test(options.taskId) ||
            (phaseLinkTitle.length > 3 && taskLower.includes(phaseLinkTitle))
          ) {
            const resolvedPhasePath = path.resolve(planDir, phaseFileRelative);
            assertPathIsClaudeSafe(resolvedPhasePath);
            try {
              const phaseContent = await fs.readFile(resolvedPhasePath, "utf8");
              const phaseCriteria = extractCriteriaFromPlan(phaseContent, options.taskId);
              if (phaseCriteria.length > 0) {
                criteria = phaseCriteria;
                criteriaSource = "phase";
                break;
              }
            } catch {
              // fallback to plan criteria if phase read fails
            }
          }
        }
      }
      if (criteriaSource !== "phase" && criteria.length > 0) {
        criteriaSource = "plan";
      }
    } catch {
      criteria = [];
    }
  }

  return {
    gitStatus,
    gitDiff,
    testExitCode,
    testOutput,
    criteria,
    criteriaSource,
    changedFiles,
    diffScope,
    cleanWorkingTree: gitStatus.length === 0,
    timestamp: new Date().toISOString(),
    taskDoneProven: options.taskDoneProven,
    todoCompleted: options.todoCompleted,
  };
}
