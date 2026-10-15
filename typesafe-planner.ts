// Implementation: 7 red-team vulnerability tests added, batch/mutative ops gated, 32KB payload boundary preserved, zero-evidence rejected, EGC deconflicted, and privilege guarded.
// TypeSafe Planner Integration Extension for OMP
// Connects OMP planning workflows with TypeSafe System One judgments (Choice, Noul, Score).

import { createRequire } from "node:module";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { evaluatePlanDraft, type PlanJudgeClient, type PlanQuestion } from "./src/plan-evaluator";
import { verifyTaskCompletion, type GateJudgeClient, type GateQuestion } from "./src/verification-gate";
import {
  collectTaskEvidence,
  captureWorkspaceSnapshot,
  diffSnapshots,
  executeTestCommand,
  isPlanCliStub,
  type TaskEvidenceResult,
  type WorkspaceSnapshot,
} from "./src/evidence-collector";
import { clampText } from "./src/payload-safety";
import { sanitizeXmlText } from "./src/xml-enclosure";
import {
  runDropJustificationCheck,
  DROP_REJECT_FLOOR,
  runTaskMicroCheck,
  runPhaseMacroCheck,
  evaluateScopeArbiter,
  evaluateDriftGuard,
  evaluateRiskSecurityTriage,
  generateVerificationScorecard,
  evaluateAdvisorIntent,
  runBicameralDropCheck,
  runBicameralMacroCheck,
  runBicameralDecisionCheck,
  formatConsensusEscalation,
  formatCkAdvisorReport,
  type AdvisorDecisionKind,
  type AdvisorOptionCandidate,
  type ExpertJudgeClient,
  type ExpertJudgeQuestion,
  type ExpertJudgeResponse,
  type DriftChoice,
  type ScopeChoice,
} from "./src/cook-expert-judge";
import { synthesizePlanDelta } from "./src/remediation-generator";
export interface PendingRemediation {
  taskId: string;
  gate: string;
  diffHash: string;
  testExitCode?: number | null;
  reasons: string[];
  nextActions: string[];
  timestamp: number;
}

export interface CanonicalTodoTask {
  content: string;
  status: "pending" | "in_progress" | "completed" | "abandoned" | "blocked";
  blocker?: string;
}

export interface CanonicalTodoPhase {
  name: string;
  tasks: CanonicalTodoTask[];
}

export interface StagedTodoCall {
  toolCallId: string;
  inputHash: string;
  generation: number;
  revision: number;
  createdAt: number;
  op: string;
  affectedTasks: string[];
  replacedTasks: string[];
  verifiedTasks: string[];
  workspaceSnapshot: WorkspaceSnapshot;
  pendingReports: TaskReport[];
  provenance: "judge" | "human" | "host-authorization" | "gate1";
}

interface CommittedTodoCall {
  inputHash: string;
  op: string;
  committedAt: number;
}

interface ExtensionToolResult {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
  isError?: boolean;
}

interface ToolDefinition<TParams> {
  name: string;
  label?: string;
  description: string;
  parameters: unknown;
  execute: (
    toolCallId: string,
    params: TParams,
    signal?: AbortSignal,
    onUpdate?: (result: ExtensionToolResult) => void,
    ctx?: unknown
  ) => Promise<ExtensionToolResult>;
}

interface ExtensionAPI {
  zod: {
    object: (shape: Record<string, unknown>) => unknown;
    union: (options: unknown[]) => unknown;
    string: () => { optional: () => unknown; min?: (n: number) => unknown; [key: string]: unknown };
    number: () => { optional: () => unknown; [key: string]: unknown };
    record: (valueType: unknown) => unknown;
    enum: (values: string[]) => unknown;
    unknown: () => unknown;
    array: (itemType: unknown) => { min: (n: number) => unknown; [key: string]: unknown };
  };
  on: (event: string, handler: (event: unknown, ctx: unknown) => Promise<void> | void) => void;
  registerTool: <T>(definition: ToolDefinition<T>) => void;
  sendMessage: (
    message: string | { customType?: string; content: string; display?: boolean },
    options?: { deliverAs?: "steer" | "followUp" | "nextTurn" | "aside"; triggerTurn?: boolean }
  ) => Promise<void>;
}

export interface ExtensionRuntimeOptions {
  homeDir?: string;
  env?: Record<string, string | undefined>;
  preflightBudgetMs?: number;
}

export interface PlannerSessionState {
  readonly resolverOptions: Required<Pick<ExtensionRuntimeOptions, "homeDir" | "env">>;
  generation: number;
  revision: number;
  phases: CanonicalTodoPhase[];
  readonly activeContractedTasks: ReadonlySet<string>;
  taskBaselines: Map<string, WorkspaceSnapshot>;
  lastCheckpoint?: WorkspaceSnapshot;
  pendingRemediations: Map<string, PendingRemediation>;
  consecutiveFailuresByTask: Map<string, number>;
  lastFailureReasonByTask: Map<string, string>;
  stagedCalls: Map<string, StagedTodoCall>;
  committedCallTombstones: Map<string, CommittedTodoCall>;
  uninitialized: boolean;
}

export interface TypeSafeQuestion {
  type: "noul" | "choice" | "score";
  instructions: string | Record<string, unknown>;
  criteria?: unknown;
}

interface TypeSafeJudgeParams {
  state: string | Record<string, unknown>;
  questions: Record<string, TypeSafeQuestion>;
  model?: string;
}

// ---------------------------------------------------------------------------
// Bundled runtime modules.
//
// Every security-sensitive dependency is loaded from this extension's sibling
// `src/` directory. The host's global kit and any alternate workspace are
// deliberately not candidates: a stale or poisoned global module must never
// influence this bundle. Successful CommonJS loads remain cached until the
// host restarts.
const nodeRequire = createRequire(import.meta.url);

type RuntimeOriginDigest = {
  origin: string;
  sha256: string | null;
};

type RuntimeOriginProof = {
  kind: "runtime-origin";
  algorithm: "sha256";
  entrypoint: RuntimeOriginDigest;
  bundledModules: RuntimeOriginDigest[];
};

const RUNTIME_ORIGIN_MODULE_URLS = [
  new URL("./src/typesafe-enabled-resolver.cjs", import.meta.url).href,
  new URL("./src/typesafe-redact.cjs", import.meta.url).href,
  new URL("./src/typesafe-api-client.cjs", import.meta.url).href,
  new URL("./src/typesafe-policy-client.cjs", import.meta.url).href,
];

let cachedRuntimeOriginProof: RuntimeOriginProof | undefined;

function sha256AtOrigin(origin: string): string | null {
  try {
    return crypto.createHash("sha256").update(readFileSync(new URL(origin))).digest("hex");
  } catch {
    return null;
  }
}

function getRuntimeOriginProof(): RuntimeOriginProof {
  if (cachedRuntimeOriginProof) return cachedRuntimeOriginProof;

  cachedRuntimeOriginProof = {
    kind: "runtime-origin",
    algorithm: "sha256",
    entrypoint: {
      origin: import.meta.url,
      sha256: sha256AtOrigin(import.meta.url),
    },
    bundledModules: RUNTIME_ORIGIN_MODULE_URLS.map((origin) => ({
      origin,
      sha256: sha256AtOrigin(origin),
    })),
  };
  return cachedRuntimeOriginProof;
}

interface EnabledResolverModule {
  resolveTypeSafeEnabled: (
    projectDir: string,
    opts?: { env?: Record<string, string | undefined>; homeDir?: string }
  ) => { enabled: boolean; reason: string };
}

interface RedactModule {
  preparePayload: (payload: unknown, opts?: { maxBytes?: number; apiKey?: string }) => unknown;
}

interface ApiClientModule {
  validateInput: (args: unknown) => { ok: boolean; message?: string };
  sanitizeAnswers: (
    questions: Record<string, TypeSafeQuestion>,
    rawAnswers: unknown
  ) => Record<string, unknown> | null;
  requestWithRetry: (options: {
    apiKey: string;
    body: string;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    timeoutMs?: number;
    maxAttempts?: number;
    totalBudgetMs?: number;
    nowImpl?: () => number;
    wallNowImpl?: () => number;
    sleepImpl?: (ms: number, signal?: AbortSignal) => Promise<void>;
    randomImpl?: () => number;
    rateLimitState?: object;
    debugLog?: (message: string) => void;
    setTimeoutImpl?: (callback: () => void, ms: number) => unknown;
    clearTimeoutImpl?: (timer: unknown) => void;
  }) => Promise<
    | { kind: "ok"; data: unknown }
    | { kind: "auth"; status: number }
    | { kind: "http_error"; status: number }
    | { kind: "bad_response" }
  >;
  checkCredentialCooldown: (
    apiKey: string,
    options?: { rateLimitState?: object }
  ) => { status: number; cooldown?: true; authFailed?: true; until?: number } | null;
}

interface PolicyClientModule {
  checkPolicy(
    baseline: string,
    choice: string,
    lattice: string[]
  ): { ok: boolean; reason?: string; attempted?: string; baseline?: string; choice?: string };
}

function loadResolverModule(): EnabledResolverModule | null {
  try {
    const mod = nodeRequire(path.join(__dirname, "src", "typesafe-enabled-resolver.cjs")) as EnabledResolverModule;
    return mod && typeof mod.resolveTypeSafeEnabled === "function" ? mod : null;
  } catch {
    return null;
  }
}

function loadRedactModule(): RedactModule | null {
  try {
    const mod = nodeRequire(path.join(__dirname, "src", "typesafe-redact.cjs")) as RedactModule;
    return mod && typeof mod.preparePayload === "function" ? mod : null;
  } catch {
    return null;
  }
}

function loadApiClientModule(): ApiClientModule | null {
  try {
    const mod = nodeRequire(path.join(__dirname, "src", "typesafe-api-client.cjs")) as ApiClientModule;
    return mod &&
      typeof mod.validateInput === "function" &&
      typeof mod.sanitizeAnswers === "function" &&
      typeof mod.requestWithRetry === "function" &&
      typeof mod.checkCredentialCooldown === "function"
      ? mod
      : null;
  } catch {
    return null;
  }
}

function loadPolicyClientModule(pi?: ExtensionAPI): PolicyClientModule | null {
  try {
    const mod = nodeRequire(path.join(__dirname, "src", "typesafe-policy-client.cjs")) as PolicyClientModule;
    if (mod && typeof mod.checkPolicy === "function") return mod;
    throw new Error("missing checkPolicy export");
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    if (pi && typeof pi.sendMessage === "function") {
      try {
        const result = pi.sendMessage({
          customType: "typesafe-health",
          content: `TypeSafe warning: Failed to load bundled typesafe-policy-client.cjs: ${detail}`,
          display: true,
        });
        if (result && typeof (result as Promise<void>).catch === "function") {
          (result as Promise<void>).catch(() => {});
        }
      } catch {}
    }
    return null;
  }
}

const HOST_POLICY = {
  baseline: process.env.TYPESAFE_BASELINE || "review",
  lattice: process.env.TYPESAFE_LATTICE ? process.env.TYPESAFE_LATTICE.split(",") : ["auto", "review", "block"]
};

/**
 * Best-effort project directory for the resolver: OMP's per-call ctx.cwd
 * when the host exposes it (ctx's real shape isn't part of the documented
 * ExtensionAPI, so this is read defensively), else process.cwd().
 */
function getProjectDir(ctx: unknown): string {
  if (ctx && typeof ctx === "object") {
    const cwd = (ctx as Record<string, unknown>).cwd;
    if (typeof cwd === "string" && cwd.trim()) return cwd;
  }
  return process.cwd();
}

const MAX_BODY_BYTES = 32768;

const DISABLED_RESULT: ExtensionToolResult = {
  content: [{ type: "text", text: "TypeSafe disabled" }],
};
const PROTECTED_INTEGRITY_PATTERNS = [
  "src/debate-evaluator.ts",
  "typesafe-planner.ts",
  "models.yml",
  "typesafe-policy-client.cjs",
  "typesafe-redact.cjs",
  "typesafe-enabled-resolver.cjs",
];
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

export const COGNITIVE_TASK_PATTERN =
  /\b(?:scout\w*|diagnos\w*|investigat\w*|research\w*|analy[sz]\w*|explor\w*|find|audit\w*|review\w*|check\w*|trac\w*|inspect\w*|read\w*|clarif\w*|brainstorm\w*|plan|planning|design\w*|synthesi[sz]\w*|consult\w*|evaluat\w*|assess\w*|document\w*|journal\w*|organi[sz]\w*|verif\w*|ask\w*|propos\w*|validat\w*|compar\w*|summariz\w*|kiểm tra|phân tích|tìm|nghiên cứu|lập kế hoạch)\b/i;

const IMPLEMENTATION_LEAD_PATTERN =
  /^\s*(?:(?:step|task|phase)\s*\d+\s*[:.-]\s*)?(?:implement\w*|fix\w*|build\w*|add\w*|create\s+src|refactor\w*|patch\w*|deploy\w*)\b/i;

