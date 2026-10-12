import { spawn } from "node:child_process";
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
}

export async function captureWorkspaceSnapshot(cwd: string): Promise<WorkspaceSnapshot> {
  const statusRes = await executeTestCommand("git status --porcelain -uall", cwd, 5000);
  const files = new Map<string, string>();
  if (statusRes.exitCode !== 0) {
    return { files, truncated: false };
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

  return { files, truncated };
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

/**
 * Extracts acceptance criteria checklists and tasks from markdown plan content.
 */
export function extractCriteriaFromPlan(
  planContent: string,
  taskId?: string
): string[] {
  const lines = planContent.split("\n");
  const criteria: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Matches markdown checkboxes: - [ ] text or - [x] text
    const checkboxMatch = trimmed.match(/^-\s*\[([ xX])\]\s*(.+)$/);
    if (checkboxMatch && checkboxMatch[2]) {
      criteria.push(checkboxMatch[2].trim());
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

  return criteria;
}
/**
 * Executes a shell command securely in an isolated child process with timeout and sanitized env.
 */
export async function executeTestCommand(
  command: string,
  cwd: string,
  timeoutMs = 15000
): Promise<{ exitCode: number; output: string }> {
  const cleanEnv = sanitizeEnvironment();
  const { promise, resolve } = Promise.withResolvers<{ exitCode: number; output: string }>();

  const child = spawn(command, {
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

  const timer = setTimeout(() => {
    child.kill();
    resolve({
      exitCode: 124,
      output: output + `\n[Command timed out after ${timeoutMs}ms]`,
    });
  }, timeoutMs);

  child.on("close", (code) => {
    clearTimeout(timer);
    resolve({
      exitCode: code ?? 1,
      output,
    });
  });

  child.on("error", (err) => {
    clearTimeout(timer);
    resolve({
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

  if (options.planPath) {
    assertPathIsClaudeSafe(options.planPath);
  }

  let gitStatus = "";
  let gitDiff = "";
  let diffScope: "task-baseline" | "full-working-tree" = "full-working-tree";
  let changedFiles: string[] = [];

  if (options.baseline && !options.baseline.truncated) {
    const after = await captureWorkspaceSnapshot(cwd);
    changedFiles = diffSnapshots(options.baseline, after);
    diffScope = "task-baseline";

    const statusRes = await executeTestCommand("git status --porcelain -uall", cwd, 5000);
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
      const diffRes = await executeTestCommand(`git diff HEAD -- ${filesArg}`, cwd, 5000);
      trackedDiff = diffRes.output.trim();
    }

    let untrackedDiff = "";
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

    gitDiff = [trackedDiff, untrackedDiff.trim()].filter(Boolean).join("\n\n");
  } else {
    const [gitStatusRes, gitDiffRes] = await Promise.all([
      executeTestCommand("git status --porcelain", cwd, 5000),
      executeTestCommand("git diff HEAD", cwd, 5000).then(async (res) => {
        if (res.exitCode !== 0) {
          return executeTestCommand("git diff", cwd, 5000);
        }
        return res;
      }),
    ]);
    gitStatus = gitStatusRes.output.trim();
    gitDiff = gitDiffRes.output.trim();
    diffScope = "full-working-tree";

    const lines = gitStatus.split(/\r?\n/).filter((l) => l.trim().length > 0);
    changedFiles = lines.map((l) => {
      let p = l.slice(3).trim();
      if (p.includes(" -> ")) p = p.split(" -> ").pop()?.trim() || p;
      if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
      return p;
    });
  }
  let testExitCode: number | null = null;
  let testOutput = "";
  if (options.testCommand) {
    const testRes = await executeTestCommand(options.testCommand, cwd, options.timeoutMs ?? 15000);
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
        const phaseRegex = /\|\s*(\d+|[a-zA-Z0-9_-]+)\s*\|\s*\[.*?\]\(((\.?\/)?phase-[^)]+\.md)\)/gi;
        let match: RegExpExecArray | null;
        const planDir = path.dirname(options.planPath);
        while ((match = phaseRegex.exec(planContent)) !== null) {
          const phaseIdentifier = match[1].trim();
          const phaseFileRelative = match[2].trim();
          if (
            options.taskId.toString() === phaseIdentifier ||
            options.taskId.includes(`phase-${phaseIdentifier}`) ||
            options.taskId.includes(`Phase ${phaseIdentifier}`) ||
            options.taskId.includes(phaseIdentifier)
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
