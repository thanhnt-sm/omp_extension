import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import * as policy from "../src/typesafe-child-env.cjs";
const helper = path.resolve(import.meta.dir, "../src/typesafe-child-env.cjs");
function hostSource(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv { return { ...process.env, ...extra }; }
const forbidden = ["TYPESAFE_API_KEY", "ANTHROPIC_API_KEY", "CLAUDE_TOKEN", "AWS_SECRET_ACCESS_KEY", "DATABASE_URL", "FOREIGN_CUSTOM", "HTTPS_PROXY", "NODE_OPTIONS", "BUN_OPTIONS", "NODE_PATH", "BASH_ENV", "ENV", "GIT_CONFIG_COUNT", "LD_PRELOAD", "DYLD_INSERT_LIBRARIES", "HOME", "USERPROFILE", "XDG_CONFIG_HOME", "OMP_FAULT_INJECT", "OMP_SKIP_VERIFY_TESTS", "OMP_WORKSPACE_DIR"];

test("real child receives minimal policy rather than provider, hook, proxy, home or arbitrary variables", () => {
  const source = hostSource(Object.fromEntries(forbidden.map((name) => [name, "sentinel-private-config"])));
  for (const purpose of ["verification", "egc-setup"] as const) {
    const built = policy.buildChildEnvironment(purpose, source);
    for (const name of forbidden) if (name !== "GIT_CONFIG_COUNT") expect(Object.prototype.hasOwnProperty.call(built, name), `${purpose}:${name}`).toBe(false);
  }
  const probe = `const names=${JSON.stringify(forbidden)}; console.log(JSON.stringify(names.map(name=>process.env[name]==='sentinel-private-config')))`;
  for (const purpose of ["verification", "egc-setup", "evidence-git", "deployment-acl", "deployment-verify", "pointer-editor"] as const) {
    const result = policy.execFileChildSync(purpose, process.execPath, ["-e", probe], { encoding: "utf8", source });
    expect(JSON.parse(result)).toEqual(forbidden.map(() => false));
  }
});

test("case collisions, missing OS resolution, unknown purposes and secret-bearing allowed values fail closed", () => {
  expect(() => policy.buildChildEnvironment("verification", hostSource({ PATH: "one", path: "two" }))).toThrow("CASE_COLLISION");
  // @ts-expect-error Deliberately crossing the runtime unknown-purpose boundary.
  expect(() => policy.buildChildEnvironment("unknown")).toThrow("UNKNOWN_PURPOSE");
  expect(() => policy.buildChildEnvironment("verification", {})).toThrow("MISSING_REQUIRED_OS_VALUE");
  const sameCase = hostSource();
  const hostPath = Object.keys(sameCase).find((name) => name.toUpperCase() === "PATH");
  if (!hostPath) throw new Error("Host PATH is required for this OS probe");
  sameCase.PATH = sameCase[hostPath]; sameCase.path = sameCase[hostPath];
  const canonical = policy.buildChildEnvironment("verification", sameCase);
  expect(Object.keys(canonical).filter((name) => name.toUpperCase() === "PATH")).toEqual(["PATH"]);
  const source = hostSource({ TYPESAFE_API_KEY: "bare-private-token" });
  const pathName = Object.keys(source).find((name) => name.toUpperCase() === "PATH");
  if (!pathName) throw new Error("Host PATH is required for this OS probe");
  source[pathName] = `${source[pathName]}${path.delimiter}bare-private-token`;
  expect(() => policy.buildChildEnvironment("verification", source)).toThrow("UNSAFE_ALLOWED_VALUE");
  const spaced = hostSource({ TYPESAFE_API_KEY: " bare-private-token " });
  spaced[pathName] = `${spaced[pathName]}${path.delimiter}bare-private-token`;
  expect(() => policy.buildChildEnvironment("verification", spaced)).toThrow("UNSAFE_ALLOWED_VALUE");
  let getterCalls = 0;
  const accessor: NodeJS.ProcessEnv = {};
  Object.defineProperty(accessor, "PATH", { enumerable: true, get() { getterCalls++; return "unsafe"; } });
  expect(() => policy.buildChildEnvironment("verification", accessor)).toThrow("INVALID_SOURCE");
  expect(getterCalls).toBe(0);
  // @ts-expect-error A caller env is forbidden by both the published type and runtime policy.
  expect(() => policy.execFileChildSync("verification", process.execPath, [], { encoding: "utf8", env: {} })).toThrow("CALLER_ENV_FORBIDDEN");
});

test("deployment-sync alone admits validated overrides and no skip or fault controls", () => {
  const source = hostSource({ OMP_WORKSPACE_DIR: path.resolve("."), OMP_TARGET_DIR: path.resolve("../target"), OMP_BUN_BIN: process.execPath, OMP_FAULT_INJECT: "before_verify", OMP_SKIP_VERIFY_TESTS: "1" });
  const sync = policy.buildChildEnvironment("deployment-sync", source);
  expect(sync.OMP_WORKSPACE_DIR).toBe(source.OMP_WORKSPACE_DIR);
  expect(sync.OMP_BUN_BIN).toBe(process.execPath);
  expect(sync.OMP_FAULT_INJECT).toBeUndefined();
  expect(sync.OMP_SKIP_VERIFY_TESTS).toBeUndefined();
  expect(policy.buildChildEnvironment("deployment-verify", source).OMP_WORKSPACE_DIR).toBeUndefined();
  expect(() => policy.buildChildEnvironment("deployment-sync", hostSource({ OMP_TARGET_DIR: "relative/target" }))).toThrow("INVALID_DEPLOYMENT_PATH");
});

test("owned verifier home is fresh and cannot be substituted by parent home/config", () => {
  const home = policy.createVerificationHome();
  const env = home.environment("verification", hostSource({ HOME: "unsafe-parent", USERPROFILE: "unsafe-parent", XDG_CONFIG_HOME: "unsafe-parent" }));
  expect(env.HOME).not.toBe("unsafe-parent");
  expect(env.HOME).toBe(env.USERPROFILE);
  expect(existsSync(env.HOME!)).toBe(true);
  // @ts-expect-error Only owned verification purposes can obtain a home.
  expect(() => home.environment("evidence-git")).toThrow("HOME_PURPOSE_FORBIDDEN");
  home.cleanup();
  expect(existsSync(env.HOME!)).toBe(false);
  expect(() => home.environment("verification")).toThrow();
});

test("ordinary Git, command output, nonzero exits and timeout retain process semantics", () => {
  expect(policy.execFileChildSync("evidence-git", "git", ["--version"], { encoding: "utf8" })).toContain("git version");
  expect(policy.execFileChildSync("evidence-git", "git", ["config", "--get", "core.fsmonitor"], { encoding: "utf8" }).trim()).toBe("false");
  expect(policy.execFileChildSync("evidence-git", "git", ["config", "--get", "core.hooksPath"], { encoding: "utf8" }).trim()).toBe(process.platform === "win32" ? "NUL" : "/dev/null");
  expect(policy.execFileChildSync("verification", process.execPath, ["-e", 'process.stdout.write("authorized-output")'], { encoding: "utf8" })).toBe("authorized-output");
  expect(() => policy.execFileChildSync("verification", process.execPath, ["-e", "process.exit(7)"], { encoding: "utf8" })).toThrow();
  // This deliberately exercises the real OS timeout; fake timers cannot terminate another process.
  expect(() => policy.execFileChildSync("verification", process.execPath, ["-e", "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0)"], { encoding: "utf8", timeout: 50 })).toThrow();
});

test("async adapter preserves native abort cancellation", async () => {
  const controller = new AbortController();
  const child = policy.spawnChild("verification", process.execPath, ["-e", "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0)"], { signal: controller.signal, stdio: "ignore" });
  const error = new Promise<Error>((resolve, reject) => { child.once("error", resolve); child.once("exit", (code) => { if (code === 0) reject(new Error("Unexpected successful cancellation")); }); });
  child.once("spawn", () => controller.abort());
  expect((await error).name).toBe("AbortError");
});

test("policy CLI exposes constraints only and never executes caller commands", () => {
  const result = spawnSync(process.execPath, [helper, "--policy-json", "deployment-sync"], { encoding: "utf8", env: { TYPESAFE_API_KEY: "bootstrap-secret", FOREIGN_CUSTOM: "private-prose" } });
  expect(result.status).toBe(0);
  const rules: { version: number; purpose: string; names: string[]; absolutePaths: string[] } = JSON.parse(result.stdout);
  expect(rules.version).toBe(1);
  expect(rules.purpose).toBe("deployment-sync");
  expect(rules.names).toContain("OMP_BUN_BIN");
  expect(rules.absolutePaths).toContain("OMP_TARGET_DIR");
  expect(result.stdout).not.toContain("bootstrap-secret");
  expect(result.stdout).not.toContain("private-prose");
  expect(spawnSync(process.execPath, [helper, "--policy-json", "verification", "-e", "process.exit(0)"], { encoding: "utf8", env: {} }).status).toBe(1);
});

test("synchronous spawn preserves successful stderr, failed status and policy isolation", () => {
  for (const exitCode of [0, 7]) {
    const child = policy.spawnChildSync("egc-setup", process.execPath, ["-e", `process.stdout.write("authorized stdout");process.stderr.write("authorized stderr");process.exit(${exitCode})`], { encoding: "utf8" });
    expect(child.status).toBe(exitCode);
    expect(child.stdout).toBe("authorized stdout");
    expect(child.stderr).toBe("authorized stderr");
  }
  const source = hostSource({ TYPESAFE_API_KEY: "private-spawn-secret", FOREIGN_CUSTOM: "private-spawn-config", HOME: "private-parent-home", USERPROFILE: "private-parent-home" });
  const child = policy.spawnChildSync("egc-setup", process.execPath, ["-e", 'console.log(JSON.stringify(["TYPESAFE_API_KEY","FOREIGN_CUSTOM","HOME","USERPROFILE"].map(name=>["private-spawn-secret","private-spawn-config","private-parent-home"].includes(process.env[name] ?? ""))))'], { encoding: "utf8", source });
  expect(child.status).toBe(0);
  expect(JSON.parse(child.stdout)).toEqual([false, false, false, false]);
  const shell = policy.spawnChildSync("egc-setup", "git --version", [], { shell: true, encoding: "utf8" });
  expect(shell.status).toBe(0);
  expect(shell.stdout).toContain("git version");
});

test("RT#13: named secrets and long suffix-matched secrets are rejected in allowlisted values while short flags are allowed", () => {
  const baseEnv = hostSource();
  const pathKey = Object.keys(baseEnv).find((name) => name.toUpperCase() === "PATH");
  if (!pathKey) throw new Error("Host PATH is required");

  // (a) GITHUB_TOKEN="ghp_" + 32 chars appended to PATH -> UNSAFE_ALLOWED_VALUE
  const ghToken = "ghp_" + "a".repeat(32);
  const srcA = hostSource({ GITHUB_TOKEN: ghToken });
  srcA[pathKey] = `${srcA[pathKey]}${path.delimiter}${ghToken}`;
  expect(() => policy.buildChildEnvironment("verification", srcA)).toThrow("UNSAFE_ALLOWED_VALUE");

  // (b) MY_SERVICE_SECRET (16 chars) inside TEMP -> UNSAFE_ALLOWED_VALUE
  const svcSecret = "secret_val_12345";
  const srcB = hostSource({ MY_SERVICE_SECRET: svcSecret, TEMP: `/tmp/${svcSecret}` });
  expect(() => policy.buildChildEnvironment("verification", srcB)).toThrow("UNSAFE_ALLOWED_VALUE");

  // (c) CI_FLAG_TOKEN="1" does not reject a PATH containing "1"
  const srcC = hostSource({ CI_FLAG_TOKEN: "1" });
  srcC[pathKey] = `${srcC[pathKey]}${path.delimiter}C:\\bin1`;
  expect(() => policy.buildChildEnvironment("verification", srcC)).not.toThrow();

  // (d) createVerificationHome().environment("verification", src) rejects case (a)
  const home = policy.createVerificationHome();
  try {
    expect(() => home.environment("verification", srcA)).toThrow("UNSAFE_ALLOWED_VALUE");
  } finally {
    home.cleanup();
  }
});