export function inferTaskType(
  gitStatus: string,
  deliverableArtifacts?: string,
  taskDescription?: string
): "code_change" | "analysis_research" | "doc_specification" {
  const statusLines = gitStatus.split("\n").map((l) => l.trim()).filter(Boolean);
  
  // Check for any code or config modifications
  const hasCodeFiles = statusLines.some((line) => {
    const filepath = line.replace(/^[MADRCU?! ]+\s+/, "");
    return /\.(ts|tsx|js|jsx|cjs|mjs|py|go|rs|json|ya?ml|toml|sql|sh|bat|ps1)$/i.test(filepath) &&
      !filepath.endsWith("package-lock.json");
  });
  if (hasCodeFiles) {
    return "code_change";
  }

  // Check for documentation specifications (.md, .txt, .rst)
  const docFilepaths = statusLines
    .map((line) => line.replace(/^[MADRCU?! ]+\s+/, ""))
    .filter((fp) => /\.(md|markdown|txt|rst|adoc)$/i.test(fp) && !fp.includes("reports/"));
  const onlyFilteredPlanStubs =
    deliverableArtifacts === "" &&
    Boolean(taskDescription) &&
    docFilepaths.length > 0 &&
    docFilepaths.every((fp) => /(?:^|[\/\\])plans[\/\\]/i.test(fp));
  if (docFilepaths.length > 0 && !onlyFilteredPlanStubs) {
    return "doc_specification";
  }

  // If only reports or artifact text exists, or no diff with artifact
  if (deliverableArtifacts && deliverableArtifacts.trim().length > 0) {
    return "analysis_research";
  }
  const hasReportFiles = statusLines.some((line) => {
    const filepath = line.replace(/^[MADRCU?! ]+\s+/, "");
    return filepath.includes("reports/") || filepath.includes("decisions/");
  });
  if (hasReportFiles) {
    return "analysis_research";
  }

  if (
    taskDescription &&
    !IMPLEMENTATION_LEAD_PATTERN.test(taskDescription) &&
    COGNITIVE_TASK_PATTERN.test(taskDescription)
  ) {
    return "analysis_research";
  }

  // Fallback default
  return "code_change";
}

export function summarizeMarkdownArtifact(content: string, maxBytes: number = 8192): string {
  if (Buffer.byteLength(content, "utf8") <= maxBytes) {
    return content;
  }
  // AST-aware hunk summarization: preserve headings (#, ##, ###), lists, blockquotes, and key sections
  const lines = content.split("\n");
  const preserved: string[] = [];
  let currentBytes = 0;
  const reservedFooter = "\n\n... [markdown artifact summarized for size budget] ...";
  const allowedBytes = maxBytes - Buffer.byteLength(reservedFooter, "utf8");

  for (const line of lines) {
    const trimmed = line.trim();
    // Prioritize headings, table headers/rows, bullet points, and numbered lists
    const isStructural =
      /^#{1,6}\s+/.test(trimmed) ||
      /^\|.*\|$/.test(trimmed) ||
      /^(?:[-*+]|\d+\.)\s+/.test(trimmed) ||
      /^>\s+/.test(trimmed);

    const lineBytes = Buffer.byteLength(line + "\n", "utf8");
    if (isStructural || currentBytes + lineBytes < allowedBytes * 0.7) {
      if (currentBytes + lineBytes <= allowedBytes) {
        preserved.push(line);
        currentBytes += lineBytes;
      } else {
        break;
      }
    }
  }

  return preserved.join("\n") + reservedFooter;
}

export async function collectDeliverableArtifacts(projectDir: string, changedFiles: string[] = []): Promise<string> {
  let combinedText = "";
  const maxBytes = 8192; // 8KB cap to prevent token bloat

  for (const file of changedFiles) {
    if (/\.(md|markdown|txt|rst|adoc)$/i.test(file)) {
      const fullPath = path.resolve(projectDir, file);
      if (existsSync(fullPath)) {
        try {
          const rawContent = readFileSync(fullPath, "utf-8");
          if (isPlanCliStub(rawContent)) {
            continue;
          }
          const summarized = summarizeMarkdownArtifact(rawContent, 4096);
          combinedText += `\n--- Deliverable: ${file} ---\n${summarized}\n`;
          if (combinedText.length >= maxBytes) {
            return combinedText.slice(0, maxBytes) + "\n[Summarized to 8KB artifact budget]";
          }
        } catch {}
      }
    }
  }
  return combinedText.trim();
}



/** Short, non-descriptive error code only — never forward upstream error
 * bodies, raw JSON, or exception messages to the model (contract Section 4). */
function shortError(code: string): ExtensionToolResult {
  return { content: [{ type: "text", text: `TypeSafe error: ${code}` }], isError: true };
}

