#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const TARGET_JUDGE = "typesafe/jev-1.14.0";
const USAGE = "Usage: bun tools/native-judge-setup.cjs [--check|--apply] --config PATH";

function fail(message) {
  const error = new Error(message);
  error.exitCode = 1;
  throw error;
}

function parseArgs(argv) {
  let mode = "check";
  let configPath;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      if (mode === "apply") fail("--check and --apply cannot be combined");
      mode = "check";
    } else if (argument === "--apply") {
      if (mode === "check" && argv.includes("--check")) fail("--check and --apply cannot be combined");
      mode = "apply";
    } else if (argument === "--config") {
      if (configPath !== undefined) fail("--config may be specified only once");
      configPath = argv[++index];
      if (!configPath || configPath.startsWith("--")) fail("--config requires a path");
    } else {
      fail(`unknown argument: ${argument}`);
    }
  }
  if (configPath === undefined) fail(`${USAGE}\nA config path is required; no profile is guessed.`);
  return { mode, configPath: path.resolve(configPath) };
}

function yamlApi() {
  if (!globalThis.Bun || !globalThis.Bun.YAML || typeof globalThis.Bun.YAML.parse !== "function" || typeof globalThis.Bun.YAML.stringify !== "function") {
    fail("Bun YAML support is required; invoke this tool as: bun tools/native-judge-setup.cjs");
  }
  return globalThis.Bun.YAML;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseYaml(bytes, filePath) {
  let value;
  try {
    value = yamlApi().parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    fail(`Cannot safely process config: malformed YAML (${path.basename(filePath)}).`);
  }
  if (!isObject(value)) fail(`Cannot safely process config: top-level YAML value must be an object (${path.basename(filePath)}).`);
  if (value.modelRoles !== undefined && !isObject(value.modelRoles)) {
    fail(`Cannot safely process config: modelRoles must be an object (${path.basename(filePath)}).`);
  }
  return value;
}

function readConfig(configPath) {
  let stat;
  try {
    stat = fs.lstatSync(configPath);
  } catch (error) {
    if (error && error.code === "ENOENT") fail(`Config file is missing; refusing to guess or create it in check mode: ${configPath}`);
    fail(`Cannot safely inspect config: ${error.message}`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`Cannot safely process config: expected a regular file: ${configPath}`);
  const bytes = fs.readFileSync(configPath);
  return { bytes, mode: stat.mode & 0o7777, value: parseYaml(bytes, configPath) };
}

function selectedJudge(value) {
  return value.modelRoles && Object.prototype.hasOwnProperty.call(value.modelRoles, "judge") ? value.modelRoles.judge : undefined;
}

function formatJudge(value) {
  return value === undefined ? "(unset)" : typeof value === "string" && /^[a-zA-Z0-9_./:@+-]{1,200}$/.test(value) ? JSON.stringify(value) : "(invalid selector)";
}

function checkConfig(configPath) {
  const config = readConfig(configPath);
  const judge = selectedJudge(config.value);
  const matches = judge === TARGET_JUDGE;
  process.stdout.write(`selected judge: ${formatJudge(judge)}\nmatch: ${matches ? "yes" : "no"}\n`);
  return { judge, matches };
}

function exclusiveBackup(configPath, bytes) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const suffix = attempt === 0 ? stamp : `${stamp}-${attempt}`;
    const backupPath = `${configPath}.bak.${suffix}`;
    let fd;
    try {
      fd = fs.openSync(backupPath, "wx", 0o600);
      try {
        fs.writeFileSync(fd, bytes);
      } finally {
        fs.closeSync(fd);
        fd = undefined;
      }
      return backupPath;
    } catch (error) {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch {}
      }
      if (error && error.code === "EEXIST") continue;
      try { fs.unlinkSync(backupPath); } catch {}
      throw error;
    }
  }
  fail("Unable to create a unique exclusive config backup.");
}

function atomicWrite(configPath, bytes, mode) {
  const directory = path.dirname(configPath);
  const base = path.basename(configPath);
  let tempPath;
  let fd;
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = path.join(directory, `.${base}.tmp-${process.pid}-${Date.now()}-${attempt}`);
    try {
      fd = fs.openSync(candidate, "wx", 0o600);
      tempPath = candidate;
      break;
    } catch (error) {
      if (error && error.code === "EEXIST") continue;
      throw error;
    }
  }
  if (!tempPath || fd === undefined) fail("Unable to create a unique temporary config file.");
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.chmodSync(tempPath, mode);
    fs.renameSync(tempPath, configPath);
    tempPath = undefined;
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
    if (tempPath) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
  }
}

function stringifyYaml(value) {
  const rendered = yamlApi().stringify(value);
  if (typeof rendered !== "string") fail("Bun YAML stringify returned an invalid value.");
  return Buffer.from(rendered.endsWith("\n") ? rendered : `${rendered}\n`, "utf8");
}

function createMissingConfig(configPath) {
  const directory = path.dirname(configPath);
  let stat;
  try { stat = fs.lstatSync(directory); } catch (error) { fail(`Cannot create config: parent directory does not exist: ${directory}`); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`Cannot create config: parent path is not a real directory: ${directory}`);
  const value = { modelRoles: { judge: TARGET_JUDGE } };
  atomicWrite(configPath, stringifyYaml(value), 0o644);
  return { changed: true, created: true, backupPath: null };
}

function applyConfig(configPath) {
  if (!fs.existsSync(configPath)) return createMissingConfig(configPath);
  const config = readConfig(configPath);
  if (selectedJudge(config.value) === TARGET_JUDGE) {
    process.stdout.write(`judge already selected: ${TARGET_JUDGE}\nno changes written\n`);
    return { changed: false, created: false, backupPath: null };
  }
  const next = { ...config.value, modelRoles: { ...(config.value.modelRoles || {}), judge: TARGET_JUDGE } };
  const backupPath = exclusiveBackup(configPath, config.bytes);
  try {
    atomicWrite(configPath, stringifyYaml(next), config.mode);
  } catch (error) {
    try { fs.unlinkSync(backupPath); } catch {}
    throw error;
  }
  process.stdout.write(`judge set: ${TARGET_JUDGE}\nbackup: ${backupPath}\n`);
  return { changed: true, created: false, backupPath };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.mode === "apply") return applyConfig(options.configPath);
  const result = checkConfig(options.configPath);
  if (!result.matches) process.exitCode = 1;
  return result;
}

module.exports = {
  TARGET_JUDGE,
  USAGE,
  parseArgs,
  parseYaml,
  checkConfig,
  applyConfig,
  atomicWrite,
  exclusiveBackup,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    console.error(USAGE);
    process.exitCode = error && error.exitCode === 2 ? 2 : 1;
  }
}
