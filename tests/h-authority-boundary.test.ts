import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Static tripwire: the atomic judge (H) is shadow/evaluation-only and must never be reachable from the
// production `todo done` approval path, so H cannot yield APPROVED_PENDING_COMMIT. Pure file reads; no
// dependency on .omp/config.yml, the workspace loader, network, or a live host.
const root = path.resolve(import.meta.dir, "..");
const srcDir = path.join(root, "src");
const H_MODULES = ["atomic-judge", "atomic-evaluation"] as const;

const doneEntryPoints = [
  path.join(root, "typesafe-planner.ts"),
  ...readdirSync(srcDir).filter(name => /^task-verification-.*\.ts$/.test(name)).map(name => path.join(srcDir, name)),
  path.join(srcDir, "bicameral-consensus.ts"),
  path.join(srcDir, "cook-expert-judge.ts"),
];

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\b(?:nodeRequire|require)\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g;

function resolveModule(from: string, specifier: string): string | undefined {
  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.cjs`, `${base}.js`, `${base}.d.cts`]) if (existsSync(candidate) && !candidate.endsWith(path.sep)) {
    try { readFileSync(candidate); return candidate; } catch { /* directory */ }
  }
  return undefined;
}

function importClosure(entries: readonly string[]): Map<string, string> {
  const seen = new Map<string, string>(); const queue = [...entries];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const text = readFileSync(file, "utf8"); seen.set(file, text);
    for (const match of text.matchAll(SPECIFIER)) { const next = resolveModule(file, match[1]); if (next && !seen.has(next)) queue.push(next); }
  }
  return seen;
}

describe("H (atomic judge) authority boundary", () => {
  test("the done-path entry points exist and are the expected set", () => {
    expect(doneEntryPoints.length).toBeGreaterThanOrEqual(5);
    for (const file of doneEntryPoints) expect(existsSync(file), file).toBe(true);
  });

  test("no production done-path module imports or names createAtomicJudge / atomic-judge", () => {
    for (const file of doneEntryPoints) {
      const text = readFileSync(file, "utf8");
      expect(/createAtomicJudge/.test(text), `${path.relative(root, file)} references createAtomicJudge`).toBe(false);
      expect(/["'](?:\.{1,2}\/)(?:src\/)?atomic-judge(?:\.ts)?["']/.test(text), `${path.relative(root, file)} imports atomic-judge`).toBe(false);
    }
  });

  test("atomic-judge / atomic-evaluation are not statically reachable from src done-path modules", () => {
    const srcEntries = doneEntryPoints.filter(file => file.startsWith(srcDir + path.sep));
    const reachable = importClosure(srcEntries);
    const reached = [...reachable.keys()].map(file => path.basename(file).replace(/\.(ts|cjs|d\.cts|js)$/, ""));
    for (const forbidden of H_MODULES) expect(reached, `${forbidden} reachable from the done path`).not.toContain(forbidden);
  });

  test("the planner reaches H only through the shadow evaluation bridge, never a done-path call", () => {
    const planner = readFileSync(path.join(root, "typesafe-planner.ts"), "utf8");
    const bridges = [...planner.matchAll(/atomic-evaluation/g)];
    // Exactly the lazy `createPairedReviewDriver` shadow-host bridge; a new reference must be reviewed against this boundary.
    expect(bridges.length).toBe(2);
    expect(planner).toContain("createPairedReviewDriver");
  });

  test("positive control: the crawler does find atomic-judge from the shadow evaluation module", () => {
    const reached = [...importClosure([path.join(srcDir, "atomic-evaluation.ts")]).keys()].map(file => path.basename(file));
    expect(reached).toContain("atomic-judge.ts");
  });
});
