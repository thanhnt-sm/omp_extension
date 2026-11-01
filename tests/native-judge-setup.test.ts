import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const scriptPath = path.resolve(import.meta.dir, "../tools/native-judge-setup.cjs");
const bunBin = process.execPath;

function fixture(content?: string): { root: string; config: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), "native-judge-setup-"));
  const config = path.join(root, "config.yaml");
  if (content !== undefined) writeFileSync(config, content);
  return { root, config };
}

function run(args: string[]) {
  return spawnSync(bunBin, [scriptPath, ...args], { encoding: "utf8" });
}

function cleanup(root: string) {
  rmSync(root, { recursive: true, force: true });
}

test("check exits nonzero when the selected judge differs", () => {
  const { root, config } = fixture("modelRoles:\n  judge: openai/decisions\n");
  try {
    const result = run(["--check", "--config", config]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('selected judge: "openai/decisions"\nmatch: no\n');
  } finally { cleanup(root); }
});
test("check does not disclose unrelated configuration values", () => {
  const { root, config } = fixture("modelRoles:\n  judge: typesafe/jev-1.14.0\nprivateSetting: fixture-private-value\n");
  try {
    const before = readFileSync(config);
    const result = run(["--config", config]);
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).not.toContain("fixture-private-value");
    expect(readFileSync(config)).toEqual(before);
    expect(readdirSync(root)).toEqual(["config.yaml"]);
  } finally { cleanup(root); }
});

test("apply preserves unrelated values and creates an exact backup", () => {
  const original = "modelRoles:\n  planner: openai/foo\n  coder: local/bar\nother:\n  keep: true\n";
  const { root, config } = fixture(original);
  try {
    const beforeMode = statSync(config).mode & 0o7777;
    const result = run(["--apply", "--config", config]);
    expect(result.status).toBe(0);
    const backups = readdirSync(root).filter((name) => name.startsWith("config.yaml.bak."));
    expect(backups).toHaveLength(1);
    expect(readFileSync(path.join(root, backups[0]!)).toString()).toBe(original);
    const updated = readFileSync(config, "utf8");
    expect(Bun.YAML.parse(updated)).toEqual({
      modelRoles: { planner: "openai/foo", coder: "local/bar", judge: "typesafe/jev-1.14.0" },
      other: { keep: true },
    });
    expect(statSync(config).mode & 0o7777).toBe(beforeMode);
  } finally { cleanup(root); }
});

test("apply is idempotent and does not create a backup when already configured", () => {
  const { root, config } = fixture("modelRoles:\n  judge: typesafe/jev-1.14.0\n");
  try {
    const before = readFileSync(config);
    const beforeMode = statSync(config).mode & 0o7777;
    const result = run(["--apply", "--config", config]);
    expect(result.status).toBe(0);
    expect(readFileSync(config)).toEqual(before);
    expect(statSync(config).mode & 0o7777).toBe(beforeMode);
    expect(readdirSync(root).filter((name) => name.includes(".bak.")).length).toBe(0);
  } finally { cleanup(root); }
});

test("malformed and unsafe YAML are refused unchanged", () => {
  const cases = ["modelRoles: [\n", "- item\n", "modelRoles: [judge]\n"];
  for (const content of cases) {
    const { root, config } = fixture(content);
    try {
      const result = run(["--apply", "--config", config]);
      expect(result.status).not.toBe(0);
      expect(readFileSync(config).toString()).toBe(content);
      expect(readdirSync(root).some((name) => name.includes(".bak."))).toBe(false);
    } finally { cleanup(root); }
  }
});

test("missing config behavior is explicit and safe", () => {
  const { root, config } = fixture();
  try {
    const checked = run(["--config", config]);
    expect(checked.status).not.toBe(0);
    expect(checked.stderr).toContain("missing");
    const applied = run(["--apply", "--config", config]);
    expect(applied.status).toBe(0);
    expect(readFileSync(config, "utf8")).toContain("judge: typesafe/jev-1.14.0");
  } finally { cleanup(root); }
});

test("apply refuses missing parent and missing explicit config path", () => {
  const { root, config } = fixture();
  try {
    const missingParent = run(["--apply", "--config", path.join(root, "missing", "config.yaml")]);
    expect(missingParent.status).not.toBe(0);
    expect(existsSync(path.join(root, "missing"))).toBe(false);
    const noConfig = run(["--apply"]);
    expect(noConfig.status).not.toBe(0);
    expect(noConfig.stderr).toContain("config path");
  } finally { cleanup(root); }
});
