import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const verifier = path.resolve(import.meta.dir, "../tools/verify-omp-global.cjs");
const oneclick = path.resolve(import.meta.dir, "../tools/oneclick-omp.ps1");
const syntheticKey = "installation-test-synthetic-key-not-a-credential";

function fixture() {
  return mkdtempSync(path.join(os.tmpdir(), "omp-installation-tools-"));
}

function environment(root: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (/^(?:OMP_|TYPESAFE_)|^(?:NODE_OPTIONS|NODE_PATH|BUN_OPTIONS|PI_CODING_AGENT_DIR)$/i.test(name)) delete env[name];
  }
  return {
    ...env,
    TYPESAFE_API_KEY: syntheticKey,
    OMP_WORKSPACE_DIR: root,
    OMP_TARGET_DIR: path.join(root, "target"),
    OMP_HOME_DIR: path.join(root, "home"),
    OMP_EXTENSION_POINTER: path.join(root, "pointer.ts"),
  };
}

for (const args of [["--help"], ["-h"], ["--unsupported-installation-option"], ["--json", "--unsupported-installation-option"]]) {
  test(`verifier handles ${args.join(" ")} before installation filesystem access`, () => {
    const root = fixture();
    try {
      const marker = path.join(root, "filesystem-accessed");
      const preload = path.join(root, "filesystem-guard.cjs");
      writeFileSync(preload, [
        'const fs = require("node:fs");',
        'for (const name of ["existsSync", "lstatSync", "readdirSync"]) {',
        `  fs[name] = () => { fs.writeFileSync(${JSON.stringify(marker)}, name); throw new Error("Unexpected installation filesystem access"); };`,
        '}',
        `global.fetch = () => { fs.writeFileSync(${JSON.stringify(marker)}, "fetch"); throw new Error("Unexpected API call"); };`,
      ].join("\n"));
      const result = spawnSync(process.execPath, ["--require", preload, verifier, ...args], {
        encoding: "utf8",
        env: { ...environment(root), OMP_TARGET_DIR: "invalid-relative-target" },
        timeout: 10_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      if (args.includes("--help") || args.includes("-h")) {
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain("--live");
        expect(result.stdout).toContain("--require-live");
        expect(result.stderr).toBe("");
      } else {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("--unsupported-installation-option");
        expect(result.stdout).toBe("");
      }
      expect(existsSync(marker)).toBe(false);
      expect(result.stdout + result.stderr).not.toContain(syntheticKey);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test("verifier remains offline with an environment API key and reports only installation authority", () => {
  const root = fixture();
  try {
    const env = environment(root);
    const target = env.OMP_TARGET_DIR!;
    const home = env.OMP_HOME_DIR!;
    const src = path.join(target, "src");
    const marker = path.join(root, "api-called");
    mkdirSync(src, { recursive: true });
    mkdirSync(path.join(root, "tools"));
    mkdirSync(path.join(home, ".claude"), { recursive: true });
    writeFileSync(path.join(home, ".claude", ".ck.json"), JSON.stringify({ typesafe: { projects: ["poison-legacy-config"] } }));
    mkdirSync(path.join(home, ".omp", "agent"), { recursive: true });
    writeFileSync(path.join(home, ".omp", "agent", "typesafe.json"), JSON.stringify({ typesafe: { projects: [root] } }));
    writeFileSync(path.join(root, "package.json"), "{}\n");
    writeFileSync(path.join(target, "typesafe-planner.ts"), "export default {};\n");
    writeFileSync(env.OMP_EXTENSION_POINTER!, `export { default } from "${path.join(target, "typesafe-planner.ts").replace(/\\/g, "/")}";\n`);
    for (const name of ["typesafe-enabled-resolver.cjs", "typesafe-redact.cjs", "typesafe-redact-patterns.cjs"]) {
      copyFileSync(path.resolve(import.meta.dir, "../src", name), path.join(src, name));
    }
    const realClient = path.resolve(import.meta.dir, "../src/typesafe-api-client.cjs");
    writeFileSync(path.join(src, "typesafe-api-client.cjs"), [
      `module.exports = { ...require(${JSON.stringify(realClient)}),`,
      `judgeTypeSafe() { require("node:fs").writeFileSync(${JSON.stringify(marker)}, "called"); throw new Error("Offline verification called the API"); } };`,
    ].join("\n"));
    writeFileSync(path.join(root, "tools", "sync-baseline.cjs"), 'console.log("Managed actions: NOOP:fixture");\n');
    writeFileSync(path.join(target, ".sync-manifest.json"), JSON.stringify({
      schemaVersion: 2,
      entries: [{ root: "target", relativePath: "package.json", deployedHash: createHash("sha256").update("{}\n").digest("hex") }],
    }));
    copyFileSync(path.join(root, "package.json"), path.join(target, "package.json"));
    const result = spawnSync(process.execPath, [verifier, "--json"], {
      encoding: "utf8",
      env: { ...env, HOME: home, USERPROFILE: home },
      timeout: 10_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.overallOk).toBe(true);
    expect(report.checks.liveProbe.status).toBe("skipped");
    expect(report.verificationScope).toEqual({
      diskChecks: "VERIFIED",
      extensionHttpTransport: "NOT_VERIFIED",
      nativeJudge: "NOT_VERIFIED",
      loadedCode: "NOT_VERIFIED",
      semanticAuthority: "NOT_VERIFIED",
    });
    expect(existsSync(marker)).toBe(false);
    expect(readFileSync(path.join(home, ".claude", ".ck.json"), "utf8")).toContain("poison-legacy-config");
    expect(result.stdout + result.stderr).not.toContain(syntheticKey);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("verifier reports schema migration without probing legacy Claude paths", () => {
  const root = fixture();
  try {
    const env = environment(root);
    const target = env.OMP_TARGET_DIR!;
    const home = env.OMP_HOME_DIR!;
    const legacy = path.join(home, ".claude", "hooks", "lib", "typesafe-enabled-resolver.cjs");
    const guard = path.join(root, "legacy-io-guard.cjs");
    mkdirSync(target, { recursive: true });
    mkdirSync(path.dirname(legacy), { recursive: true });
    writeFileSync(legacy, "legacy content\n");
    writeFileSync(path.join(target, "typesafe-planner.ts"), "export default {};");
    writeFileSync(env.OMP_EXTENSION_POINTER!, `export { default } from "${path.join(target, "typesafe-planner.ts").replace(/\\/g, "/")}";\n`);
    writeFileSync(path.join(target, ".sync-manifest.json"), JSON.stringify({
      schemaVersion: 1,
      entries: [
        { root: "target", relativePath: "typesafe-planner.ts", deployedHash: createHash("sha256").update("export default {};").digest("hex") },
        { root: "global_claude", relativePath: "hooks/lib/typesafe-enabled-resolver.cjs", deployedHash: createHash("sha256").update("legacy content\n").digest("hex") },
      ],
    }));
    writeFileSync(guard, [
      'const fs = require("node:fs");',
      'const path = require("node:path");',
      `const forbidden = ${JSON.stringify(path.resolve(home, ".claude").toLowerCase())};`,
      'const guard = (original) => function guardedLegacyIO(...args) { const value = typeof args[0] === "string" ? path.resolve(args[0]).toLowerCase() : ""; if (value === forbidden || value.startsWith(forbidden + path.sep)) throw new Error("legacy Claude IO"); return original.apply(this, args); };',
      'for (const name of ["existsSync", "lstatSync", "realpathSync", "readFileSync", "openSync", "statSync", "readdirSync"]) {',
      '  const original = fs[name];',
      '  fs[name] = guard(original);',
      '  if (name === "realpathSync") fs[name].native = guard(original.native);',
      '}',
    ].join("\n"));
    const result = spawnSync(process.execPath, ["--require", guard, verifier, "--json"], {
      encoding: "utf8",
      env: { ...env, HOME: home, USERPROFILE: home },
      timeout: 10_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.checks.manifest.status).toBe("MIGRATION_REQUIRED");
    expect(report.checks.manifest.reason).toContain("requires migration");
    expect(readFileSync(legacy, "utf8")).toBe("legacy content\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test.skipIf(process.platform !== "win32")("oneclick Auto propagates a failed second verifier without success or promotion", () => {
  const root = fixture();
  try {
    const tools = path.join(root, "tools");
    mkdirSync(tools);
    const script = path.join(tools, "oneclick-omp.ps1");
    const invocations = path.join(root, "verifier-invocations.json");
    const promotion = path.join(root, "promotion-called");
    copyFileSync(oneclick, script);
    writeFileSync(path.join(tools, "verify-omp-global.cjs"), [
      'const fs = require("node:fs");',
      `const file = ${JSON.stringify(invocations)};`,
      'const calls = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];',
      'calls.push(process.argv.slice(2)); fs.writeFileSync(file, JSON.stringify(calls));',
      'if (calls.length === 1) { console.log(JSON.stringify({ overallOk: true })); process.exit(0); }',
      'process.exit(7);',
    ].join("\n"));
    writeFileSync(path.join(tools, "promote-omp-global.ps1"), `Set-Content -LiteralPath '${promotion.replace(/'/g, "''")}' -Value 'called'\nexit 0\n`);
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Mode", "Auto"], {
      encoding: "utf8",
      env: environment(root),
      timeout: 20_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(7);
    expect(JSON.parse(readFileSync(invocations, "utf8"))).toEqual([["--json"], []]);
    expect(result.stdout + result.stderr).not.toContain("[OK]");
    expect(existsSync(promotion)).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
