#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const executable = "omp";
const policy = path.resolve(__dirname, "native-judge-policy.txt");
const argv = process.argv.slice(2);
const usage = `Usage: node tools/native-judge-launch.cjs [--help] [--dry-run] [--] [OMP arguments...]

Launch OMP with the bundled opt-in judge-first policy.
OMP arguments, including --profile, are forwarded unchanged.
Use -- to forward launcher options such as OMP's --help.
User --append-system-prompt and --append-system-prompt=... are rejected.
--dry-run prints only the executable, policy path, and forwarded argument count.
No installation or global configuration is changed.`;

if (argv.some((arg) => arg === "--append-system-prompt" || arg.startsWith("--append-system-prompt="))) {
  console.error("native-judge-launch: --append-system-prompt conflicts with the bundled policy.");
  process.exitCode = 2;
} else {
  const separator = argv.indexOf("--");
  const options = separator === -1 ? argv : argv.slice(0, separator);
  const forwarded = options.filter((arg) => arg !== "--dry-run" && arg !== "--help" && arg !== "-h");
  if (separator !== -1) forwarded.push(...argv.slice(separator + 1));

  if (options.includes("--help") || options.includes("-h")) {
    console.log(usage);
    console.log(JSON.stringify({ executable, policy, argumentCount: forwarded.length }));
  } else if (options.includes("--dry-run")) {
    console.log(JSON.stringify({ executable, policy, argumentCount: forwarded.length }));
  } else {
    const child = spawn(executable, ["--append-system-prompt", policy, ...forwarded], {
      shell: false,
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
    const handlers = new Map();
    for (const signal of signals) {
      const handler = () => child.kill(signal);
      handlers.set(signal, handler);
      process.on(signal, handler);
    }
    function cleanup() {
      for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    }
    child.once("error", (error) => {
      cleanup();
      console.error(`native-judge-launch: cannot start omp (${error.code || "spawn error"}).`);
      process.exitCode = 1;
    });
    child.once("exit", (code, signal) => {
      cleanup();
      if (signal) {
        process.kill(process.pid, signal);
      } else {
        process.exitCode = code === null ? 1 : code;
      }
    });
  }
}
