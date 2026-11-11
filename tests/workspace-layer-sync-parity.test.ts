import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dir, "..");
const lib = createRequire(import.meta.url)("../tools/verify-omp-workspace-lib.cjs");

describe("agents/ and .omp/agents/ stay byte-identical", () => {
  // The workspace layer (omp at the repo root) loads .omp/agents; sync promotes agents/ to the global agents root.
  it("has the same file set and the same bytes in both copies", () => {
    const names = (dir: string) => readdirSync(join(root, dir)).sort();
    expect(names(".omp/agents")).toEqual(names("agents"));
    expect(names("agents").length).toBeGreaterThan(0);
    for (const name of names("agents")) {
      expect(Buffer.compare(readFileSync(join(root, ".omp", "agents", name)), readFileSync(join(root, "agents", name))), `${name} differs between agents/ and .omp/agents/`).toBe(0);
    }
  });
});

describe("sync inventory does not deploy the workspace-only project config", () => {
  function write(file: string, content: string) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content, "utf8");
  }

  it("dry-run lists .omp/agents/* and tools/* but never .omp/config.yml", () => {
    const base = mkdtempSync(join(tmpdir(), "sync-inventory-workspace-layer-"));
    const workspace = join(base, "workspace");
    const target = join(base, "target");
    const home = join(base, "home");
    const pointer = join(home, ".omp", "agent", "extensions", "typesafe-planner.ts");
    try {
      mkdirSync(target, { recursive: true });
      mkdirSync(join(home, ".omp", "agent", "agents"), { recursive: true });
      for (const [name, content] of [["typesafe-planner.ts", "export default {};\n"], ["package.json", "{}\n"], [".gitignore", "node_modules\n"]]) write(join(workspace, name), content);
      for (const name of ["typesafe-enabled-resolver.cjs", "typesafe-api-client.cjs", "typesafe-redact.cjs", "typesafe-redact-patterns.cjs", "typesafe-policy-client.cjs"]) write(join(workspace, "src", name), "module.exports = {};\n");
      for (const name of ["typesafe-child-env.cjs", "typesafe-child-env.d.cts", "typesafe-evidence-file.cjs", "typesafe-evidence-file.d.cts"]) write(join(workspace, "src", name), readFileSync(join(root, "src", name), "utf8"));
      write(join(workspace, "agents", "advisor.md"), "advisor\n");
      write(join(workspace, ".omp", "agents", "advisor.md"), "advisor\n");
      write(join(workspace, ".omp", "config.yml"), lib.EXPECTED_CONFIG);
      write(join(workspace, ".omp", "egc.json"), "{}\n");
      write(join(workspace, "tools", "omp-workspace-loader.ts"), "export default () => {};\n");
      write(join(target, "typesafe-planner.ts"), "export default {};\n");
      write(pointer, `export { default } from "${join(target, "typesafe-planner.ts").replace(/\\/g, "/")}";\n`);

      const result = spawnSync(process.execPath, [join(root, "tools", "sync-baseline.cjs"), "--dry-run"], {
        encoding: "utf8",
        env: { ...process.env, OMP_WORKSPACE_DIR: workspace, OMP_TARGET_DIR: target, OMP_HOME_DIR: home, OMP_EXTENSION_POINTER: pointer, OMP_BACKUP_DIR: join(base, "backup"), OMP_BUN_BIN: "must-not-run-in-dry-run" },
      });
      expect(result.status, result.stderr).toBe(0);
      const parsed = lib.parseManagedActions(result.stdout);
      expect(parsed.invalid).toEqual([]);
      const actions: Array<{ root: string; relativePath: string }> = parsed.actions;
      const planned = actions.map(entry => `${entry.root}/${entry.relativePath}`);
      expect(planned).toContain("target/.omp/agents/advisor.md");
      expect(planned).toContain("target/tools/omp-workspace-loader.ts");
      expect(planned.filter(entry => entry.includes("config.yml"))).toEqual([]);
      expect(planned.filter(entry => entry.startsWith("target/.omp/") && !entry.startsWith("target/.omp/agents/"))).toEqual([]);
      // The dry-run mutates nothing: the project config stays only in the workspace.
      expect(existsSync(join(target, ".omp", "config.yml"))).toBe(false);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });
});
