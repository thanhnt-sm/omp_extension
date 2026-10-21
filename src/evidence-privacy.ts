const PRIVATE_SEGMENTS: Readonly<Record<string, true>> = { ".ssh": true, ".claude": true, ".omp": true, ".pi": true, ".aws": true, ".azure": true, ".kube": true, ".gnupg": true, ".git": true, ".history": true, session: true, sessions: true, history: true };
/** Path provenance is evaluated before evidence text is mixed or serialized; this is not a lexical reasoning scrubber. */
export function isPrivateEvidencePath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/").toLowerCase();
  const parts = normalized.split("/");
  if (parts.some((part) => PRIVATE_SEGMENTS[part] || part === ".claude.json" || /^\.env(?:\.|$)/.test(part))) return true;
  const basename = parts[parts.length - 1] ?? "";
  if (/^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519|credentials(?:\.[a-z0-9_-]+)?|\.bash_history|\.zsh_history|\.python_history|\.node_repl_history|consolehost_history\.txt)$/.test(basename)) return true;
  return /^(?:session|session-history|history)\.(?:jsonl?|ndjson|log|sqlite|db|txt)$/.test(basename);
}