export function summarizeUnifiedDiff(diff: string, maxChars = 28000): string {
  if (diff.length <= maxChars) return diff;

  const xmlMatch = diff.match(/^<([a-z_]+)>\n([\s\S]*)\n<\/\1>$/);
  if (xmlMatch) {
    const tagName = xmlMatch[1];
    const inner = xmlMatch[2];
    const tagOverhead = tagName.length * 2 + 7;
    const summarizedInner = summarizeUnifiedDiff(inner, Math.max(200, maxChars - tagOverhead));
    return `<${tagName}>\n${summarizedInner}\n</${tagName}>`;
  }

  const fileBlocks = diff.includes("diff --git ")
    ? diff.split(/(?=^diff --git )/m).filter((b) => b.trim().length > 0)
    : [diff];
  const numFiles = fileBlocks.length;
  const perFileBudget = Math.max(350, Math.floor((maxChars - 60) / numFiles));

  const summarizedBlocks = fileBlocks.map((block) => {
    if (block.length <= perFileBudget) return block.trimEnd();
    const lines = block.split("\n");
    const headerLines: string[] = [];
    const bodyLines: string[] = [];
    for (const line of lines) {
      if (
        line.startsWith("diff --git") ||
        line.startsWith("--- ") ||
        line.startsWith("+++ ") ||
        line.startsWith("new file")
      ) {
        headerLines.push(line);
      } else {
        bodyLines.push(line);
      }
    }
    const headerStr = headerLines.join("\n");
    const remainingBudget = Math.max(120, perFileBudget - headerStr.length - 45);
    const keptBody: string[] = [];
    let len = 0;
    let skipped = 0;
    for (const line of bodyLines) {
      const isPriority =
        line.startsWith("@@ ") ||
        /(?:expect\(|assert\(|assert\.[a-zA-Z]+\(|describe\(|test\(|function\s+|class\s+|export\s+|interface\s+|type\s+|const\s+[a-zA-Z0-9_]+\s*=\s*(?:async\s*)?\(|return\s+|throw\s+|TODO|unimplemented)/.test(
          line
        );
      if (
        len + line.length + 1 <= remainingBudget * 0.65 ||
        (isPriority && len + line.length + 1 <= remainingBudget)
      ) {
        if (skipped > 0) {
          const marker = `[... ${skipped} lines truncated ...]`;
          if (len + marker.length + 1 <= remainingBudget) {
            keptBody.push(marker);
            len += marker.length + 1;
          }
          skipped = 0;
        }
        keptBody.push(line);
        len += line.length + 1;
      } else {
        skipped++;
      }
    }
    if (skipped > 0) {
      keptBody.push(`[... ${skipped} lines truncated ...]`);
    }
    return headerStr ? `${headerStr}\n${keptBody.join("\n")}` : keptBody.join("\n");
  });

  let result = summarizedBlocks.join("\n\n");
  if (result.length > maxChars) {
    result = result.slice(0, maxChars - 40) + "\n[... diff truncated ...]";
  }
  return result;
}

export function sanitizeStateForTypeSafe(state: string | Record<string, unknown>): Record<string, unknown> | string {
  let resolved: Record<string, unknown> | string = state;

  if (typeof state === "string") {
    const trimmed = state.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          resolved = parsed as Record<string, unknown>;
        }
      } catch {
        // Retain original string if invalid JSON
      }
    }
  }

  const clampEnclosedOrRaw = (val: string, maxLen: number, mode: "head" | "tail" = "head"): string => {
    const match = val.match(/^<([a-z_]+)>\n([\s\S]*)\n<\/\1>$/);
    if (match) {
      const tagName = match[1];
      const inner = match[2];
      const tagOverhead = tagName.length * 2 + 7; // <tag>\n\n</tag>
      const budget = Math.max(0, maxLen - tagOverhead);
      if (inner.length > budget) {
        const clampedInner = clampText(inner, budget, mode);
        return `<${tagName}>\n${clampedInner}\n</${tagName}>`;
      }
      return val;
    }
    return clampText(val, maxLen, mode);
  };

  const TAIL_KEYS: Record<string, true> = {
    agent_work_log: true,
    test_summary: true,
    testOutput: true,
    user_request: true,
  };
  const LARGE_FIELD_KEYS: Record<string, true> = {
    deliverable_artifacts: true,
    plan: true,
    plan_content: true,
    planContent: true,
  };

  if (typeof resolved === "object" && resolved !== null) {
    const obj: Record<string, unknown> = { ...resolved };
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (typeof val === "string") {
        if (key === "unified_diff" || key === "gitDiff" || key === "diff") {
          obj[key] = summarizeUnifiedDiff(val, 14000);
        } else {
          const fieldLimit = LARGE_FIELD_KEYS[key] ? 5000 : 2000;
          const clampMode = TAIL_KEYS[key] ? "tail" : "head";
          if (val.length > fieldLimit) {
            obj[key] = clampEnclosedOrRaw(val, fieldLimit, clampMode);
          }
        }
      }
    }

    let serialized = JSON.stringify(obj);
    if (serialized.length > 28000) {
      for (const diffK of ["unified_diff", "gitDiff", "diff"]) {
        if (typeof obj[diffK] === "string" && (obj[diffK] as string).length > 10000) {
          obj[diffK] = summarizeUnifiedDiff(obj[diffK] as string, 10000);
        }
      }
      serialized = JSON.stringify(obj);
    }
    if (serialized.length > 28000) {
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (
          typeof val === "string" &&
          key !== "unified_diff" &&
          key !== "gitDiff" &&
          key !== "diff" &&
          val.length > 1500
        ) {
          obj[key] = clampEnclosedOrRaw(val, 1500, TAIL_KEYS[key] ? "tail" : "head");
        }
      }
    }
    return obj;
  }

  if (typeof resolved === "string") {
    if (resolved.startsWith("diff --git") || resolved.includes("\n--- a/") || resolved.includes("\n+++ b/")) {
      return summarizeUnifiedDiff(resolved, 14000);
    }
    if (resolved.startsWith("<plan_evaluation_state>") && resolved.endsWith("</plan_evaluation_state>")) {
      if (resolved.length > 14000) {
        const clamped = clampEnclosedOrRaw(resolved, 14000, "head");
        if (!clamped.endsWith("</plan_evaluation_state>")) {
          const closeTag = "\n</plan_evaluation_state>";
          return clampText(resolved, 14000 - closeTag.length, "head") + closeTag;
        }
        return clamped;
      }
      return resolved;
    }
    if (resolved.length > 6000) {
      return clampEnclosedOrRaw(resolved, 6000);
    }
  }

  return resolved;
}

export function collectConversationContext(ctx: unknown): {
  userRequest: string;
  agentWorkLog: string;
  lastTestSummary?: string;
} {
  if (!ctx || typeof ctx !== "object") {
    return { userRequest: "", agentWorkLog: "" };
  }

  const ctxRecord = ctx as Record<string, unknown>;
  const directUserReq = typeof ctxRecord.userRequest === "string" ? ctxRecord.userRequest : "";
  const directWorkLog = typeof ctxRecord.agentWorkLog === "string" ? ctxRecord.agentWorkLog : "";
  const sessionManager = ctxRecord.sessionManager;
  if (!sessionManager || typeof sessionManager !== "object") {
    return { userRequest: directUserReq, agentWorkLog: directWorkLog };
  }

  const smRecord = sessionManager as Record<string, unknown>;
  if (typeof smRecord.getBranch !== "function") {
    return { userRequest: directUserReq, agentWorkLog: directWorkLog };
  }

  try {
    const branch = smRecord.getBranch() as unknown;
    if (!Array.isArray(branch)) {
      return { userRequest: directUserReq, agentWorkLog: directWorkLog };
    }

    const userMessages: string[] = [];
    const assistantMessages: string[] = [];
    let lastTestSummary: string | undefined;

    for (const entry of branch) {
      if (!entry || typeof entry !== "object") continue;
      const entryRecord = entry as Record<string, unknown>;

      if (entryRecord.type === "custom_message") {
        const customType = typeof entryRecord.customType === "string" ? entryRecord.customType : "";
        const rawContent = typeof entryRecord.content === "string" ? entryRecord.content.trim() : "";
        if (customType === "skill-prompt" && rawContent.length > 0) {
          const userMatch = rawContent.match(/\nUser:\s*([\s\S]+)$/);
          const extractedUser = userMatch ? userMatch[1].trim() : rawContent;
          if (extractedUser.length > 0) {
            userMessages.push(extractedUser);
          }
        } else if (customType === "advisor" && rawContent.length > 0) {
          assistantMessages.push(`[Advisor]: ${rawContent}`);
        }
        continue;
      }

      if (entryRecord.type !== "message" || !entryRecord.message || typeof entryRecord.message !== "object") {
        continue;
      }
      const msg = entryRecord.message as Record<string, unknown>;
      let textContent = "";
      if (typeof msg.content === "string") {
        textContent = msg.content;
      } else if (Array.isArray(msg.content)) {
        const parts: string[] = [];
        for (const block of msg.content) {
          if (block && typeof block === "object") {
            const b = block as Record<string, unknown>;
            if (b.type === "text" && typeof b.text === "string" && b.text.trim().length > 0) {
              parts.push(b.text);
            } else if (msg.role === "assistant" && b.type === "thinking" && typeof b.thinking === "string" && b.thinking.trim().length > 0) {
              parts.push(b.thinking.trim());
            } else if (msg.role === "assistant" && b.type === "toolCall" && typeof b.name === "string") {
              const intentStr = typeof b.intent === "string" ? b.intent : (b.arguments && typeof b.arguments === "object" && typeof (b.arguments as Record<string, unknown>).i === "string" ? (b.arguments as Record<string, unknown>).i as string : "");
              parts.push(`[toolCall: ${b.name}${intentStr ? ` (${intentStr})` : ""}]`);
            }
          }
        }
        textContent = parts.join("\n");
      }

      const trimmed = textContent.trim();
      if (!trimmed) continue;

      if (msg.role === "user") {
        if (
          /^<system-notice>\s*Background job bg_/i.test(trimmed) ||
          /^Task completion rejected by TypeSafe/i.test(trimmed) ||
          /^📋 TypeSafe task report/u.test(trimmed) ||
          /\n📋 TypeSafe task report/u.test(trimmed)
        ) {
          if (/(?:bun test|npm test|vitest|jest|pytest|cargo test|go test|dotnet test|msbuild|node --test|\bRan \d+ tests\b|\b\d+ pass(?:ing|ed)?\b|SUCCESS: Baseline deployed)/i.test(trimmed)) {
            lastTestSummary = clampText(trimmed, 2000, "tail");
          }
          const bgMatch = trimmed.match(/<system-notice>([\s\S]*?)<\/system-notice>/);
          if (bgMatch && bgMatch[1]) {
            assistantMessages.push(`[backgroundJob]: ${clampText(bgMatch[1].trim(), 400, "tail")}`);
          }
        } else {
          const userMatch = trimmed.match(/\nUser:\s*([\s\S]+)$/);
          const extracted = (userMatch ? userMatch[1] : trimmed)
            .replace(/<system-notice>[\s\S]*?<\/system-notice>/g, "")
            .trim();
          if (extracted.length > 0 && extracted.toLowerCase() !== "retry") {
            userMessages.push(extracted);
          }
        }
      } else if (msg.role === "assistant") {
        assistantMessages.push(trimmed);
      } else if (msg.role === "toolResult" && !msg.isError) {
        const tName = typeof msg.toolName === "string" ? msg.toolName : "tool";
        const clampedResult = trimmed.includes("<task-result")
          ? clampText(trimmed, 1200, "head")
          : clampText(trimmed, 400, "tail");
        assistantMessages.push(`[toolResult:${tName}]: ${clampedResult}`);
        if (
          (tName === "bash" || tName === "eval") &&
          /(?:bun test|npm test|vitest|jest|pytest|cargo test|go test|dotnet test|msbuild|node --test|\bRan \d+ tests\b|\b\d+ pass(?:ing|ed)?\b|SUCCESS: Baseline deployed)/i.test(trimmed)
        ) {
          lastTestSummary = clampText(trimmed, 2000, "tail");
        }
      }
    }

    const lastUser = userMessages.length > 0 ? userMessages.slice(-2).join("\n---\n") : directUserReq;
    const lastAssistant = assistantMessages.length > 0 ? assistantMessages.slice(-8).join("\n---\n") : directWorkLog;

    return {
      userRequest: clampText(lastUser, 2000, "tail"),
      agentWorkLog: clampText(lastAssistant, 3000, "tail"),
      lastTestSummary,
    };
  } catch {
    return { userRequest: directUserReq, agentWorkLog: directWorkLog };
  }
}

export interface TaskReport {
  kind: "DONE" | "DROP";
  tasks: string[];
  approved: boolean;
  decidedBy: "judge" | "human" | "host-authorization" | "gate1";
  scores?: {
    meetsCriteria?: number;
    drift?: string;
    scope?: string;
    verdict?: string;
    confidence?: number;
    taskType?: string;
    dropJustified?: number;
  };
  diffScope?: string;
  changedFiles?: string[];
  test?: string;
  reasons: string[];
}

export function formatTaskReport(r: TaskReport): string {
  const tasksFormatted = r.tasks.map((t) => `"${t}"`).join(", ");
  const lines: string[] = [
    `📋 TypeSafe task report — ${r.kind} ${tasksFormatted}`,
    `Decision: ${r.approved ? "APPROVED" : "REJECTED"} (by: ${r.decidedBy})`,
  ];

  if (r.scores) {
    if (r.scores.meetsCriteria !== undefined) {
      const extras: string[] = [];
      if (r.scores.verdict) extras.push(`verdict=${r.scores.verdict}`);
      if (r.scores.taskType) extras.push(`task_type=${r.scores.taskType}`);
      const suffix = extras.length > 0 ? ` | ${extras.join(" | ")}` : "";
      lines.push(
        `Judge: meets_criteria=${r.scores.meetsCriteria.toFixed(2)} | drift=${r.scores.drift || "none"} | scope=${r.scores.scope || "none"}${suffix}`
      );
    }
    if (r.scores.dropJustified !== undefined) {
      const dropVerdictSuffix = r.scores.verdict ? ` | verdict=${r.scores.verdict}` : "";
      lines.push(
        `Judge: drop_justified=${r.scores.dropJustified.toFixed(2)}${dropVerdictSuffix}`
      );
    }
  }

  const evidenceParts: string[] = [];
  if (r.diffScope) {
    evidenceParts.push(`diff_scope=${r.diffScope}`);
  }
  if (r.changedFiles) {
    if (r.changedFiles.length === 0) {
      evidenceParts.push("files changed: none");
    } else if (r.changedFiles.length <= 10) {
      evidenceParts.push(`files changed: ${r.changedFiles.join(", ")}`);
    } else {
      const top10 = r.changedFiles.slice(0, 10).join(", ");
      const remainder = r.changedFiles.length - 10;
      evidenceParts.push(`files changed: ${top10} (+${remainder} more)`);
    }
  }
  if (r.test) {
    evidenceParts.push(`tests: ${r.test}`);
  }
  if (evidenceParts.length > 0) {
    lines.push(`Evidence: ${evidenceParts.join("; ")}`);
  }

  if (r.reasons && r.reasons.length > 0) {
    lines.push("Reasons:");
    for (const reason of r.reasons) {
      lines.push(`- ${reason}`);
    }
  }

  return lines.join("\n");
}



export function normalizeQuestionForTypeSafe(
  questions: Record<string, TypeSafeQuestion>
): Record<string, TypeSafeQuestion> {
  if (!questions || typeof questions !== "object" || Array.isArray(questions)) {
    return questions;
  }
  const normalized: Record<string, TypeSafeQuestion> = {};
  for (const [key, q] of Object.entries(questions)) {
    if (!q || typeof q !== "object") {
      normalized[key] = q;
      continue;
    }
    const newQ: TypeSafeQuestion = { ...q };
    if (newQ.type === "choice" && Array.isArray(newQ.criteria)) {
      const criteriaObj: Record<string, string> = {};
      for (let i = 0; i < newQ.criteria.length; i++) {
        const item = newQ.criteria[i];
        if (typeof item === "string") {
          const match = item.match(/^([^:\-]+)[:\-]\s*(.+)$/);
          if (match) {
            criteriaObj[match[1].trim()] = match[2].trim();
          } else {
            criteriaObj[`option_${i}`] = item.trim();
          }
        } else {
          criteriaObj[`option_${i}`] = String(item);
        }
      }
      newQ.criteria = criteriaObj;
    } else if (newQ.type === "noul" && Array.isArray(newQ.criteria)) {
      const stripBoolPrefix = (s: string, prefix: "true" | "false") =>
        s.replace(new RegExp(`^\\s*${prefix}\\s*[:\\-]\\s*`, "i"), "").trim();
      if (newQ.criteria.length >= 2) {
        newQ.criteria = {
          true: stripBoolPrefix(String(newQ.criteria[0]), "true"),
          false: stripBoolPrefix(String(newQ.criteria[1]), "false"),
        };
      } else if (newQ.criteria.length === 1) {
        const cleaned = stripBoolPrefix(String(newQ.criteria[0]), "true");
        newQ.criteria = {
          true: cleaned,
          false: `Not ${cleaned}`,
        };
      }
    } else if (newQ.type === "score" && Array.isArray(newQ.criteria)) {
      newQ.criteria = newQ.criteria.map((c) => (typeof c === "string" ? c : String(c)));
    }
    normalized[key] = newQ;
  }
  return normalized;
}

export function hasActiveEGC(cwd: string): boolean {
  return (
    process.env.EGC_ACTIVE === "1" ||
    existsSync(path.join(cwd, ".omp", "egc.json"))
  );
}

const OPEN_TODO_STATUSES = new Set<CanonicalTodoTask["status"]>(["pending", "in_progress", "blocked"]);
const MUTATING_TODO_OPS = new Set(["init", "start", "done", "rm", "drop", "block", "unblock", "append"]);
const TODO_STAGE_TTL_MS = 60_000;
const TODO_TOMBSTONE_LIMIT = 128;
const TODO_STAGE_LIMIT = 32;

function cloneTodoPhases(phases: CanonicalTodoPhase[]): CanonicalTodoPhase[] {
  return phases.map((phase) => ({ name: phase.name, tasks: phase.tasks.map((task) => ({ ...task })) }));
}

function activeTasksFromPhases(phases: CanonicalTodoPhase[]): Set<string> {
  const tasks = new Set<string>();
  for (const phase of phases) {
    for (const task of phase.tasks) {
      if (OPEN_TODO_STATUSES.has(task.status)) tasks.add(task.content);
    }
  }
  return tasks;
}

function canonicalTodoInputHash(params: Record<string, unknown>): string {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, canonicalize(nested)])
      );
    }
    return value;
  };
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(params))).digest("hex");
}

function taskMatches(phases: CanonicalTodoPhase[], taskName: string): CanonicalTodoTask[] {
  for (const phase of phases) {
    const task = phase.tasks.find((candidate) => candidate.content === taskName);
    if (task) return [task];
  }
  return [];
}

function phaseMatches(phases: CanonicalTodoPhase[], phaseName: string): CanonicalTodoTask[] {
  return phases.find((phase) => phase.name === phaseName)?.tasks ?? [];
}

function allTodoTasks(phases: CanonicalTodoPhase[]): CanonicalTodoTask[] {
  return phases.flatMap((phase) => phase.tasks);
}


export interface GateRejectionOptions {
  gate: "Gate 1 Micro-Check" | "Gate 2 Macro-Check";
  taskId: string;
  reasons: string[];
  testCommand?: string;
  testExitCode?: number | null;
  planRequirements?: string[];
  scores?: {
    meetsCriteria?: number;
    drift?: string;
    scope?: string;
  };
  isUnavailable?: boolean;
  testEvasion?: boolean;
}

