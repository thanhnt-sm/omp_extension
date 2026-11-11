import path from "node:path";

export interface FileMutationTarget {
  path: string;
  operation: "modify" | "create" | "delete";
  content: string;
  renameFrom?: string;
  /** ast_edit entry that is a glob or may be a directory: it can cover many files, so it is matched against the protected set. */
  broad?: boolean;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** The native freeform edit wire is {input: hashlinePatch}; body lines start '+'. */
export function fileMutationTargets(toolName: "write" | "edit", input: unknown): FileMutationTarget[] {
  if (!record(input)) return [];
  if (toolName === "write") {
    return typeof input.path === "string" && typeof input.content === "string"
      ? [{ path: input.path, operation: "modify", content: input.content }] : [];
  }
  if (typeof input.input !== "string") return [];
  const targets: FileMutationTarget[] = [];
  let current: FileMutationTarget | undefined;
  const bodies: string[] = [];
  function finish(): void {
    if (current) { current.content = bodies.join("\n"); targets.push(current); }
    bodies.length = 0;
  }
  for (const line of input.input.split(/\r?\n/)) {
    const header = /^\[([^#\r\n]+)#[0-9A-F]{4}\]$/.exec(line);
    if (header) { finish(); current = { path: header[1], operation: "modify", content: "" }; continue; }
    if (!current) continue;
    if (line === "REM") current.operation = "delete";
    else if (line.startsWith("MV ")) {
      const raw = line.slice(3).trim();
      const destination = raw.length > 1 && (raw.startsWith('"') && raw.endsWith('"') || raw.startsWith("'") && raw.endsWith("'"))
        ? raw.slice(1, -1) : raw;
      if (!destination) return [];
      targets.push({ path: destination, operation: "create", content: "", renameFrom: current.path });
      current.operation = "delete";
    }
    bodies.push(line);
  }
  finish();
  return targets;
}

export function requestsPlanCompletion(content: string): boolean {
  const lines = content.split(/\r?\n/).map(line => line.startsWith("+") ? line.slice(1) : line);
  const first = lines.findIndex(line => line.trim().length > 0);
  const frontmatterEnd = first >= 0 && lines[first].trim() === "---"
    ? lines.findIndex((line, index) => index > first && line.trim() === "---") : -1;
  let fence: { character: string; length: number } | undefined;
  for (const line of frontmatterEnd > first && first >= 0 ? lines.slice(first + 1, frontmatterEnd) : lines) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = { character: marker[0], length: marker.length };
      else if (marker[0] === fence.character && marker.length >= fence.length) fence = undefined;
      continue;
    }
    if (!fence && /^\s*status:\s*["']?complete(?:d)?["']?\s*(?:#.*)?$/i.test(line)) return true;
  }
  return false;
}

const GLOB_CHARS = /[*?[\]{}]/;
/**
 * ast_edit only previews; the apply step is a plain write to xd://resolve with no workspace path.
 * Its `paths` array is therefore the only place a protected file can be named. A missing, non-array or
 * non-string `paths` yields no targets so the caller fails closed.
 */
export function astEditTargets(input: unknown): FileMutationTarget[] {
  if (!record(input) || !Array.isArray(input.paths) || input.paths.length === 0) return [];
  if (!input.paths.every(entry => typeof entry === "string" && entry.trim().length > 0)) return [];
  return (input.paths as string[]).map(entry => ({ path: entry.trim(), operation: "modify" as const, content: "", broad: GLOB_CHARS.test(entry) || undefined }));
}

/** Brace alternatives (`{a,b}`, nested and repeated) are expanded for matching; beyond this many the entry is treated as covering. */
const MAX_BRACE_EXPANSIONS = 256;

/** Expands `{a,b}` groups. Returns null when braces are unbalanced, comma-less (`{a}`, `{1..3}`) or too numerous: callers fail closed. */
function expandBraces(pattern: string): string[] | null {
  const open = pattern.indexOf("{");
  const stray = pattern.indexOf("}");
  if (open < 0) return stray >= 0 ? null : [pattern];
  if (stray >= 0 && stray < open) return null;
  let depth = 0;
  let close = -1;
  const bounds = [open];
  for (let index = open; index < pattern.length && close < 0; index += 1) {
    const char = pattern[index];
    if (char === "{") depth += 1;
    else if (char === "}") { depth -= 1; if (depth === 0) close = index; }
    else if (char === "," && depth === 1) bounds.push(index);
  }
  if (close < 0 || bounds.length < 2) return null;
  bounds.push(close);
  const head = pattern.slice(0, open);
  const tail = pattern.slice(close + 1);
  const expanded: string[] = [];
  for (let index = 0; index + 1 < bounds.length; index += 1) {
    const inner = expandBraces(head + pattern.slice(bounds[index] + 1, bounds[index + 1]) + tail);
    if (!inner) return null;
    expanded.push(...inner);
    if (expanded.length > MAX_BRACE_EXPANSIONS) return null;
  }
  return expanded;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globBody(glob: string): string {
  return glob.replace(/[.+^$()|\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0001").replace(/\*\*/g, "\u0002").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")
    .replace(/\u0001/g, "(?:.*/)?").replace(/\u0002/g, ".*");
}

const GLOB_SEGMENT = /[*?[\]]/;

/** One brace-free entry against absolute (forward-slash, lower-case) candidates. The literal leading segments are resolved against cwd, so cwd itself is never read as a glob. */
function entryReaches(entry: string, isDirectory: boolean, candidates: readonly string[], cwd: string): boolean {
  const segments = entry.split("/");
  const firstGlob = segments.findIndex(segment => GLOB_SEGMENT.test(segment));
  const literal = firstGlob < 0 ? segments : segments.slice(0, firstGlob);
  const joined = literal.join("/");
  const resolved = path.resolve(cwd, joined === "" && literal.length > 0 ? "/" : joined || ".");
  // Windows ignores trailing dots/spaces in the last literal segment.
  const base = resolved.replace(/\\/g, "/").replace(/[. ]+$/, "").replace(/\/+$/, "").toLowerCase();
  if (firstGlob < 0) {
    return candidates.some(candidate => candidate === base || (isDirectory && candidate.startsWith(`${base}/`)));
  }
  // A glob that matches a protected file or any directory above it reaches the file (ast_edit recurses into matched directories).
  const matcher = new RegExp(`^${escapeRegExp(base)}/${globBody(segments.slice(firstGlob).join("/"))}$`, "i");
  return candidates.some(candidate => {
    for (let end = candidate.length; end > 0; end = candidate.lastIndexOf("/", end - 1)) {
      if (matcher.test(candidate.slice(0, end))) return true;
    }
    return false;
  });
}

/**
 * Whether an ast_edit `paths` entry could rewrite any protected file. `entry` is the raw entry (cwd-relative or absolute);
 * `candidates` are ABSOLUTE protected paths; `cwd` is the directory the host resolves entries against. Comparing absolute
 * paths means an entry in an unrelated project covers nothing unless it really reaches the protected set. Directories cover
 * everything below them; globs are matched as patterns and brace groups are expanded. Anything that cannot be reasoned about
 * (malformed or over-large braces, an uncompilable glob) fails closed. Basename-only protected patterns nested below a directory
 * are not enumerated (documented limit).
 */
export function astEditEntryCovers(entry: string, isDirectory: boolean, candidates: readonly string[], cwd: string): boolean {
  const expansions = expandBraces(entry.replace(/\\/g, "/"));
  if (!expansions) return true;
  const lowered = candidates.map(candidate => candidate.replace(/\\/g, "/").toLowerCase());
  try {
    return expansions.some(expansion => entryReaches(expansion, isDirectory, lowered, cwd));
  } catch {
    return true;
  }
}
