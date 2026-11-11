// Workspace loader for the project-level OMP config (`.omp/config.yml`).
//
// Loads the in-progress `typesafe-planner.ts` of this workspace instead of the
// deployed one. The entry is imported through a computed dynamic import: a direct
// path in `extensions:` gets a `?mtime=` tag from the host, which breaks the planner's
// relative `nodeRequire("./src/*.ts")` (`require() async module`).
//
// Fail-closed for what this module can observe: if the entry cannot be imported, throws while
// registering, has no default factory, or finishes without registering a `tool_call` gate, the
// session keeps running (the host isolates extension failures) but every tool outside a read-only
// allowlist is blocked.
//
// Accepted limit (see ADR-20261106): this module cannot guard its own import. If this file is missing
// or unimportable, `disabledExtensions` in `.omp/config.yml` has already removed the ambient gate, so the
// session runs with NO gate. `bun run verify:workspace` detects that; it does not prevent it.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Tools that cannot mutate the workspace, session or machine. Anything else (including unknown/MCP tools) is blocked when the entry failed. */
export const READ_ONLY_TOOL_ALLOWLIST: ReadonlySet<string> = new Set(["read", "grep", "glob", "find", "ast_grep"]);

interface LoaderHost {
  on(event: string, handler: (event: unknown, ctx?: unknown) => unknown): unknown;
  sendMessage?: (message: Record<string, unknown>, options?: Record<string, unknown>) => unknown;
}

export type WorkspaceExtensionFactory = (pi: LoaderHost) => unknown;

function describeError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.replace(/\s+/g, " ").slice(0, 600);
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Read-only tools can still fetch URLs (`read`, `grep`, `ast_grep` accept web and internal URLs such as `skill://`),
 * so in degraded mode any `path`/`paths` containing `://` or starting with two slashes (UNC) is refused. A malformed input is refused too.
 */
function allowlistedInputIsLocal(toolName: string, input: unknown): boolean {
  if (!isRecord(input)) return false;
  const { path: target, paths } = input;
  if (toolName === "read" && typeof target !== "string") return false;
  if (target !== undefined && typeof target !== "string") return false;
  if (typeof target === "string" && !isLocalPathText(target)) return false;
  if (paths !== undefined) {
    if (!Array.isArray(paths) || paths.some(entry => typeof entry !== "string" || !isLocalPathText(entry))) return false;
  }
  return true;
}

/** No URL scheme (`://`) and no UNC / device path (`\\host\share`, `//host/share`, `\\?\`, `\\.\`): those reach the network or devices. */
function isLocalPathText(text: string): boolean {
  return !text.includes("://") && !/^[\\/]{2}/.test(text);
}

/** Pure decision: should a tool call be blocked while the workspace entry is broken? Fails closed on any malformed event. */
export function degradedToolDecision(rawEvent: unknown, failureReason: string): { block: true; reason: string } | undefined {
  const toolName = isRecord(rawEvent) ? rawEvent.toolName : undefined;
  if (typeof toolName === "string" && READ_ONLY_TOOL_ALLOWLIST.has(toolName) && allowlistedInputIsLocal(toolName, (rawEvent as { input?: unknown }).input)) return undefined;
  return {
    block: true,
    reason: `TypeSafe workspace loader: workspace gate is not active (${failureReason}). Only local read-only tools (${[...READ_ONLY_TOOL_ALLOWLIST].join(", ")}; no URLs) are allowed. Fix the entry from outside this session, or start omp with --config tools/omp-target-gate-overlay.yml to run the deployed gate.`,
  };
}

function registerDegradedMode(pi: LoaderHost, failureReason: string): void {
  try { console.error(`[omp-workspace-loader] ${failureReason}`); } catch { /* stderr unavailable */ }
  pi.on("tool_call", event => degradedToolDecision(event, failureReason));
  pi.on("session_start", async (_event, ctx) => {
    const text = `TypeSafe workspace loader FAILED: ${failureReason}. Mutating tools are blocked (fail-closed).`;
    try { (ctx as { ui?: { notify?: (message: string, kind: string) => void } } | undefined)?.ui?.notify?.(text, "error"); } catch { /* headless */ }
    try { await Promise.resolve(pi.sendMessage?.({ customType: "typesafe-workspace-loader-error", content: text, display: true })); } catch { /* best effort */ }
  });
}

/** Wraps the host API so registrations of `tool_call` handlers can be counted; every other member passes through bound to the real host. */
function observeToolCallGate(pi: LoaderHost): { host: LoaderHost; gates: () => number } {
  let gates = 0;
  const cache = new Map<PropertyKey, unknown>();
  const host = new Proxy(pi, {
    get(target, prop) {
      if (prop === "on") {
        if (!cache.has(prop)) {
          cache.set(prop, (event: string, ...rest: unknown[]) => {
            // Count only after the host accepted the registration (a throwing `on` the entry swallows is no gate) and only for a callable handler.
            const result = (target.on as (...args: unknown[]) => unknown).call(target, event, ...rest);
            if (event === "tool_call" && typeof rest[0] === "function") gates += 1;
            return result;
          });
        }
        return cache.get(prop);
      }
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function" || Object.keys(value).length > 0) return value;
      if (!cache.has(prop)) cache.set(prop, (value as (...args: unknown[]) => unknown).bind(target));
      return cache.get(prop);
    },
  });
  return { host, gates: () => gates };
}

/** Builds an extension factory that loads `entryPath` and calls its default export with the host API. */
/** `importModule` is injectable so tests can assert the exact specifier; the default is a computed dynamic import. */
export function createWorkspaceLoader(entryPath: string, importModule: (specifier: string) => Promise<unknown> = specifier => import(specifier)): WorkspaceExtensionFactory {
  const entry = path.resolve(entryPath);
  return async function workspaceLoader(pi: LoaderHost): Promise<void> {
    try {
      const loaded = await importModule(pathToFileURL(entry).href) as { default?: unknown };
      if (typeof loaded.default !== "function") throw new Error("entry has no default factory export");
      const observed = observeToolCallGate(pi);
      await Promise.resolve((loaded.default as WorkspaceExtensionFactory)(observed.host));
      if (observed.gates() === 0) throw new Error("entry registered no tool_call gate");
    } catch (error) {
      registerDegradedMode(pi, `${path.basename(entry)}: ${describeError(error)}`);
    }
  };
}

// fileURLToPath ignores any `?mtime=` query the host may append to this module's URL.
const workspaceEntry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "typesafe-planner.ts");
export default createWorkspaceLoader(workspaceEntry);