function sanitizeSafe(text: string): string {
  return sanitizeXmlText(text).replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildGateRejectionMessage(opts: GateRejectionOptions): string {
  const safeTaskId = clampText(sanitizeSafe(opts.taskId), 200, "head");
  const safeTestCmd = opts.testCommand ? `$ ${clampText(sanitizeSafe(opts.testCommand), 200, "head")}` : "testCommand";
  const reasonsList = opts.reasons.length > 0 ? opts.reasons : ["Verification rejected without specific reason details."];
  const reasonLines = reasonsList.map((r) => `- ${clampText(sanitizeSafe(r), 400, "head")}`).join("\n");
  const actions: string[] = [];

  if (opts.isUnavailable) {
    actions.push(
      "1. TypeSafe evaluation service is unavailable. Do NOT alter codebase or tests evasively.",
      "2. Verify network connectivity and TYPESAFE_API_KEY environment configuration, or report outage to user."
    );
  } else if (opts.gate.includes("Gate 1")) {
    let actNum = 1;
    const reasonsLower = opts.reasons.join(" ").toLowerCase();
    if (
      reasonsLower.includes("test suite failed") ||
      (opts.testExitCode !== null && opts.testExitCode !== undefined && opts.testExitCode !== 0)
    ) {
      actions.push(
        `${actNum++}. Run ${safeTestCmd} locally to verify all assertions pass with clean exit code 0 before re-attempting completion.`
      );
    }
    if (opts.testEvasion) {
      actions.push(
        `${actNum++}. Review removed coverage or meaningful behavior before re-attempting completion. Deleting or weakening tests to fake completion is prohibited.`
      );
    }
    if (reasonsLower.includes("zero evidence")) {
      actions.push(
        `${actNum++}. Produce real implementation code changes or execute tests for "${safeTaskId}". Zero changes/tests observed.`
      );
    }
    if (actions.length === 0) {
      actions.push(
        `${actNum++}. Fix test failures or build errors identified above.`,
        `${actNum++}. Run testCommand locally to verify all assertions pass cleanly before re-attempting completion.`
      );
    }
    actions.push(`${actNum++}. Do NOT retry 'todo done' without modifying code or fixing test failures.`);
  } else {
    let actNum = 1;
    const reasonsLower = opts.reasons.join(" ").toLowerCase();
    if (opts.scores?.meetsCriteria !== undefined) {
      const scoreStr = `meets_criteria=${opts.scores.meetsCriteria.toFixed(2)}, drift=${opts.scores.drift || "none"}, scope=${opts.scores.scope || "none"}`;
      actions.push(`[Judge Evaluation]: ${scoreStr}`);
    }
    if (opts.scores?.scope === "REDUCTION" || reasonsLower.includes("scope reduction")) {
      const reqSnippet =
        opts.planRequirements && opts.planRequirements.length > 0
          ? ` Requirements: ${opts.planRequirements.slice(0, 3).map((r) => `"${clampText(sanitizeSafe(r), 300, "head")}"`).join(", ")}`
          : "";
      actions.push(
        `${actNum++}. Address omitted deliverables for "${safeTaskId}": complete all planned implementation criteria in-place.${reqSnippet}`
      );
    }
    if (opts.scores?.drift && opts.scores.drift !== "no_drift") {
      actions.push(
        `${actNum++}. Resolve architectural drift (${opts.scores.drift}): confine modifications strictly to planned task contracts.`
      );
    }
    if (actions.length === 0 || (actions.length === 1 && actions[0].startsWith("[Judge"))) {
      actions.push(
        `${actNum++}. Align implementation changes with the plan requirements.`,
        `${actNum++}. Re-read the phase acceptance criteria and remove any uncontracted drift.`
      );
    }
    actions.push(
      `${actNum++}. Do NOT retry 'todo done' immediately without implementing missing deliverables or addressing the above findings.`
    );
  }

  const msg = `Task completion rejected by TypeSafe Dual Verification Gate (${opts.gate}):\n${reasonLines}\nNEXT ACTIONS FOR AGENT:\n${actions.join("\n")}`;

  return clampText(msg, 3500, "head");
}
async function safeSendMessage(
  pi: { sendMessage: (msg: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<unknown> | unknown },
  msg: Record<string, unknown>,
  opts?: Record<string, unknown>
): Promise<void> {
  try {
    if (pi && typeof pi.sendMessage === "function") {
      await Promise.resolve(pi.sendMessage(msg, opts));
    }
  } catch {}
}

export async function assertNoActiveContractedTasks(
  state: PlannerSessionState,
  actionName: string,
  evt: Record<string, unknown>,
  pi: { sendMessage: (msg: Record<string, unknown>) => Promise<unknown> }
): Promise<void> {
  if (state.uninitialized || state.stagedCalls.size > 0 || state.activeContractedTasks.size > 0) {
    const openTasks = Array.from(state.activeContractedTasks);
    const pending = state.stagedCalls.size > 0 ? `; pending todo operation(s): ${state.stagedCalls.size}` : "";
    const msg = `Plan closure rejected by TypeSafe Dual Verification Gate:
- ${actionName} (${openTasks.join(", ") || "state rehydration required"}${pending}).
NEXT ACTIONS FOR AGENT:
1. Resolve all uncompleted tasks and settle pending todo operations.
2. Ensure test assertions pass cleanly before marking the plan completed.`;
    if (typeof evt.cancel === "function") {
      (evt.cancel as (reason: string) => void)(msg);
    }
    await safeSendMessage(
      pi,
      { customType: "typesafe-compliance-escalation", content: msg },
      { deliverAs: "steer" }
    );
    throw new Error(msg);
  }
}
export interface DebatePersonaVerdict {
  score: number;
  verdict?: string;
}

export interface MultiPersonaDebateResult {
  approved: boolean;
  modelTier: "fast";
  personas: {
    architect: DebatePersonaVerdict;
    security: DebatePersonaVerdict;
    performance: DebatePersonaVerdict;
    ux: DebatePersonaVerdict;
    devils_advocate: DebatePersonaVerdict;
  };
  consensusScore: number;
  reasons: string[];
}

export interface DebateJudgeClient {
  evaluateDebate: (params: {
    state: string;
    questions: Record<string, TypeSafeQuestion>;
    model?: string;
  }) => Promise<{
    answers?: Record<string, { score: number; verdict?: string }>;
    modelUsed?: string;
    error?: string;
  }>;
}

export function constructMultiPersonaQuestions(): Record<string, TypeSafeQuestion> {
  return {
    architect: {
      type: "score",
      instructions:
        "Architect Persona: Evaluate architectural soundness, separation of concerns, and component boundary integrity.",
      criteria: [
        "Critically flawed architecture with broken modularity",
        "Basic architecture with partial separation",
        "Sound architecture with clean modular boundaries",
        "Exemplary architecture with high maintainability",
      ],
    },
    security: {
      type: "score",
      instructions:
        "Security Persona: Evaluate threat surface, credential protection, boundary isolation, and attack resilience.",
      criteria: [
        "Severe security vulnerability or credentials exposed",
        "Marginal security with weak invariants",
        "Secure design with robust boundary isolation",
        "Hardened zero-trust security posture",
      ],
    },
    performance: {
      type: "score",
      instructions:
        "Performance Persona: Evaluate computational complexity, latency bottlenecks, memory footprint, and token waste.",
      criteria: [
        "Excessive latency, runaway memory, or massive token waste",
        "Adequate performance with unoptimized hot paths",
        "Efficient execution with bounded resource consumption",
        "Optimal performance with zero unnecessary overhead",
      ],
    },
    ux: {
      type: "score",
      instructions:
        "UX/DX Persona: Evaluate developer experience, API ergonomics, debuggability, and diagnostic clarity.",
      criteria: [
        "Confusing API, poor DX, uninformative errors",
        "Acceptable ergonomics with minor friction",
        "Clear, ergonomic design with descriptive diagnostics",
        "Intuitive, seamless DX with crystal-clear feedback",
      ],
    },
    devils_advocate: {
      type: "score",
      instructions:
        "Devil's Advocate Persona: Challenge hidden assumptions, single points of failure, missing rollback paths, and edge cases.",
      criteria: [
        "Fatal blindspots and unhandled single points of failure",
        "Significant unstated assumptions or missing fallback paths",
        "Minor manageable edge cases",
        "Resilient against adversarial edges and unexpected states",
      ],
    },
  };
}

export async function runMultiPersonaDebate(
  planContent: string,
  client?: DebateJudgeClient
): Promise<MultiPersonaDebateResult> {
  const questions = constructMultiPersonaQuestions();
  const state = JSON.stringify({
    plan: planContent,
    context: "Multi-Persona Pre-Analysis Debate (ck:predict)",
  });

  let response: {
    answers?: Record<string, { score: number; verdict?: string }>;
    modelUsed?: string;
    error?: string;
  };

  if (client && typeof client.evaluateDebate === "function") {
    response = await client.evaluateDebate({
      state,
      questions,
      model: process.env.TYPESAFE_PREDICT_MODEL || "jev-latest",
    });
  } else {
    response = {
      modelUsed: process.env.TYPESAFE_PREDICT_MODEL || "jev-latest",
      error: "TypeSafe debate client is unavailable",
    };
  }

  const answers = response.answers || {};
  const requiredPersonas = ["architect", "security", "performance", "ux", "devils_advocate"];
  const unavailable = Boolean(response.error) || requiredPersonas.some((persona) => {
    const answer = answers[persona];
    return !answer || !Number.isFinite(answer.score);
  });
  const architectScore = unavailable ? 0 : answers.architect.score;
  const securityScore = unavailable ? 0 : answers.security.score;
  const performanceScore = unavailable ? 0 : answers.performance.score;
  const uxScore = unavailable ? 0 : answers.ux.score;
  const devilsScore = unavailable ? 0 : answers.devils_advocate.score;

  const personas = {
    architect: { score: architectScore, verdict: answers.architect?.verdict },
    security: { score: securityScore, verdict: answers.security?.verdict },
    performance: { score: performanceScore, verdict: answers.performance?.verdict },
    ux: { score: uxScore, verdict: answers.ux?.verdict },
    devils_advocate: { score: devilsScore, verdict: answers.devils_advocate?.verdict },
  };

  const consensusScore =
    (architectScore + securityScore + performanceScore + uxScore + devilsScore) / 5;

  const reasons: string[] = [];
  if (unavailable) {
    reasons.push(`TypeSafe debate unavailable: ${response.error || "required persona scores were missing or invalid"}.`);
  }
  if (consensusScore < 1.5) {
    reasons.push(
      `Multi-persona debate consensus score (${consensusScore.toFixed(2)}) is below 1.50 minimum threshold.`
    );
  }
  if (securityScore < 1) {
    reasons.push(
      "Security Persona rejected plan: critical security vulnerabilities or credential exposure detected."
    );
  }
  if (devilsScore < 1) {
    reasons.push(
      "Devil's Advocate Persona rejected plan: fatal unhandled blindspots or unstated assumptions."
    );
  }
  if (architectScore < 1) {
    reasons.push(
      "Architect Persona rejected plan: severe architectural flaws or boundary violations."
    );
  }

  const approved = reasons.length === 0;

  return {
    approved,
    modelTier: "fast",
    personas,
    consensusScore,
    reasons,
  };
}


export default function registerExtension(
  pi: ExtensionAPI,
  options: ExtensionRuntimeOptions = {}
): PlannerSessionState {
  const resolverOptions: PlannerSessionState["resolverOptions"] = {
    homeDir: options.homeDir ?? os.homedir(),
    env: options.env ?? process.env,
  };
  const state: PlannerSessionState = {
    resolverOptions,
    generation: 0,
    revision: 0,
    phases: [],
    get activeContractedTasks() {
      return activeTasksFromPhases(this.phases);
    },
    taskBaselines: new Map<string, WorkspaceSnapshot>(),
    pendingRemediations: new Map<string, PendingRemediation>(),
    consecutiveFailuresByTask: new Map<string, number>(),
    lastFailureReasonByTask: new Map<string, string>(),
    stagedCalls: new Map<string, StagedTodoCall>(),
    committedCallTombstones: new Map<string, CommittedTodoCall>(),
    uninitialized: false,
  };
  const z = pi.zod;
  let originProofEmitted = false;

  // Session pre-flight probe is diagnostic only; todo state is always owned by
  // this factory's returned PlannerSessionState.
  const PROMPT_INJECTION =
    "TypeSafe System One is integrated into the host for all human handoffs and task completions. Mutations (todo done, drop, plan updates) are governed by the Bicameral Consensus Engine: Lobe 1 (Advisor Intent) evaluates user intent and work logs, and Lobe 2 (JEV Judge) evaluates code diffs and test proofs. When a tool call or verification returns red notices with NEXT ACTIONS FOR AGENT or <plan_reconciliation>, you MUST execute the required actions autonomously: run relevant skills (ck:problem-solving, ck:plan, ck:research) to analyze, adapt plan.md and todo, and implement required deliverables. NEVER call 'ask' or ask human confirmation when actionable NEXT ACTIONS are provided. Human escalation is strictly reserved for irreconcilable conflicts where sovereign human confirmation is required.";
  // Session Pre-Flight Health Probe (Phase 3): event-driven diagnostic probe on session_start.
  pi.on("session_start", async (_event: unknown, ctx: unknown) => {
    invalidateTodoState(ctx);
    const agent = (ctx as Record<string, unknown> | undefined)?.agent as Record<string, unknown> | undefined;
    if (agent?.kind === "sub") return;
    if (!originProofEmitted) {
      originProofEmitted = true;
      await pi.sendMessage({
        customType: "typesafe-health",
        content: JSON.stringify(getRuntimeOriginProof()),
        display: false,
      }).catch(() => {});
    }
    try {
      const apiKey = resolverOptions.env.TYPESAFE_API_KEY?.trim() || "";
      if (!apiKey) return;

      const resolverModule = loadResolverModule();
      const apiClientModule = loadApiClientModule();
      if (!resolverModule || !apiClientModule) return;

      const projectDir = getProjectDir(ctx);
      const { enabled } = resolverModule.resolveTypeSafeEnabled(projectDir, resolverOptions);
      if (!enabled) return;

      const extCtx = ctx as unknown as { ui?: { notify?: (msg: string, type: string) => void } };
      const cooldown = apiClientModule.checkCredentialCooldown(apiKey);
      if (cooldown) {
        extCtx.ui?.notify?.("TypeSafe warning: diagnostic probe skipped while the credential is unavailable.", "warning");
        return;
      }

      const probePayload = JSON.stringify({
        state: "ping",
        questions: { ping: { type: "noul", instructions: "ping" } },
        model: "jev-latest",
      });
      const outcome = await apiClientModule.requestWithRetry({
        fetchImpl: globalThis.fetch,
        apiKey,
        body: probePayload,
        timeoutMs: 3000,
        totalBudgetMs: 3000,
        maxAttempts: 1,
      });
      if (outcome.kind === "ok") {
        extCtx.ui?.notify?.("TypeSafe: ONLINE (jev-latest)", "info");
        await pi.sendMessage({
          customType: "typesafe-health",
          content: "TypeSafe: ONLINE (jev-latest)",
          display: true,
        }).catch(() => {});
        await pi.sendMessage(
          { customType: "typesafe-planner", content: PROMPT_INJECTION, display: false },
          { deliverAs: "nextTurn" }
        ).catch(() => {});
        return;
      }

      const message = outcome.kind === "auth"
        ? "TypeSafe warning: TYPESAFE_API_KEY is invalid or expired. Check your environment configuration."
        : outcome.kind === "http_error" && outcome.status === 404
          ? "TypeSafe warning: TypeSafe API routing failed (404). Check models.yml baseUrl configuration."
          : outcome.kind === "http_error"
            ? `TypeSafe warning: Pre-flight diagnostic probe failed (HTTP status ${outcome.status}).`
            : "TypeSafe warning: Pre-flight diagnostic probe returned an invalid response.";
      extCtx.ui?.notify?.(message, "warning");
      await pi.sendMessage({
        customType: "typesafe-health",
        content: message,
        display: true,
      }).catch(() => {});
    } catch {
      const message = "TypeSafe warning: TypeSafe API unreachable. Check internet connection or proxy settings.";
      await pi.sendMessage({ customType: "typesafe-health", content: message, display: true }).catch(() => {});
    }
  });
  function phasesFromBranch(ctx: unknown): CanonicalTodoPhase[] | undefined {
    const manager = (ctx as Record<string, unknown> | undefined)?.sessionManager as Record<string, unknown> | undefined;
    const entries = typeof manager?.getBranch === "function" ? manager.getBranch() : undefined;
    if (!Array.isArray(entries)) return undefined;
    for (const entry of [...entries].reverse()) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const customPhases =
        record.customType === "user_todo_edit" &&
        record.data &&
        typeof record.data === "object" &&
        (record.data as Record<string, unknown>).phases;
      const result = (record.message && typeof record.message === "object" ? record.message : record) as Record<string, unknown>;
      const details = result.details as Record<string, unknown> | undefined;
      const resultPhases =
        result.toolName === "todo" && !result.isError && details?.op !== "view" ? details?.phases : undefined;
      const phases = customPhases ?? resultPhases;
      if (Array.isArray(phases)) return cloneTodoPhases(phases as CanonicalTodoPhase[]);
    }
    return undefined;
  }

  function pruneTodoTransactions(now = Date.now()): void {
    for (const [callId, stage] of state.stagedCalls) {
      if (now - stage.createdAt > TODO_STAGE_TTL_MS) state.stagedCalls.delete(callId);
    }
    for (const [callId, tombstone] of state.committedCallTombstones) {
      if (now - tombstone.committedAt > TODO_STAGE_TTL_MS) state.committedCallTombstones.delete(callId);
    }
  }

  function refreshTodoState(ctx: unknown): void {
    const phases = phasesFromBranch(ctx);
    if (!phases) return;
    if (JSON.stringify(phases) !== JSON.stringify(state.phases)) {
      state.phases = phases;
      state.revision++;
      state.stagedCalls.clear();
      state.uninitialized = false;
    }
  }

  function invalidateTodoState(ctx: unknown): void {
    state.generation++;
    state.revision++;
    state.stagedCalls.clear();
    state.committedCallTombstones.clear();
    state.taskBaselines.clear();
    state.pendingRemediations.clear();
    state.consecutiveFailuresByTask.clear();
    state.lastFailureReasonByTask.clear();
    state.lastCheckpoint = undefined;
    state.phases = phasesFromBranch(ctx) ?? [];
    state.uninitialized = false;
  }

  function cancelTodoCall(evt: Record<string, unknown>, code: string): never {
    if (typeof evt.cancel === "function") (evt.cancel as (reason: string) => void)(code);
    throw new Error(code);
  }

  async function stageNativeTodoCall(evt: Record<string, unknown>, ctx: unknown): Promise<void> {
    if (hasActiveEGC(getProjectDir(ctx))) return;
    const params = (evt.params || evt.args || evt.input || {}) as Record<string, unknown>;
    if ("ops" in params) cancelTodoCall(evt, "todo_ops_unsupported");
    refreshTodoState(ctx);
    if (state.uninitialized) cancelTodoCall(evt, "todo_state_uninitialized");
    pruneTodoTransactions();
    const inferredOp = typeof params.op === "string"
      ? params.op
        : Array.isArray(params.list) && params.list.length > 0
          ? "init"
          : Array.isArray(params.items) && params.items.length > 0
            ? (typeof params.phase === "string" && params.phase.trim() ? "append" : "init")
            : undefined;
    if (!inferredOp || !MUTATING_TODO_OPS.has(inferredOp)) return;
    const callId = typeof evt.toolCallId === "string" ? evt.toolCallId : "";
    if (!callId) cancelTodoCall(evt, "todo_call_id_missing");
    const inputHash = canonicalTodoInputHash(params);
    if (state.stagedCalls.has(callId) || state.committedCallTombstones.has(callId)) {
      cancelTodoCall(evt, "todo_call_id_duplicate");
    }
    if (state.stagedCalls.size >= TODO_STAGE_LIMIT) cancelTodoCall(evt, "todo_stage_capacity_exhausted");

    let targets: CanonicalTodoTask[] = [];
    const taskName = typeof params.task === "string" ? params.task : "";
    const phaseName = typeof params.phase === "string" ? params.phase : "";
    if (["done", "drop", "rm", "block", "unblock", "start"].includes(inferredOp)) {
      targets = taskName ? taskMatches(state.phases, taskName) : phaseName ? phaseMatches(state.phases, phaseName) : allTodoTasks(state.phases);
      if ((inferredOp === "block" || inferredOp === "unblock" || inferredOp === "start") && !taskName && !phaseName) {
        return;
      }
      if ((taskName || phaseName) && targets.length === 0) return;
    }
    if (inferredOp === "done") targets = targets.filter((task) => task.status !== "completed");
    const replacedTasks = inferredOp === "init"
      ? allTodoTasks(state.phases).map((task) => task.content)
      : [];
    const destructiveTargets = inferredOp === "init"
      ? allTodoTasks(state.phases)
      : ["drop", "rm"].includes(inferredOp)
        ? targets
        : [];
    const ctxRecord = (ctx as Record<string, unknown> | undefined) ?? {};
    const initialGeneration = state.generation;
    const initialRevision = state.revision;
    const hostAuthorized = ctxRecord.isHuman === true;
    let humanConfirmed = false;
    if (destructiveTargets.length > 0 && !hostAuthorized) {
      const apiKey = resolverOptions.env.TYPESAFE_API_KEY?.trim() || "";
      const resolverModule = loadResolverModule();
      const projectDir = getProjectDir(ctx);
      if (!apiKey || !resolverModule?.resolveTypeSafeEnabled(projectDir, resolverOptions).enabled) {
        cancelTodoCall(evt, "typesafe_verification_unavailable");
      }
      const conversation = collectConversationContext(ctx);
      const decision = await runBicameralDropCheck(
        {
          tasks: destructiveTargets.map((task) => task.content),
          reason: typeof params.reason === "string" ? params.reason : undefined,
          userRequest: conversation.userRequest,
          agentWorkLog: conversation.agentWorkLog,
          remainingTasks: allTodoTasks(state.phases)
            .filter((task) => !destructiveTargets.includes(task))
            .map((task) => task.content),
          planContext: state.phases.map((phase) => `${phase.name}: ${phase.tasks.map((task) => task.content).join(", ")}`),
        },
        createExtensionJudgeClient(apiKey, undefined, ctx)
      );
      if (state.generation !== initialGeneration || state.revision !== initialRevision) {
        cancelTodoCall(evt, "todo_state_revised");
      }
      if (decision.verdict === "AUTO_REJECT" || decision.verdict === "RECONCILE_PLAN") {
        cancelTodoCall(evt, `todo_drop_rejected: ${decision.reasons.join("; ")}`);
      }
      const confirm = (ctxRecord.ui as { confirm?: (title: string, message: string) => Promise<boolean> } | undefined)?.confirm;
      if (ctxRecord.hasUI !== true || typeof confirm !== "function") {
        cancelTodoCall(evt, "human_resolution_required");
      }
      try {
        humanConfirmed = await confirm(
          "TypeSafe: drop contracted task?",
          `Drop task(s): ${destructiveTargets.map((task) => task.content).join(", ")}. Approve this exact target set?\n\n${formatConsensusEscalation(decision)}`
        );
      } catch {
        cancelTodoCall(evt, "human_resolution_required");
      }
      if (!humanConfirmed) cancelTodoCall(evt, "human_resolution_required");
      if (state.generation !== initialGeneration || state.revision !== initialRevision) {
        cancelTodoCall(evt, "todo_state_revised");
      }
    }
    const verifiedHostAuthorization = hostAuthorized || humanConfirmed;
    const authorizationProvenance = hostAuthorized
      ? "host-authorization"
      : humanConfirmed
        ? "human"
        : "judge";
    if (
      inferredOp === "block" &&
      targets.some((task) => state.lastFailureReasonByTask.has(task.content) || state.pendingRemediations.has(task.content)) &&
      !verifiedHostAuthorization
    ) {
      cancelTodoCall(evt, "todo_block_unresolved_rejection");
    }
    const affectedTasks = targets.map((task) => task.content);
    const controller = new AbortController();
    const assertStageFresh = (): void => {
      if (controller.signal.aborted) cancelTodoCall(evt, "preflight_budget_exhausted");
      if (state.generation !== initialGeneration || state.revision !== initialRevision) {
        cancelTodoCall(evt, "todo_state_revised");
      }
    };
    const timer = setTimeout(() => controller.abort(), options.preflightBudgetMs ?? 22_000);
    let snapshot: WorkspaceSnapshot;
    try {
      snapshot = await captureWorkspaceSnapshot(getProjectDir(ctx), {
        signal: controller.signal,
        timeoutMs: options.preflightBudgetMs ?? 22_000,
      });
      assertStageFresh();
      if (inferredOp === "done" && affectedTasks.length > 0 && !verifiedHostAuthorization) {
        const testCommand = typeof params.testCommand === "string" ? params.testCommand : undefined;
        const testResult = testCommand
          ? await executeTestCommand(testCommand, getProjectDir(ctx), options.preflightBudgetMs ?? 22_000, controller.signal)
          : undefined;
        assertStageFresh();
        const evidenceByTask = new Map<string, TaskEvidenceResult>();
        for (const task of targets) {
          const evidence = await collectTaskEvidence({
            cwd: getProjectDir(ctx),
            taskId: task.content,
            testCommand,
            baseline: state.taskBaselines.get(task.content) ?? state.lastCheckpoint,
            afterSnapshot: snapshot,
            testResult,
            taskDoneProven: true,
            todoCompleted: true,
            signal: controller.signal,
          });
          assertStageFresh();
          evidenceByTask.set(task.content, evidence);
          const micro = await runTaskMicroCheck(evidence);
          assertStageFresh();
          if (!micro.passed) {
            assertStageFresh();
            state.lastFailureReasonByTask.set(task.content, micro.reasons.join("; "));
            state.consecutiveFailuresByTask.set(task.content, (state.consecutiveFailuresByTask.get(task.content) ?? 0) + 1);
            cancelTodoCall(evt, buildGateRejectionMessage({ gate: "Gate 1 Micro-Check", taskId: task.content, reasons: micro.reasons, testCommand, testExitCode: evidence.testExitCode, testEvasion: micro.testEvasion }));
          }
        }
        const apiKey = resolverOptions.env.TYPESAFE_API_KEY?.trim() || "";
        const resolverModule = loadResolverModule();
        const projectDir = getProjectDir(ctx);
        if (!apiKey || !resolverModule?.resolveTypeSafeEnabled(projectDir, resolverOptions).enabled) {
          cancelTodoCall(evt, "typesafe_verification_unavailable");
        }
        const client = createExtensionJudgeClient(apiKey, controller.signal, ctx);
        assertStageFresh();
        const conversation = collectConversationContext(ctx);
        for (const task of targets) {
          const evidence = evidenceByTask.get(task.content);
          const macro = await runBicameralMacroCheck(
            {
              todoTask: task.content,
              phaseTitle: phaseName || task.content,
              planRequirements: Array.isArray(params.requirements)
                ? params.requirements.filter((item): item is string => typeof item === "string")
                : [task.content],
              diffSummary: evidence?.gitStatus ?? "",
              unifiedDiff: evidence?.gitDiff ?? "",
              testSummary: testCommand ? `${testCommand}\nexit ${testResult?.exitCode ?? "not-run"}\n${testResult?.output ?? ""}` : "No testCommand provided.",
              attemptCount: state.consecutiveFailuresByTask.get(task.content) ?? 0,
              taskType: "code_change",
              deliverableArtifacts: await collectDeliverableArtifacts(projectDir),
              userRequest: conversation.userRequest,
              agentWorkLog: conversation.agentWorkLog,
              testCommand,
            },
            client
          );
          assertStageFresh();
          if (!macro.macroResult.approved) {
            assertStageFresh();
            state.lastFailureReasonByTask.set(task.content, macro.macroResult.reasons.join("; "));
            state.pendingRemediations.set(task.content, {
              taskId: task.content,
              gate: "Gate 2 Macro-Check",
              diffHash: hashToken(task.content + macro.macroResult.reasons.join("\n")),
              reasons: macro.macroResult.reasons,
              nextActions: macro.macroResult.reasons,
              timestamp: Date.now(),
            });
            cancelTodoCall(evt, buildGateRejectionMessage({ gate: "Gate 2 Macro-Check", taskId: task.content, reasons: macro.macroResult.reasons }));
          }
        }
      }
      assertStageFresh();
      const proposedReport: TaskReport = {
        kind: inferredOp === "done" ? "DONE" : "DROP",
        tasks: affectedTasks,
        approved: true,
        decidedBy: authorizationProvenance,
        reasons: [],
      };
      state.stagedCalls.set(callId, {
        toolCallId: callId,
        inputHash,
        generation: initialGeneration,
        revision: initialRevision,
        createdAt: Date.now(),
        op: inferredOp,
        affectedTasks,
        replacedTasks,
        verifiedTasks: inferredOp === "done" ? affectedTasks : [],
        workspaceSnapshot: snapshot,
        pendingReports: ["done", "drop", "rm"].includes(inferredOp) ? [proposedReport] : [],
        provenance: authorizationProvenance,
      });
    } finally {
      clearTimeout(timer);
    }
  }
  async function handleTodoInterception(event: unknown, ctx: unknown): Promise<void> {
    if (!event || typeof event !== "object") return;
    const evt = event as Record<string, unknown>;
    const toolName = (evt.tool || evt.name || evt.toolName) as string | undefined;
    if (toolName === "todo") {
      await stageNativeTodoCall(evt, ctx);
      return;
    }
    // Direct File Bypass Defense (RT-3) & Resource Integrity Shield (Phase 1)
    if (toolName === "write" || toolName === "edit") {
      const params = (evt.params || evt.args || evt.input || {}) as Record<string, unknown>;
      const targetPath = ((params.path as string) || (params.filepath as string) || "").trim();
      const normalizedPath = targetPath.replace(/\\/g, "/");
      const baseName = normalizedPath.split("/").pop() || "";

      // Plan Completion & Closure Guard (Phase 3)
      const inputContent = ((params.content as string) || (params.input as string) || "").trim();
      const isPlanFile =
        (!normalizedPath.includes("plans/reports/") && /plans[\/\\].*\.(md|markdown)$/i.test(normalizedPath)) ||
        baseName === "plan.md" ||
        /^phase-.*\.md$/i.test(baseName);
      const isClosingPlan = /(?:^|\n)\+?status:\s*complete(?:d)?\b/im.test(inputContent);

      if (isPlanFile && isClosingPlan) {
        refreshTodoState(ctx);
        pruneTodoTransactions();
        await assertNoActiveContractedTasks(state, "Uncompleted contracted tasks exist", evt as Record<string, unknown>, pi);
      }
      if (baseName === "todo.json" || baseName.startsWith(".todo")) {
        const msg = "Direct file modification of todo.json is prohibited. Task state must be managed via the todo tool.";
        if (typeof evt.cancel === "function") {
          (evt.cancel as (r: string) => void)(msg);
        }
        await pi.sendMessage({
          customType: "typesafe-compliance-escalation",
          content: msg,
        });
        throw new Error(msg);
      }
      if (normalizedPath.toLowerCase().includes(".omp/agent/extensions/typesafe-planner.ts")) {
        const msg = "Direct modification of the global OMP extension proxy (.omp/agent/extensions/typesafe-planner.ts) is prohibited. Work only within the workspace repository and deploy using `node tools/sync-baseline.cjs`.";
        if (typeof evt.cancel === "function") {
          (evt.cancel as (r: string) => void)(msg);
        }
        await pi.sendMessage({
          customType: "typesafe-compliance-escalation",
          content: msg,
        });
        throw new Error(msg);
      }

      const isTestEnv = process.env.BUN_ENV === "test" || process.env.NODE_ENV === "test";
      const resolvedTarget = path.resolve(getProjectDir(ctx), targetPath).replace(/\\/g, "/").toLowerCase();
      let isDevWorkspace = !isTestEnv;
      if (isDevWorkspace) {
        try {
          const pkgPath = path.join(getProjectDir(ctx), "package.json");
          const pkgName = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, "utf-8")).name : "";
          isDevWorkspace = pkgName === "omp-typesafe-extension" || pkgName === "omp_extension";
        } catch {
          isDevWorkspace = false;
        }
      }

      const isProtected = !isDevWorkspace && PROTECTED_INTEGRITY_PATTERNS.some((pattern) => {
        const patLower = pattern.toLowerCase();
        if (baseName.toLowerCase() === patLower) return true;
        if (normalizedPath.toLowerCase().endsWith("/" + patLower)) return true;
        try {
          const resolved = path.resolve(getProjectDir(ctx), targetPath).replace(/\\/g, "/");
          return resolved.toLowerCase().endsWith("/" + patLower) || resolved.toLowerCase() === patLower;
        } catch {
          return targetPath.toLowerCase().includes(patLower);
        }
      });

      if (isProtected) {
        const isAuthorizedContext =
          Boolean((ctx as Record<string, unknown> | undefined)?.isHuman) ||
          Boolean((ctx as Record<string, unknown> | undefined)?.authorized) ||
          process.env.TYPESAFE_ALLOW_MODIFICATION === "1";

        if (params.allowJudgeModification === true && isAuthorizedContext) {
          return;
        }
        const msg = `Direct file modification of protected TypeSafe infrastructure (${baseName || targetPath}) is prohibited without verified human authorization.`;
        if (typeof evt.cancel === "function") {
          (evt.cancel as (r: string) => void)(msg);
        }
        await pi.sendMessage({
          customType: "typesafe-integrity-violation",
          content: msg,
        });
        throw new Error(msg);
      }
      return;
    }

    // Human Decision Interception: Automatically evaluate any decision/question before it reaches the human
    if (toolName === "ask") {
      const params = (evt.params || evt.args || evt.input || {}) as Record<string, unknown>;
      const apiKey = resolverOptions.env.TYPESAFE_API_KEY?.trim() || "";
      const resolverModule = loadResolverModule();
      const projectDir = getProjectDir(ctx);
      const isEnabled = Boolean(apiKey && resolverModule && resolverModule.resolveTypeSafeEnabled(projectDir, resolverOptions).enabled);
      const convo = collectConversationContext(ctx);

      const firstQObj =
        Array.isArray(params.questions) && params.questions[0] && typeof params.questions[0] === "object"
          ? (params.questions[0] as Record<string, unknown>)
          : undefined;
      const primaryQuestionText =
        (typeof firstQObj?.question === "string" ? firstQObj.question : undefined) ||
        (typeof params.question === "string" ? params.question : undefined) ||
        (typeof params.i === "string" ? params.i : "Decision presented to human");
      const primaryOptions = Array.isArray(firstQObj?.options)
        ? (firstQObj.options as Array<string | AdvisorOptionCandidate>)
        : undefined;
      const primaryRecommended =
        typeof firstQObj?.recommended === "number" ? firstQObj.recommended : undefined;

      const advisor = evaluateAdvisorIntent({
        operation: "decision",
        task: primaryQuestionText,
        question: primaryQuestionText,
        options: primaryOptions,
        recommendedIndex: primaryRecommended,
        userRequest: convo.userRequest,
        agentWorkLog: convo.agentWorkLog,
      });

      if (Array.isArray(params.questions)) {
        for (const q of params.questions) {
          if (q && typeof q === "object") {
            const qObj = q as Record<string, unknown>;
            if (qObj.recommended === undefined && Array.isArray(qObj.options) && qObj.options.length > 0) {
              const qAdvisor = evaluateAdvisorIntent({
                operation: "decision",
                task: typeof qObj.question === "string" ? qObj.question : primaryQuestionText,
                question: typeof qObj.question === "string" ? qObj.question : primaryQuestionText,
                options: qObj.options as Array<string | AdvisorOptionCandidate>,
                userRequest: convo.userRequest,
                agentWorkLog: convo.agentWorkLog,
              });
              if (qAdvisor.recommendedIndex !== undefined) {
                qObj.recommended = qAdvisor.recommendedIndex;
              }
            }
          }
        }
      }

      const advisorLine = `\n💡 [Advisor / ck:advisor (${advisor.ckVerdict || advisor.verdict})]: ${advisor.recommendation || advisor.reason}`;

      if (!isEnabled || !apiKey) {
        const note = `\n\n⚠️ [TypeSafe System One: Evaluation offline / not configured]${advisorLine}`;
        if (Array.isArray(params.questions) && params.questions[0] && typeof params.questions[0] === "object") {
          const q = params.questions[0] as Record<string, unknown>;
          if (typeof q.question === "string") q.question += note;
        } else if (typeof params.question === "string") {
          params.question += note;
        }
        return;
      }

      try {
        const client = createExtensionJudgeClient(apiKey, undefined, ctx);
        const questionsPayload = params.questions || params.question || params;
        const state = JSON.stringify({
          intent: params.i || "Decision presented to human",
          questions: questionsPayload,
          projectDir,
        });

        const questions: Record<string, ExpertJudgeQuestion> = {
          risk_posture: {
            type: "score",
            instructions: "Rate the technical risk and security implications of this proposal or question being presented to the human:",
            criteria: [
              "Zero Risk — routine inquiry, safe tradeoffs, fully bounded options",
              "Low Risk — minor architectural choice with manageable side effects",
              "Moderate Risk — tradeoffs involving data, architecture, or credentials requiring human scrutiny",
              "Critical Risk — dangerous action, security sensitive choice, or potential data loss",
            ],
          },
          decision_clarity: {
            type: "noul",
            instructions: "Does this question present clear, actionable, mutually distinct choices to the human without misleading information?",
            criteria: {
              true: "Choices are distinct, well-explained, and technically clear",
              false: "Choices are vague, incomplete, misleading, or poorly formed",
            },
          },
        };

        const response = await client.evaluate({ state, questions });
        if (response.error || !response.answers) {
          const note = `\n\n⚠️ [TypeSafe System One: Evaluation unavailable (${response.error || "no response"})]${advisorLine}`;
          if (Array.isArray(params.questions) && params.questions[0] && typeof params.questions[0] === "object") {
            const q = params.questions[0] as Record<string, unknown>;
            if (typeof q.question === "string") q.question += note;
          } else if (typeof params.question === "string") {
            params.question += note;
          }
          return;
        }

        const riskScore = response.answers.risk_posture?.score;
        const clarity = response.answers.decision_clarity?.noul;
        if (riskScore === undefined || clarity === undefined) {
          const note = `\n\n⚠️ [TypeSafe System One: Incomplete evaluation - proceeding with human review]${advisorLine}`;
          if (Array.isArray(params.questions) && params.questions[0] && typeof params.questions[0] === "object") {
            const q = params.questions[0] as Record<string, unknown>;
            if (typeof q.question === "string") q.question += note;
          } else if (typeof params.question === "string") {
            params.question += note;
          }
          return;
        }

        const riskLabel = riskScore <= 1.0 ? "Low" : riskScore <= 2.0 ? "Moderate" : "High/Critical";
        const annotation = `\n\n🛡️ [TypeSafe System One Verdict]: Risk: ${riskLabel} (${riskScore.toFixed(1)}/3) | Decision Clarity: ${Math.round(clarity * 100)}%${advisorLine}`;

        if (Array.isArray(params.questions)) {
          for (const q of params.questions) {
            if (q && typeof q === "object") {
              const qObj = q as Record<string, unknown>;
              if (typeof qObj.question === "string") {
                qObj.question += annotation;
              }
              if (typeof qObj.header === "string") {
                qObj.header = `[${riskLabel} Risk] ${qObj.header}`;
              }
            }
          }
        } else if (typeof params.question === "string") {
          params.question += annotation;
        }

        await pi.sendMessage({
          customType: "typesafe-human-verdict",
          content: `TypeSafe System One evaluated human handoff:\n- Risk: ${riskLabel} (${riskScore.toFixed(1)}/3)\n- Clarity: ${Math.round(clarity * 100)}%\n- Advisor (${advisor.ckVerdict || advisor.verdict}): ${advisor.recommendation || advisor.reason}`,
          display: true,
        });
      } catch {
        const note = `\n\n⚠️ [TypeSafe System One: Evaluation failed - proceeding with human review]${advisorLine}`;
        if (Array.isArray(params.questions) && params.questions[0] && typeof params.questions[0] === "object") {
          const q = params.questions[0] as Record<string, unknown>;
          if (typeof q.question === "string") q.question += note;
        } else if (typeof params.question === "string") {
          params.question += note;
        }
      }
      return;
    }

    
    // Plan-CLI Execution Guard (Phase 3)
    if (toolName === "bash") {
      const params = (evt.params || evt.args || evt.input || {}) as Record<string, unknown>;
      const cmd = ((params.command as string) || (params.cmd as string) || "").trim();
      if (/plan-cli(\.cjs)?\s+check/i.test(cmd)) {
        refreshTodoState(ctx);
        pruneTodoTransactions();
        await assertNoActiveContractedTasks(state, "Cannot verify plan completion while uncompleted contracted tasks exist", evt as Record<string, unknown>, pi);
      }
      return;
    }

    return;
  }

  pi.on("tool_call", handleTodoInterception);

  pi.on("tool_result", async (event: unknown, ctx: unknown) => {
    if (!event || typeof event !== "object") return;
    const evt = event as Record<string, unknown>;
    const toolName = (evt.tool || evt.name || evt.toolName) as string | undefined;
    if (toolName !== "todo") return;
    pruneTodoTransactions();
    const callId = typeof evt.toolCallId === "string" ? evt.toolCallId : "";
    if (!callId || state.committedCallTombstones.has(callId)) return;
    const staged = state.stagedCalls.get(callId);
    if (!staged) {
      refreshTodoState(ctx);
      return;
    }
    state.stagedCalls.delete(callId);
    if (evt.isError) return;
    const details = (evt.details ?? (evt.result as Record<string, unknown> | undefined)?.details) as Record<string, unknown> | undefined;
    const resultInput = (evt.params || evt.args || evt.input) as Record<string, unknown> | undefined;
    const resultOp = typeof details?.op === "string" ? details.op : "";
    const resultPhases = details?.phases;
    const phasesAreCanonical =
      Array.isArray(resultPhases) &&
      resultPhases.every((phase) =>
        phase &&
        typeof phase === "object" &&
        typeof (phase as Record<string, unknown>).name === "string" &&
        Array.isArray((phase as Record<string, unknown>).tasks) &&
        (phase as Record<string, unknown>).tasks.every((task) =>
          task &&
          typeof task === "object" &&
          typeof (task as Record<string, unknown>).content === "string" &&
          ["pending", "in_progress", "completed", "abandoned", "blocked"].includes((task as Record<string, unknown>).status as string)
        )
      );
    if (
      !details ||
      !phasesAreCanonical ||
      !resultInput ||
      canonicalTodoInputHash(resultInput) !== staged.inputHash ||
      resultOp !== staged.op ||
      staged.generation !== state.generation ||
      staged.revision !== state.revision
    ) {
      state.uninitialized = true;
      refreshTodoState(ctx);
      return;
    }
    const committedPhases = cloneTodoPhases(resultPhases as CanonicalTodoPhase[]);
    if (staged.op === "done") {
      const completed = Array.isArray(details.completedTasks) ? details.completedTasks : undefined;
      const actual = staged.affectedTasks.filter((taskName) =>
        taskMatches(committedPhases, taskName).some((task) => task.status === "completed")
      );
      const completedNames = new Set(
        (completed ?? [])
          .map((task) => typeof task === "string" ? task : typeof task === "object" && task ? (task as Record<string, unknown>).content : undefined)
          .filter((task): task is string => typeof task === "string")
      );
      if (
        !completed ||
        actual.length !== staged.affectedTasks.length ||
        staged.affectedTasks.some((taskName) => !completedNames.has(taskName))
      ) {
        state.uninitialized = true;
        refreshTodoState(ctx);
        return;
      }
    }
    const previousOpen = activeTasksFromPhases(state.phases);
    state.committedCallTombstones.set(callId, {
      inputHash: staged.inputHash,
      op: staged.op,
      committedAt: Date.now(),
    });
    while (state.committedCallTombstones.size > TODO_TOMBSTONE_LIMIT) {
      const oldest = state.committedCallTombstones.keys().next().value;
      if (oldest) state.committedCallTombstones.delete(oldest);
      else break;
    }
    for (const taskName of new Set(staged.replacedTasks)) {
      state.taskBaselines.delete(taskName);
      state.pendingRemediations.delete(taskName);
      state.consecutiveFailuresByTask.delete(taskName);
      state.lastFailureReasonByTask.delete(taskName);
    }
    state.phases = committedPhases;
    state.uninitialized = false;
    const currentTasks = new Set(allTodoTasks(state.phases).map((task) => task.content));
    for (const taskName of previousOpen) {
      const task = taskMatches(state.phases, taskName)[0];
      if (!task || task.status === "completed" || task.status === "abandoned") {
        state.taskBaselines.delete(taskName);
        state.pendingRemediations.delete(taskName);
        state.consecutiveFailuresByTask.delete(taskName);
        state.lastFailureReasonByTask.delete(taskName);
      }
    }
    for (const task of allTodoTasks(state.phases)) {
      if (task.status === "in_progress" && !state.taskBaselines.has(task.content)) {
        state.taskBaselines.set(task.content, staged.workspaceSnapshot);
      }
    }
    for (const taskName of [...state.taskBaselines.keys()]) {
      if (!currentTasks.has(taskName)) state.taskBaselines.delete(taskName);
    }
    for (const taskName of [...state.pendingRemediations.keys()]) {
      if (!currentTasks.has(taskName)) state.pendingRemediations.delete(taskName);
    }
    for (const taskName of [...state.consecutiveFailuresByTask.keys()]) {
      if (!currentTasks.has(taskName)) state.consecutiveFailuresByTask.delete(taskName);
    }
    for (const taskName of [...state.lastFailureReasonByTask.keys()]) {
      if (!currentTasks.has(taskName)) state.lastFailureReasonByTask.delete(taskName);
    }
    if (staged.op === "done") state.lastCheckpoint = staged.workspaceSnapshot;
    state.revision++;
    if (staged.pendingReports.length > 0) {
      await safeSendMessage(
        pi,
        {
          customType: "typesafe-task-report",
          content: staged.pendingReports.map(formatTaskReport).join("\n\n"),
          display: true,
        }
      );
    }
  });

  for (const lifecycleEvent of ["session_switch", "session_branch", "session_tree"]) {
    pi.on(lifecycleEvent, (_event: unknown, ctx: unknown) => {
      invalidateTodoState(ctx);
    });
  }
  pi.on("session_shutdown", () => {
    state.generation++;
    state.revision++;
    state.stagedCalls.clear();
  });
  for (const lifecycleEvent of ["turn_end", "agent_end"]) {
    pi.on(lifecycleEvent, () => {
      state.generation++;
      state.revision++;
      state.stagedCalls.clear();
    });
  }

  // Tool is registered UNCONDITIONALLY. Availability (API key, bundled
  // modules, project opt-in) is re-checked on every call rather than once at
  // extension load. A key set BEFORE OMP starts (so this process's
  // `process.env` already has it — env vars set in a shell afterward never
  // reach an already-running process) now works without needing the old
  // early-return-at-load-time removed below to also be worked around by a
  // restart. A project opting in via .claude/.ck.json DOES take effect
  // without an OMP restart (the resolver reads that file from disk on every
  // call — no caching involved there). Installing the bundled module for the
  // FIRST time after a failed require also takes effect immediately, since
  // Node never caches a failed require().
  //
  // A successful require() of a bundled absolute path is cached by Node's
  // module system for the lifetime of this process (`nodeRequire`'s cache is
  // the ordinary CJS require cache). A bundle update therefore takes effect
  // only after OMP restarts.
  async function executeTypeSafe(
    params: TypeSafeJudgeParams,
    apiKey: string,
    signal?: AbortSignal,
    ctx?: unknown
  ): Promise<ExtensionToolResult> {
    const resolverModule = loadResolverModule();
    if (!resolverModule) return DISABLED_RESULT;

    const projectDir = getProjectDir(ctx);
    const { enabled } = resolverModule.resolveTypeSafeEnabled(projectDir, resolverOptions);
    if (!enabled) return DISABLED_RESULT;

    const apiClientModule = loadApiClientModule();
    if (!apiClientModule) return DISABLED_RESULT;
    const credentialStatus = apiClientModule.checkCredentialCooldown(apiKey);
    if (credentialStatus) {
      return credentialStatus.authFailed
        ? DISABLED_RESULT
        : shortError(`http_${credentialStatus.status}`);
    }

    const policyClientModule = loadPolicyClientModule(pi);
    if (!policyClientModule) return shortError("policy_client_missing");

    const sanitizedState = sanitizeStateForTypeSafe(params.state);
    const normalizedQuestions = normalizeQuestionForTypeSafe(params.questions);
    const validParams = {
      state: sanitizedState,
      questions: normalizedQuestions,
    };

    const validation = apiClientModule.validateInput(validParams);
    if (!validation.ok) {
      return { content: [{ type: "text", text: validation.message ?? "invalid_input" }] };
    }

    const redactModule = loadRedactModule();
    if (!redactModule) return DISABLED_RESULT;

    const outgoing = {
      state: validParams.state,
      questions: validParams.questions,
      model: typeof params.model === "string" && params.model.trim() ? params.model.trim() : "jev-latest",
    };
    let prepared: typeof outgoing;
    try {
      prepared = redactModule.preparePayload(outgoing, { maxBytes: MAX_BODY_BYTES, apiKey }) as typeof outgoing;
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "payload rejected: secret in key") {
        return { content: [{ type: "text", text: "payload rejected: secret in key" }] };
      }
      return shortError("redact_failed");
    }

    const bodyStr = JSON.stringify(prepared);
    if (Buffer.byteLength(bodyStr, "utf8") > MAX_BODY_BYTES) {
      return shortError("payload_too_large");
    }

    try {
      const outcome = await apiClientModule.requestWithRetry({
        fetchImpl: globalThis.fetch,
        apiKey,
        body: bodyStr,
        signal,
      });
      if (outcome.kind === "auth") {
        await pi.sendMessage({
          customType: "typesafe-auth-recovery",
          content: "TypeSafe authentication failed (HTTP 401/403). TYPESAFE_API_KEY is invalid or revoked. Update the key in your environment to automatically restore service.",
          display: true,
        }).catch(() => {});
        return shortError("unauthorized");
      }
      if (outcome.kind === "http_error") return shortError(`http_${outcome.status}`);
      if (outcome.kind === "bad_response" || !outcome.data || typeof outcome.data !== "object" || !("answers" in outcome.data)) {
        return shortError("bad_response");
      }
      const answers = apiClientModule.sanitizeAnswers(prepared.questions, outcome.data.answers);
      if (!answers) return shortError("bad_response");

      for (const key of Object.keys(answers)) {
        // Validate against `prepared.questions` (the post-redaction,
        // post-cap version actually SENT), not `params.questions` — a
        // `choice` option that was redacted/capped before sending is judged
        // by the upstream API against what it actually received.
        const q = prepared.questions[key];
        if (q && q.type === "choice") {
          const ans = answers[key];
          if (ans && typeof ans === "object" && "choice" in ans && typeof ans.choice === "string") {
            const criteriaKeys = q.criteria && typeof q.criteria === "object" ? Object.keys(q.criteria) : [];
            const isLatticeQuestion = criteriaKeys.length > 0 && criteriaKeys.every((opt) => HOST_POLICY.lattice.includes(opt));
            if (isLatticeQuestion || HOST_POLICY.lattice.includes(ans.choice)) {
              const result = policyClientModule.checkPolicy(HOST_POLICY.baseline, ans.choice, HOST_POLICY.lattice);
              if (!result.ok) {
                return { content: [{ type: "text", text: `lattice-violation: ${result.reason}` }] };
              }
            }
          }
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ answers }) }],
        details: { answers },
      };
    } catch (err: unknown) {
      const isAbort =
        err instanceof Error &&
        (err.name === "TimeoutError" || err.name === "AbortError");
      return shortError(isAbort ? "timeout" : "network_error");
    }
  }
  function createExtensionJudgeClient(
    apiKey: string,
    signal?: AbortSignal,
    ctx?: unknown
  ): ExpertJudgeClient & PlanJudgeClient & GateJudgeClient {
    return {
      async evaluateDebate(params: {
        state: string;
        questions: Record<string, TypeSafeQuestion>;
        model?: string;
      }) {
        const targetModel = params.model || process.env.TYPESAFE_PREDICT_MODEL || "jev-latest";
        if (!apiKey) {
          return { error: "TYPESAFE_API_KEY environment variable is missing", modelUsed: targetModel };
        }
        const res = await executeTypeSafe(
          {
            state: params.state,
            questions: params.questions,
            model: targetModel,
          },
          apiKey,
          signal,
          ctx
        );

        if (res.details && typeof res.details === "object" && "answers" in res.details) {
          return {
            answers: res.details.answers as Record<string, { score: number; verdict?: string }>,
            modelUsed: targetModel,
          };
        }

        const text = res.content?.[0]?.text;
        if (text && text.startsWith("{")) {
          try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === "object" && "answers" in parsed) {
              return {
                answers: parsed.answers as Record<string, { score: number; verdict?: string }>,
                modelUsed: targetModel,
              };
            }
          } catch {
            // Fall through to a fail-closed unavailable result.
          }
        }
        return { error: text || "TypeSafe debate evaluation unavailable", modelUsed: targetModel };
      },

      async evaluate(params: {
        state: string;
        questions: Record<string, ExpertJudgeQuestion>;
      }): Promise<ExpertJudgeResponse> {
        const res = await executeTypeSafe(
          {
            state: params.state,
            questions: params.questions as Record<string, TypeSafeQuestion>,
          },
          apiKey,
          signal,
          ctx
        );

        if (res.details && typeof res.details === "object" && "answers" in res.details) {
          const rawAnswers = res.details.answers;
          return { answers: rawAnswers as ExpertJudgeResponse["answers"] };
        }

        try {
          const text = res.content?.[0]?.text;
          if (text && text.startsWith("{")) {
            const parsed = JSON.parse(text) as { answers?: ExpertJudgeResponse["answers"] };
            if (parsed && typeof parsed === "object" && parsed.answers) {
              return { answers: parsed.answers };
            }
          }
          return { error: text || "TypeSafe evaluation failed" };
        } catch {
          return { error: res.content?.[0]?.text || "TypeSafe evaluation failed" };
        }
      },

      async evaluatePlan(params: {
        state: string;
        questions: Record<string, PlanQuestion>;
      }) {
        const res = await executeTypeSafe(
          {
            state: params.state,
            questions: params.questions as Record<string, TypeSafeQuestion>,
          },
          apiKey,
          signal,
          ctx
        );

        if (res.details && typeof res.details === "object" && "answers" in res.details) {
          const rawAnswers = res.details.answers;
          return {
            answers: rawAnswers as {
              scope_mode?: { choice: string };
              algorithm_depth?: { score: number };
              task_actionability?: { noul: number };
              claude_isolation_adherence?: { noul: number };
            },
          };
        }

        try {
          const text = res.content?.[0]?.text;
          if (text && text.startsWith("{")) {
            const parsed = JSON.parse(text) as {
              answers?: {
                scope_mode?: { choice: string };
                algorithm_depth?: { score: number };
                task_actionability?: { noul: number };
                claude_isolation_adherence?: { noul: number };
              };
            };
            if (parsed && typeof parsed === "object" && parsed.answers) {
              return { answers: parsed.answers };
            }
          }
          return { error: text || "TypeSafe evaluation failed" };
        } catch {
          return { error: res.content?.[0]?.text || "TypeSafe evaluation failed" };
        }
      },

      async evaluateGate(params: {
        state: string;
        questions: Record<string, GateQuestion>;
      }) {
        const res = await executeTypeSafe(
          {
            state: params.state,
            questions: params.questions as Record<string, TypeSafeQuestion>,
          },
          apiKey,
          signal,
          ctx
        );

        if (res.details && typeof res.details === "object" && "answers" in res.details) {
          const rawAnswers = res.details.answers;
          return {
            answers: rawAnswers as {
              meets_criteria?: { noul: number };
              plan_drift?: { choice: string };
              claude_account_untouched?: { noul: number };
            },
          };
        }

        try {
          const text = res.content?.[0]?.text;
          if (text && text.startsWith("{")) {
            const parsed = JSON.parse(text) as {
              answers?: {
                meets_criteria?: { noul: number };
                plan_drift?: { choice: string };
                claude_account_untouched?: { noul: number };
              };
            };
            if (parsed && typeof parsed === "object" && parsed.answers) {
              return { answers: parsed.answers };
            }
          }
          return { error: text || "TypeSafe evaluation failed" };
        } catch {
          return { error: res.content?.[0]?.text || "TypeSafe evaluation failed" };
        }
      },
    };
  }

  pi.registerTool({
    name: "typesafe_judge",
    label: "TypeSafe Judge",
    description:
      "Send state and structured questions (noul, choice, score) to TypeSafe System One for fast structured judgments. Tighten-only: use a result to add gates or raise review level, never to auto-approve or skip review/test.",
    parameters: z.object({
      state: z.union([z.string(), z.record(z.unknown())]),
      questions: z.record(
        z.object({
          type: z.enum(["noul", "choice", "score"]),
          instructions: z.union([z.string(), z.record(z.unknown())]),
          criteria: z.unknown().optional(),
        })
      ),
      model: z.string().optional(),
    }),
    async execute(
      _toolCallId: string,
      params: TypeSafeJudgeParams,
      signal?: AbortSignal,
      _onUpdate?: (result: ExtensionToolResult) => void,
      ctx?: unknown
    ): Promise<ExtensionToolResult> {
      const apiKey = process.env.TYPESAFE_API_KEY?.trim();
      if (!apiKey) return DISABLED_RESULT;
      return executeTypeSafe(params, apiKey, signal, ctx);
    },
  });

  pi.registerTool({
    name: "typesafe_rerank",
    label: "TypeSafe Rerank",
    description: "Rank multiple candidate strings or code snippets against a query. Returns candidates ordered by relevance score.",
    parameters: z.object({
      query: z.string(),
      candidates: z.array(z.string()).min(1)
    }),
    async execute(
      _toolCallId: string,
      params: { query: string, candidates: string[] },
      signal?: AbortSignal,
      _onUpdate?: (result: ExtensionToolResult) => void,
      ctx?: unknown
    ): Promise<ExtensionToolResult> {
      const apiKey = process.env.TYPESAFE_API_KEY?.trim();
      if (!apiKey) return DISABLED_RESULT;

      const questions: Record<string, TypeSafeQuestion> = {};
      for (let i = 0; i < params.candidates.length; i++) {
        questions[`candidate_${i}`] = {
          type: "score",
          instructions: `Rate how relevant candidate \`candidates[${i}]\` is to the target \`query\`.`,
          criteria: [
            "Level 0: Completely irrelevant or unrelated to `query`.",
            "Level 1: Partially relevant, touches adjacent topics but does not resolve `query`.",
            "Level 2: Highly relevant, directly and accurately addresses `query`."
          ]
        };
      }

      const state = { query: params.query, candidates: params.candidates };
      const res = await executeTypeSafe({ state, questions }, apiKey, signal, ctx);
      
      if (res.content[0].text.startsWith("TypeSafe error:") || res.content[0].text === "TypeSafe disabled" || res.content[0].text.startsWith("lattice-violation:")) {
        return res;
      }
      
      try {
        const parsed = JSON.parse(res.content[0].text);
        const answers = parsed.answers;
        const scoredCandidates = params.candidates.map((c, i) => {
          const ans = answers[`candidate_${i}`];
          const score = (ans && typeof ans === "object" && "score" in ans && typeof ans.score === "number") ? ans.score : 0;
          return { candidate: c, score };
        });
        scoredCandidates.sort((a, b) => b.score - a.score);
        return { content: [{ type: "text", text: JSON.stringify({ ranked: scoredCandidates }) }] };
      } catch (e) {
        return shortError("bad_response");
      }
    }
  });

  pi.registerTool({
    name: "typesafe_evaluate_multi",
    label: "TypeSafe Multi-Label Evaluation",
    description: "Evaluate the exact same state against multiple dimension labels simultaneously.",
    parameters: z.object({
      state: z.union([z.string(), z.record(z.unknown())]),
      dimensions: z.array(z.string()).min(1)
    }),
    async execute(
      _toolCallId: string,
      params: { state: string | Record<string, unknown>, dimensions: string[] },
      signal?: AbortSignal,
      _onUpdate?: (result: ExtensionToolResult) => void,
      ctx?: unknown
    ): Promise<ExtensionToolResult> {
      const apiKey = process.env.TYPESAFE_API_KEY?.trim();
      if (!apiKey) return DISABLED_RESULT;

      const questions: Record<string, TypeSafeQuestion> = {};
      for (const dim of params.dimensions) {
        questions[dim] = {
          type: "noul",
          instructions: `Does the content in \`state\` clearly satisfy, demonstrate, or exhibit "${dim}"?`,
          criteria: {
            true: `The content clearly exhibits or satisfies "${dim}".`,
            false: `The content does not satisfy or exhibit "${dim}".`
          }
        };
      }
      return executeTypeSafe({ state: params.state, questions }, apiKey, signal, ctx);
    }
  });

  pi.registerTool({
    name: "typesafe_elevate_plan",
    label: "TypeSafe Plan Elevation",
    description:
      "Evaluates an implementation plan draft against TypeSafe System One rubrics (Scope, Algorithm, Actionability) and Claude isolation invariants.",
    parameters: z.object({
      planTitle: z.string(),
      planContent: z.string(),
      userPrompt: z.string().optional(),
      attempt: z.number().optional(),
    }),
    async execute(
      _toolCallId: string,
      params: { planTitle: string; planContent: string; userPrompt?: string; attempt?: number },
      signal?: AbortSignal,
      _onUpdate?: (result: ExtensionToolResult) => void,
      ctx?: unknown
    ): Promise<ExtensionToolResult> {
      const apiKey = process.env.TYPESAFE_API_KEY?.trim() || "";
      const client = createExtensionJudgeClient(apiKey, signal, ctx);

      const debate = await runMultiPersonaDebate(params.planContent, client);
      if (!debate.approved) {
        const rejectionResult = {
          approved: false,
          claudeIsolationSafe: true,
          reasons: [
            "Multi-persona pre-analysis debate rejected plan:",
            ...debate.reasons,
          ],
          debate,
          feedback: `Plan rejected by Multi-Persona Debate (fast-model tier):\n- ${debate.reasons.join("\n- ")}`,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(rejectionResult, null, 2) }],
          details: rejectionResult,
        };
      }

      const resolvedUserPrompt = params.userPrompt || collectConversationContext(ctx).userRequest || undefined;
      const result = await evaluatePlanDraft({ ...params, userPrompt: resolvedUserPrompt }, client);
      const combined = { ...result, debate };
      return {
        content: [{ type: "text", text: JSON.stringify(combined, null, 2) }],
        details: combined,
      };
    },
  });

  pi.registerTool({
    name: "typesafe_verify_completion",
    label: "TypeSafe Task Completion Dual Gate",
    description:
      "Advisory pre-flight verification tool. Evaluates task completion via Gate 1 deterministic local verification and Gate 2 TypeSafe System One semantic validation without mutating task state. ADVISORY ONLY: Agent retries MUST be capped at <= 2 attempts to avoid loop thrashing.",
    parameters: z.object({
      taskId: z.string(),
      planPath: z.string().optional(),
      testCommand: z.string().optional(),
      timeoutMs: z.number().optional(),
    }),
    async execute(
      _toolCallId: string,
      params: { taskId: string; planPath?: string; testCommand?: string; timeoutMs?: number },
      signal?: AbortSignal,
      _onUpdate?: (result: ExtensionToolResult) => void,
      ctx?: unknown
    ): Promise<ExtensionToolResult> {
      const cwd = getProjectDir(ctx);
      const apiKey = process.env.TYPESAFE_API_KEY?.trim() || "";
      const client = createExtensionJudgeClient(apiKey, signal, ctx);
      const result = await verifyTaskCompletion({ ...params, cwd }, client);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });
  const criteriaBase = z.array(z.string());
  const criteriaSchema =
    criteriaBase && typeof criteriaBase === "object" && "optional" in criteriaBase && typeof criteriaBase.optional === "function"
      ? criteriaBase.optional()
      : criteriaBase;

  pi.registerTool({
    name: "typesafe_expert_review",
    label: "TypeSafe Expert Review",
    description:
      "Invokes TypeSafe System One and Bicameral Advisor expert evaluation: scope_arbiter (scope adherence and reduction prevention), drift_guard (architectural deviation and creep detection), risk_security_triage (technical risk and trade-off rating), or advisor / ck:advisor (structured technical decision verdict, option ranking, and recommendation).",
    parameters: z.object({
      role: z.enum(["scope_arbiter", "drift_guard", "risk_security_triage", "advisor", "ck:advisor"]),
      context: z.union([z.string(), z.record(z.unknown())]),
      criteria: criteriaSchema,
    }),
    async execute(
      _toolCallId: string,
      params: {
        role: "scope_arbiter" | "drift_guard" | "risk_security_triage" | "advisor" | "ck:advisor";
        context: string | Record<string, unknown>;
        criteria?: string[];
      },
      signal?: AbortSignal,
      _onUpdate?: (result: ExtensionToolResult) => void,
      ctx?: unknown
    ): Promise<ExtensionToolResult> {
      const apiKey = process.env.TYPESAFE_API_KEY?.trim() || "";
      const client = apiKey ? createExtensionJudgeClient(apiKey, signal, ctx) : undefined;
      let result: unknown;
      if (params.role === "scope_arbiter") {
        const planStr = typeof params.context === "string" ? params.context : JSON.stringify(params.context);
        result = await evaluateScopeArbiter(planStr, params.criteria?.join("\n") || "Implement plan", client);
      } else if (params.role === "drift_guard") {
        const diffStr = typeof params.context === "string" ? params.context : JSON.stringify(params.context);
        result = await evaluateDriftGuard(diffStr, params.criteria || [], client);
      } else if (params.role === "advisor" || params.role === "ck:advisor") {
        const convo = collectConversationContext(ctx);
        const ctxObj =
          params.context && typeof params.context === "object"
            ? (params.context as Record<string, unknown>)
            : undefined;
        const questionStr =
          (typeof ctxObj?.question === "string" ? ctxObj.question : undefined) ||
          (typeof ctxObj?.task === "string" ? ctxObj.task : undefined) ||
          (typeof params.context === "string" ? params.context : JSON.stringify(params.context));
        const optionsList = Array.isArray(ctxObj?.options)
          ? (ctxObj.options as Array<string | AdvisorOptionCandidate>)
          : params.criteria;
        const decisionKind =
          typeof ctxObj?.decision === "string"
            ? (ctxObj.decision as AdvisorDecisionKind)
            : "general";
        const constraints =
          (Array.isArray(ctxObj?.constraints) || typeof ctxObj?.constraints === "string"
            ? (ctxObj.constraints as string | string[])
            : undefined) || params.criteria;
        result = await runBicameralDecisionCheck(
          {
            decision: decisionKind,
            question: questionStr,
            options: optionsList,
            recommendedIndex:
              typeof ctxObj?.recommended === "number" ? ctxObj.recommended : undefined,
            constraints,
            userRequest:
              (typeof ctxObj?.userRequest === "string" ? ctxObj.userRequest : undefined) ||
              convo.userRequest,
            agentWorkLog:
              (typeof ctxObj?.agentWorkLog === "string" ? ctxObj.agentWorkLog : undefined) ||
              convo.agentWorkLog,
            context: params.context,
          },
          client
        );
      } else {
        result = await evaluateRiskSecurityTriage(params.context, client);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });

  const optionalStringSchema =
    (() => {
      const s = z.string();
      return s && typeof s === "object" && "optional" in s && typeof s.optional === "function"
        ? s.optional()
        : s;
    })();

  pi.registerTool({
    name: "typesafe_advisor",
    label: "TypeSafe & ck:advisor Decision Engine",
    description:
      "Consults the Bicameral Advisor (ck:advisor + TypeSafe JEV) when the agent needs a decision on architecture, approach, plan review, phase risk, or stuck tasks. Always returns a structured Verdict (proceed | revise | block), Recommendation, Ranked options, Findings, and Confidence.",
    parameters: z.object({
      decision: optionalStringSchema,
      question: z.string(),
      options: criteriaSchema,
      constraints: criteriaSchema,
      context: z.union([z.string(), z.record(z.unknown())]),
    }),
    async execute(
      _toolCallId: string,
      params: {
        decision?: string;
        question: string;
        options?: string[];
        constraints?: string[];
        context?: string | Record<string, unknown>;
      },
      signal?: AbortSignal,
      _onUpdate?: (result: ExtensionToolResult) => void,
      ctx?: unknown
    ): Promise<ExtensionToolResult> {
      const apiKey = process.env.TYPESAFE_API_KEY?.trim() || "";
      const client = apiKey ? createExtensionJudgeClient(apiKey, signal, ctx) : undefined;
      const convo = collectConversationContext(ctx);
      const ctxObj =
        params.context && typeof params.context === "object"
          ? (params.context as Record<string, unknown>)
          : undefined;
      const optionsList =
        params.options ||
        (Array.isArray(ctxObj?.options)
          ? (ctxObj.options as Array<string | AdvisorOptionCandidate>)
          : undefined);
      const result = await runBicameralDecisionCheck(
        {
          decision: (params.decision as AdvisorDecisionKind) || "general",
          question: params.question,
          options: optionsList,
          constraints: params.constraints,
          userRequest: convo.userRequest,
          agentWorkLog: convo.agentWorkLog,
          context: params.context,
        },
        client
      );
      return {
        content: [{ type: "text", text: result.report + "\n\n" + JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });
  return state;
}
